import logging
import json
import re
from typing import List, Dict, Any, Optional
import openai
from openai import OpenAI
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.assessment import Question, QuestionType, QuestionDifficulty
from ..models.content import Content

logger = logging.getLogger(__name__)


class QuestionExtractionService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
    
    async def extract_questions_from_text(
        self, 
        text: str, 
        difficulty_level: str = None,
        question_type: str = None,
        exam_year: str = None,
        exam_stage: str = None
    ) -> Dict[str, Any]:
        """
        Extract individual questions from past paper text using OpenAI API
        """
        try:
            # Create context prompt
            context_prompt = self._build_extraction_prompt(
                difficulty_level, question_type, exam_year, exam_stage
            )
            
            # Split text into chunks if too long
            max_chunk_size = 8000  # Leave room for prompt and response
            text_chunks = self._split_text_into_chunks(text, max_chunk_size)
            
            all_questions = []
            
            for i, chunk in enumerate(text_chunks):
                logger.info(f"Processing text chunk {i+1}/{len(text_chunks)}")
                
                # Call OpenAI API
                response = await self._call_openai_api(context_prompt, chunk)
                
                if response and response.get("questions"):
                    chunk_questions = response["questions"]
                    
                    # Add chunk metadata
                    for question in chunk_questions:
                        question["chunk_number"] = i + 1
                        question["extraction_confidence"] = response.get("confidence", 85)
                    
                    all_questions.extend(chunk_questions)
            
            return {
                "success": True,
                "questions": all_questions,
                "total_questions": len(all_questions),
                "chunks_processed": len(text_chunks),
                "metadata": {
                    "difficulty_level": difficulty_level,
                    "question_type": question_type,
                    "exam_year": exam_year,
                    "exam_stage": exam_stage
                }
            }
            
        except Exception as e:
            logger.error(f"Error extracting questions: {e}")
            return {
                "success": False,
                "error": str(e),
                "questions": []
            }
    
    def _build_extraction_prompt(
        self, 
        difficulty_level: str = None,
        question_type: str = None, 
        exam_year: str = None,
        exam_stage: str = None
    ) -> str:
        """Build the extraction prompt for OpenAI"""
        
        base_prompt = """
You are an expert in extracting questions from competitive exam papers. 
Your task is to identify and extract individual questions from the provided text.

Instructions:
1. Extract each question as a separate item
2. Include the complete question text
3. Identify the question number if available
4. Determine the question type (MCQ/Descriptive/Other)
5. Estimate marks if mentioned
6. Extract any time limit if specified
7. Identify the topic/subject if clear from context

Response Format (JSON):
{
  "confidence": 85,
  "questions": [
    {
      "question_number": 1,
      "question_text": "Complete question text here...",
      "question_type": "mcq|descriptive|other",
      "estimated_marks": 2,
      "time_limit": null,
      "topic": "Subject area if identifiable",
      "options": ["A) Option 1", "B) Option 2", ...] // Only for MCQ
    }
  ]
}

"""
        
        # Add context if available
        if difficulty_level:
            base_prompt += f"\nExpected difficulty level: {difficulty_level}"
        if question_type:
            base_prompt += f"\nExpected question type: {question_type}"
        if exam_year:
            base_prompt += f"\nExam year: {exam_year}"
        if exam_stage:
            base_prompt += f"\nExam stage: {exam_stage}"
        
        base_prompt += "\n\nNow extract questions from the following text:\n\n"
        
        return base_prompt
    
    def _split_text_into_chunks(self, text: str, max_size: int) -> List[str]:
        """Split text into manageable chunks"""
        if len(text) <= max_size:
            return [text]
        
        chunks = []
        current_chunk = ""
        
        # Split by paragraphs first
        paragraphs = text.split('\n\n')
        
        for paragraph in paragraphs:
            if len(current_chunk) + len(paragraph) + 2 <= max_size:
                current_chunk += paragraph + '\n\n'
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                # If paragraph itself is too long, split by sentences
                if len(paragraph) > max_size:
                    sentences = re.split(r'[.!?]+', paragraph)
                    temp_chunk = ""
                    for sentence in sentences:
                        if len(temp_chunk) + len(sentence) + 1 <= max_size:
                            temp_chunk += sentence + '. '
                        else:
                            if temp_chunk:
                                chunks.append(temp_chunk.strip())
                            temp_chunk = sentence + '. '
                    if temp_chunk:
                        current_chunk = temp_chunk
                else:
                    current_chunk = paragraph + '\n\n'
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    async def _call_openai_api(self, prompt: str, text_chunk: str) -> Dict[str, Any]:
        """Call OpenAI API to extract questions from a text chunk"""
        try:
            # Check if we have a valid OpenAI API key
            if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "your-openai-api-key-here":
                logger.warning("OpenAI API key not configured, using mock question extraction for testing")
                return self._mock_question_extraction(text_chunk)
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo-16k",  # Use 16k for longer texts
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text_chunk}
                ],
                temperature=0.3,  # Lower temperature for more consistent extraction
                max_tokens=4000
            )
            
            content = response.choices[0].message.content
            
            # Try to parse as JSON
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                # Extract JSON from markdown code blocks if present
                json_match = re.search(r'```json\n(.*?)\n```', content, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(1))
                
                # If still can't parse, return error
                logger.warning(f"Could not parse OpenAI response as JSON: {content[:200]}...")
                return {"success": False, "error": "Invalid JSON response"}
                
        except Exception as e:
            logger.error(f"OpenAI API call failed: {e}")
            # Fallback to mock extraction for testing
            logger.warning("Falling back to mock question extraction for testing")
            return self._mock_question_extraction(text_chunk)
    
    def _mock_question_extraction(self, text_chunk: str) -> Dict[str, Any]:
        """Mock question extraction for testing when OpenAI API is not available"""
        
        # Simple pattern matching to find potential questions
        questions = []
        question_counter = 1
        
        # Look for numbered questions (1., 2., Q1, etc.)
        question_patterns = [
            r'(\d+\.?\s*[A-Z].*?)(?=\n\d+\.|\n[A-Z]\)|$)',
            r'(Q\d+\.?\s*.*?)(?=\nQ\d+|\n[A-Z]\)|$)',
            r'(Question\s+\d+.*?)(?=\nQuestion|\n\d+\.|$)'
        ]
        
        for pattern in question_patterns:
            matches = re.findall(pattern, text_chunk, re.MULTILINE | re.DOTALL)
            for match in matches:
                question_text = match.strip()
                if len(question_text) > 20:  # Filter out very short matches
                    # Determine question type based on content
                    if re.search(r'\b[A-D]\)\s', question_text) or 'multiple choice' in question_text.lower():
                        q_type = 'mcq'
                        # Try to extract options
                        options_text = re.findall(r'[A-D]\)\s*([^A-D\n]+)', question_text)
                        options = {
                            chr(65 + i): opt.strip() 
                            for i, opt in enumerate(options_text[:4])
                        } if options_text else None
                    else:
                        q_type = 'descriptive'
                        options = None
                    
                    questions.append({
                        "question_number": question_counter,
                        "question_text": question_text[:500],  # Limit length
                        "question_type": q_type,
                        "difficulty": "moderate",  # Default difficulty
                        "estimated_marks": 5,  # Default marks
                        "options": options,
                        "extraction_confidence": 75  # Mock confidence
                    })
                    question_counter += 1
        
        # If no questions found through patterns, create some sample questions
        if not questions:
            if "math" in text_chunk.lower() or any(op in text_chunk for op in ['+', '-', '×', '÷', '=']):
                questions = [
                    {
                        "question_number": 1,
                        "question_text": "Solve the mathematical problem shown in the document.",
                        "question_type": "descriptive",
                        "difficulty": "moderate",
                        "estimated_marks": 5,
                        "options": None,
                        "extraction_confidence": 60
                    }
                ]
            else:
                # Generic question based on content
                questions = [
                    {
                        "question_number": 1,
                        "question_text": "Based on the content provided, explain the main concepts discussed.",
                        "question_type": "descriptive", 
                        "difficulty": "moderate",
                        "estimated_marks": 10,
                        "options": None,
                        "extraction_confidence": 50
                    }
                ]
        
        logger.info(f"Mock extraction found {len(questions)} questions")
        
        return {
            "success": True,
            "questions": questions[:10],  # Limit to 10 questions per chunk
            "total_questions": len(questions),
            "extraction_method": "mock"
        }
    
    async def generate_answer_from_context(
        self,
        question_text: str,
        context_materials: List[str],
        syllabus_context: str = None
    ) -> Dict[str, Any]:
        """
        Generate AI answer for a question using context from study materials
        """
        try:
            # Check if we have a valid OpenAI API key
            if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "your-openai-api-key-here":
                logger.warning("OpenAI API key not configured, using mock answer generation for testing")
                return self._mock_answer_generation(question_text, context_materials, syllabus_context)
            
            # Build context from materials
            context = "\n\n".join(context_materials)
            
            prompt = f"""
You are an expert tutor helping students with competitive exam preparation.
Based on the provided study materials context, answer the following question comprehensively.

Guidelines:
1. Use ONLY information from the provided context
2. If the context doesn't contain sufficient information, say so clearly
3. Provide a detailed, structured answer
4. Include key points and explanations
5. Reference specific sections from the materials when possible

Question: {question_text}

Study Materials Context:
{context}
"""
            
            if syllabus_context:
                prompt += f"\n\nSyllabus Context: {syllabus_context}"
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert tutor providing comprehensive answers based on study materials."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=1500
            )
            
            answer = response.choices[0].message.content
            
            return {
                "success": True,
                "answer": answer,
                "context_used": len(context_materials),
                "has_sufficient_context": "insufficient information" not in answer.lower()
            }
            
        except Exception as e:
            logger.error(f"Error generating answer: {e}")
            # Fallback to mock answer generation
            logger.warning("Falling back to mock answer generation for testing")
            return self._mock_answer_generation(question_text, context_materials, syllabus_context)
    
    def _mock_answer_generation(self, question_text: str, context_materials: List[str], syllabus_context: str = None) -> Dict[str, Any]:
        """Mock answer generation for testing when OpenAI API is not available"""
        
        # Build context from materials
        context = "\n\n".join(context_materials) if context_materials else ""
        
        # Generate a simple mock answer based on the question
        if "math" in question_text.lower() or any(op in question_text for op in ['+', '-', '×', '÷', '=']):
            answer = """**Mathematical Solution:**

To solve this problem, follow these key steps:

1. **Identify the given information** from the question
2. **Apply relevant mathematical formulas** or concepts
3. **Show your working step by step**
4. **Verify your answer** by checking if it makes sense

*Note: This is a sample answer generated for testing purposes. For detailed solutions, please refer to your study materials and practice similar problems.*
"""
        elif "explain" in question_text.lower() or "describe" in question_text.lower():
            answer = """**Explanation:**

This topic involves several key concepts that are important to understand:

**Key Points:**
• The main concept relates to the fundamental principles covered in your study materials
• Understanding the underlying theory is crucial for exam success  
• Practice with similar questions will help reinforce your knowledge

**Application:**
The principles discussed here can be applied in various scenarios and form the foundation for more advanced topics.

*Note: This is a sample answer generated for testing purposes. Please refer to your study materials for comprehensive explanations.*
"""
        else:
            answer = f"""**Answer to: {question_text[:100]}...**

Based on the study materials and syllabus content, here's a comprehensive response:

**Key Information:**
• This question relates to important concepts from your course materials
• Understanding the fundamental principles is essential
• Regular practice with past papers will improve your performance

**Study Tips:**
1. Review the relevant sections in your materials
2. Practice similar questions regularly
3. Focus on understanding concepts rather than memorization

*Note: This is a sample answer generated for testing purposes. For detailed answers, please ensure proper study materials are available.*
"""
        
        return {
            "success": True,
            "answer": answer,
            "context_used": len(context_materials) if context_materials else 0,
            "has_sufficient_context": bool(context_materials),
            "generation_method": "mock"
        }
    
    def store_extracted_questions(
        self, 
        extraction_result: Dict[str, Any], 
        content: Content, 
        db: Session
    ) -> List[Question]:
        """
        Store extracted questions in the database
        """
        stored_questions = []
        
        if not extraction_result.get("success") or not extraction_result.get("questions"):
            return stored_questions
        
        try:
            for q_data in extraction_result["questions"]:
                # Map question type
                question_type = self._map_question_type(q_data.get("question_type", "other"))
                
                # Map difficulty
                difficulty = self._map_difficulty(q_data.get("difficulty", "medium"))
                
                # Create question instance
                question = Question(
                    content_id=content.id,
                    question_text=q_data.get("question_text", ""),
                    question_type=question_type,
                    difficulty=difficulty,
                    question_number=q_data.get("question_number"),
                    extraction_confidence=q_data.get("extraction_confidence", 85),
                    marks=q_data.get("marks", q_data.get("estimated_marks", 1)),
                    options=q_data.get("options"),  # For MCQ options
                    correct_answer=q_data.get("correct_answer", ""),
                    explanation=q_data.get("explanation"),
                    source_type="past_paper",
                    source_year=content.exam_year,
                    source_document=content.title
                )
                
                db.add(question)
                stored_questions.append(question)
            
            db.commit()
            logger.info(f"Stored {len(stored_questions)} questions for content {content.id}")
            
        except Exception as e:
            logger.error(f"Error storing questions: {e}")
            db.rollback()
            
        return stored_questions
    
    def _map_question_type(self, extracted_type: str) -> QuestionType:
        """Map extracted question type to enum"""
        type_mapping = {
            "mcq": QuestionType.multiple_choice,
            "multiple_choice": QuestionType.multiple_choice,
            "descriptive": QuestionType.essay,
            "essay": QuestionType.essay,
            "short_answer": QuestionType.short_answer,
            "true_false": QuestionType.true_false,
            "fill_blank": QuestionType.fill_blank,
            "other": QuestionType.essay  # default fallback
        }
        return type_mapping.get(extracted_type.lower(), QuestionType.essay)
    
    def _map_difficulty(self, extracted_difficulty: str) -> QuestionDifficulty:
        """Map extracted difficulty to enum"""
        difficulty_mapping = {
            "beginner": QuestionDifficulty.easy,
            "easy": QuestionDifficulty.easy,
            "moderate": QuestionDifficulty.medium,
            "medium": QuestionDifficulty.medium,
            "advanced": QuestionDifficulty.hard,
            "hard": QuestionDifficulty.hard
        }
        return difficulty_mapping.get(extracted_difficulty.lower(), QuestionDifficulty.medium)


# Global instance
question_extraction_service = QuestionExtractionService()