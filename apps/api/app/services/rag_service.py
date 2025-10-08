import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI

from ..core.config import settings
from .embedding_service import embedding_service
from .qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self):
        self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
        self.max_context_length = 4000  # Maximum context length for RAG
        
    async def generate_response(
        self,
        query: str,
        course_id: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Generate AI response using RAG"""
        
        if not self.openai_client:
            return {
                "response": "I apologize, but the AI service is not currently available. Please check the configuration.",
                "sources": []
            }
        
        try:
            # Step 1: Create embedding for the query
            query_embedding = await embedding_service.create_embedding(query)
            
            if not query_embedding:
                return {
                    "response": "I'm having trouble understanding your question. Could you please rephrase it?",
                    "sources": []
                }
            
            # Step 2: Search for relevant content
            relevant_content = await qdrant_service.search_similar_content(
                query_embedding=query_embedding,
                course_id=course_id,
                limit=5
            )
            
            # REMOVED: Fallback to general search - this was causing cross-course contamination
            # We want strict course isolation, so if no content found in course, return empty
            if course_id:
                logger.info(f"DEBUG RAG: Strict course filtering - found {len(relevant_content)} items in course {course_id}")
            
            # Step 3: Filter content by relevance threshold
            relevance_threshold = 0.7  # Only use content with >70% relevance
            
            # Debug logging
            logger.info(f"DEBUG RAG: Query='{query}', Course ID={course_id}")
            logger.info(f"DEBUG RAG: Retrieved {len(relevant_content)} pieces of content from Qdrant")
            
            if not relevant_content:
                logger.info("DEBUG RAG: No content retrieved from Qdrant - returning apology")
                return {
                    "response": "I apologize, but I don't have any relevant course materials to answer your question. Please ask questions related to the topics covered in this course, or contact your instructor for additional help.",
                    "sources": []
                }
            
            for i, content in enumerate(relevant_content):
                score = content.get("score", 0)
                title = content.get("metadata", {}).get("title", "Unknown")
                text_preview = content.get("text", "")[:100] + "..." if len(content.get("text", "")) > 100 else content.get("text", "")
                logger.info(f"DEBUG RAG: Content {i}: score={score:.4f}, title='{title}', text='{text_preview}'")
            
            filtered_content = [
                content for content in relevant_content 
                if content.get("score", 0) >= relevance_threshold
            ]
            
            logger.info(f"DEBUG RAG: After filtering with threshold {relevance_threshold}: {len(filtered_content)} pieces remain")
            
            # Step 4: Check if we have sufficient context
            if not filtered_content:
                return {
                    "response": "I apologize, but I don't have enough relevant information in the course materials to answer your question. Please ask questions related to the topics covered in this course, or contact your instructor for additional help.",
                    "sources": []
                }
            
            # Step 5: Build context from relevant content
            context = self._build_context(filtered_content)
            
            # Step 6: Build conversation history context
            history_context = self._build_history_context(conversation_history)
            
            # Step 7: Generate response using OpenAI
            logger.info(f"DEBUG RAG: Built context length: {len(context)} characters")
            logger.info(f"DEBUG RAG: Context preview: {context[:200]}..." if len(context) > 200 else f"DEBUG RAG: Full context: {context}")
            
            ai_response = await self._generate_openai_response(
                query=query,
                context=context,
                history_context=history_context,
                course_id=course_id
            )
            
            # Check if AI response indicates no information available
            no_info_indicators = [
                "don't have enough information",
                "don't have sufficient information", 
                "no information available",
                "not enough information",
                "insufficient information",
                "don't have relevant",
                "no relevant information",
                "cannot answer",
                "can't answer",
                "don't have any relevant",
                "unable to answer",
                "outside the scope",
                "not covered in",
                "ask questions related to",
                "contact your instructor",
                "please ask questions",
                "i apologize",
                "experiencing technical difficulties"
            ]
            
            ai_response_lower = ai_response.lower()
            has_no_info = any(indicator in ai_response_lower for indicator in no_info_indicators)
            
            logger.info(f"DEBUG RAG: AI response indicates no info: {has_no_info}")
            
            # Format sources for frontend (only unique material names)
            # But don't include sources if AI says there's no information OR if no relevant content found
            sources = []
            if not has_no_info and filtered_content:
                seen_titles = set()
                for content in filtered_content:
                    title = content.get("metadata", {}).get("title", "Unknown")
                    # Only add unique source titles
                    if title not in seen_titles:
                        seen_titles.add(title)
                        sources.append({
                            "title": title,
                            "content_type": content.get("metadata", {}).get("content_type", "text"),
                            "chunk_text": content.get("text", "")[:200] + "..." if len(content.get("text", "")) > 200 else content.get("text", ""),
                            "score": content.get("score", 0),
                            "course_id": content.get("metadata", {}).get("course_id"),
                            "metadata": {
                                "filename": content.get("metadata", {}).get("filename"),
                                "source_url": content.get("metadata", {}).get("source_url"),
                                "chunk_index": content.get("metadata", {}).get("chunk_index")
                            }
                        })
            
            logger.info(f"DEBUG RAG: Returning {len(sources)} sources with response")
            
            return {
                "response": ai_response,
                "sources": sources
            }
            
        except Exception as e:
            logger.error(f"Error in RAG generation: {e}")
            return {
                "response": "I apologize, but I encountered an error while processing your question. Please try again.",
                "sources": []
            }
    
    def _build_context(self, relevant_content: List[Dict[str, Any]]) -> str:
        """Build context string from relevant content"""
        if not relevant_content:
            return ""
        
        context_parts = []
        total_length = 0
        
        for content in relevant_content:
            text = content.get("text", "")
            metadata = content.get("metadata", {})
            
            # Add metadata for better context
            content_type = metadata.get("content_type", "")
            title = metadata.get("title", "")
            
            content_header = f"[{content_type.upper()}]"
            if title:
                content_header += f" {title}:"
            
            content_text = f"{content_header}\n{text}\n"
            
            if total_length + len(content_text) > self.max_context_length:
                break
                
            context_parts.append(content_text)
            total_length += len(content_text)
        
        return "\n".join(context_parts)
    
    def _build_history_context(self, conversation_history: Optional[List[Dict[str, str]]]) -> str:
        """Build context from conversation history"""
        if not conversation_history:
            return ""
        
        # Take only last few messages to avoid context overflow
        recent_history = conversation_history[-6:]  # Last 6 messages (3 exchanges)
        
        history_parts = []
        for msg in recent_history:
            sender = msg.get("sender", "")
            content = msg.get("content", "")
            if sender and content:
                history_parts.append(f"{sender}: {content}")
        
        return "\n".join(history_parts) if history_parts else ""
    
    async def _generate_openai_response(
        self,
        query: str,
        context: str,
        history_context: str,
        course_id: Optional[str] = None
    ) -> str:
        """Generate response using OpenAI"""
        
        # Build system prompt
        system_prompt = self._build_system_prompt(course_id)
        
        # Build user prompt with context
        user_prompt = self._build_user_prompt(query, context, history_context)
        
        try:
            logger.info(f"DEBUG RAG: System prompt: {system_prompt[:300]}...")
            logger.info(f"DEBUG RAG: User prompt: {user_prompt[:300]}...")
            
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",  # or "gpt-4" if available
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=500,
                temperature=0.7
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            return "I'm experiencing technical difficulties. Please try again in a moment."
    
    def _build_system_prompt(self, course_id: Optional[str] = None) -> str:
        """Build system prompt for the AI"""
        
        base_prompt = """You are an AI tutor for the KSAI Education Platform. You MUST follow these strict guidelines:

CRITICAL RULES:
1. ONLY answer questions using the provided course materials context
2. DO NOT provide general knowledge or information outside the context
3. If the context doesn't contain sufficient information, clearly state that you cannot answer
4. NEVER make up or infer information not explicitly in the context

Your responses should:
- Be based EXCLUSIVELY on the provided course materials
- Reference specific parts of the materials when answering
- Be clear and educational within the scope of provided content
- Suggest students ask their instructor for topics not covered in materials

REMEMBER: You are a course-specific tutor, not a general knowledge assistant."""

        if course_id:
            base_prompt += f"\n\nYou are currently assisting with course materials. Focus your responses on topics relevant to this course."
        
        return base_prompt
    
    def _build_user_prompt(self, query: str, context: str, history_context: str) -> str:
        """Build user prompt with context"""
        
        prompt_parts = []
        
        if context:
            prompt_parts.append(f"RELEVANT COURSE MATERIALS:\n{context}\n")
        
        if history_context:
            prompt_parts.append(f"CONVERSATION HISTORY:\n{history_context}\n")
        
        prompt_parts.append(f"STUDENT QUESTION: {query}")
        
        if context:
            prompt_parts.append("\nIMPORTANT: Answer the student's question ONLY using the course materials provided above. If the materials don't contain the information needed to answer the question, respond with: 'I don't have enough information in the course materials to answer this question. Please ask questions related to the topics covered in the provided materials or contact your instructor for additional help.'")
        else:
            prompt_parts.append("\nSince no relevant course materials are available for this question, respond with: 'I don't have relevant course materials to answer this question. Please ask questions related to the topics covered in this course or contact your instructor for help.'")
        
        return "\n".join(prompt_parts)
    
    async def generate_practice_questions(
        self,
        topic: str,
        course_id: Optional[str] = None,
        difficulty_level: str = "medium",
        question_count: int = 5
    ) -> List[Dict[str, Any]]:
        """Generate practice questions for a topic"""
        
        if not self.openai_client:
            return []
        
        try:
            # Get relevant content for the topic
            topic_embedding = await embedding_service.create_embedding(topic)
            
            context = ""
            if topic_embedding:
                relevant_content = await qdrant_service.search_similar_content(
                    query_embedding=topic_embedding,
                    course_id=course_id,
                    limit=3
                )
                context = self._build_context(relevant_content)
            
            # Generate questions
            prompt = self._build_question_generation_prompt(
                topic, context, difficulty_level, question_count
            )
            
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert question generator for educational content."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1000,
                temperature=0.8
            )
            
            # Parse response to extract questions
            questions_text = response.choices[0].message.content.strip()
            questions = self._parse_generated_questions(questions_text)
            
            return questions
            
        except Exception as e:
            logger.error(f"Error generating practice questions: {e}")
            return []
    
    def _build_question_generation_prompt(
        self,
        topic: str,
        context: str,
        difficulty_level: str,
        question_count: int
    ) -> str:
        """Build prompt for question generation"""
        
        prompt = f"""Generate {question_count} practice questions about "{topic}" at {difficulty_level} difficulty level.

"""
        
        if context:
            prompt += f"Based on this course material:\n{context}\n\n"
        
        prompt += f"""Format each question as follows:
Question: [question text]
Type: [multiple_choice|true_false|short_answer]
Options: [for multiple choice, list A), B), C), D)]
Answer: [correct answer]
Explanation: [brief explanation of the answer]

Guidelines:
- Make questions educational and thought-provoking
- Ensure questions test understanding, not just memorization
- Vary question types
- Provide clear, accurate answers
- Keep explanations concise but helpful"""

        return prompt
    
    def _parse_generated_questions(self, questions_text: str) -> List[Dict[str, Any]]:
        """Parse generated questions text into structured format"""
        
        questions = []
        current_question = {}
        
        lines = questions_text.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if line.startswith('Question:'):
                if current_question:
                    questions.append(current_question)
                current_question = {'question': line[9:].strip()}
                
            elif line.startswith('Type:'):
                current_question['type'] = line[5:].strip()
                
            elif line.startswith('Options:'):
                current_question['options'] = line[8:].strip()
                
            elif line.startswith('Answer:'):
                current_question['answer'] = line[7:].strip()
                
            elif line.startswith('Explanation:'):
                current_question['explanation'] = line[12:].strip()
        
        # Add the last question
        if current_question:
            questions.append(current_question)
        
        return questions


# Singleton instance
rag_service = RAGService()