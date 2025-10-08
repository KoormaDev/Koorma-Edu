import logging
from typing import List, Dict, Any, Optional, Tuple
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from openai import OpenAI

from ..core.config import settings
from ..models.assessment import MockExam, Question, StudentSubmission, SubmissionAnswer, QuestionType, QuestionDifficulty
from ..models.user import User
from ..models.syllabus import SyllabusItem

logger = logging.getLogger(__name__)


class EvaluationService:
    """Service for evaluating student submissions and generating insights"""
    
    def __init__(self):
        self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
    
    async def evaluate_submission(
        self,
        submission: StudentSubmission,
        questions: List[Question],
        answers: List[SubmissionAnswer],
        db: Session
    ) -> Dict[str, Any]:
        """Evaluate a student submission and generate detailed results"""
        
        try:
            # Calculate basic scores
            total_score = 0
            total_marks = 0
            correct_answers = 0
            incorrect_answers = 0
            topic_scores = {}
            
            for question in questions:
                total_marks += question.marks
                
                # Find student's answer for this question
                student_answer = next(
                    (answer for answer in answers if answer.question_id == question.id),
                    None
                )
                
                if student_answer:
                    is_correct = await self._evaluate_answer(question, student_answer)
                    
                    if is_correct:
                        total_score += question.marks
                        correct_answers += 1
                        student_answer.marks_awarded = question.marks
                    else:
                        incorrect_answers += 1
                        student_answer.marks_awarded = 0
                    
                    student_answer.is_correct = is_correct
                    
                    # Track topic-wise performance
                    if hasattr(question, 'syllabus_item') and question.syllabus_item:
                        topic_name = question.syllabus_item.name
                        if topic_name not in topic_scores:
                            topic_scores[topic_name] = {"correct": 0, "total": 0}
                        
                        topic_scores[topic_name]["total"] += 1
                        if is_correct:
                            topic_scores[topic_name]["correct"] += 1
            
            # Calculate percentage
            percentage_score = (total_score / total_marks * 100) if total_marks > 0 else 0
            
            # Determine pass/fail
            mock_exam = submission.mock_exam
            passed = percentage_score >= (mock_exam.passing_marks / mock_exam.total_marks * 100)
            
            # Generate insights
            insights = await self._generate_insights(
                questions, answers, topic_scores, percentage_score
            )
            
            # Update submission
            submission.total_score = total_score
            submission.percentage_score = percentage_score
            submission.passed = passed
            
            return {
                "total_score": total_score,
                "total_marks": total_marks,
                "percentage_score": percentage_score,
                "passed": passed,
                "correct_answers": correct_answers,
                "incorrect_answers": incorrect_answers,
                "topic_scores": topic_scores,
                "insights": insights,
                "time_spent": self._calculate_time_spent(submission)
            }
            
        except Exception as e:
            logger.error(f"Error evaluating submission: {e}")
            return {
                "error": "Failed to evaluate submission",
                "details": str(e)
            }
    
    async def _evaluate_answer(
        self,
        question: Question,
        student_answer: SubmissionAnswer
    ) -> bool:
        """Evaluate a single answer"""
        
        try:
            student_response = student_answer.student_answer
            correct_answer = question.correct_answer
            
            if question.question_type == QuestionType.multiple_choice:
                return self._evaluate_multiple_choice(student_response, correct_answer)
            
            elif question.question_type == QuestionType.true_false:
                return self._evaluate_true_false(student_response, correct_answer)
            
            elif question.question_type == QuestionType.short_answer:
                return await self._evaluate_short_answer(
                    question.question_text,
                    student_response,
                    correct_answer
                )
            
            elif question.question_type == QuestionType.essay:
                return await self._evaluate_essay(
                    question.question_text,
                    student_response,
                    correct_answer
                )
            
            else:
                logger.warning(f"Unknown question type: {question.question_type}")
                return False
                
        except Exception as e:
            logger.error(f"Error evaluating answer: {e}")
            return False
    
    def _evaluate_multiple_choice(self, student_answer: str, correct_answer: str) -> bool:
        """Evaluate multiple choice answer"""
        if not student_answer or not correct_answer:
            return False
        
        # Normalize answers (remove spaces, convert to lowercase)
        student = student_answer.strip().lower()
        correct = correct_answer.strip().lower()
        
        return student == correct
    
    def _evaluate_true_false(self, student_answer: str, correct_answer: str) -> bool:
        """Evaluate true/false answer"""
        if not student_answer or not correct_answer:
            return False
        
        # Normalize and check various true/false representations
        student = student_answer.strip().lower()
        correct = correct_answer.strip().lower()
        
        true_values = ['true', 't', 'yes', 'y', '1']
        false_values = ['false', 'f', 'no', 'n', '0']
        
        # Convert to standard true/false
        if student in true_values:
            student = 'true'
        elif student in false_values:
            student = 'false'
        
        if correct in true_values:
            correct = 'true'
        elif correct in false_values:
            correct = 'false'
        
        return student == correct
    
    async def _evaluate_short_answer(
        self,
        question_text: str,
        student_answer: str,
        correct_answer: str
    ) -> bool:
        """Evaluate short answer using AI"""
        
        if not self.openai_client:
            # Fallback to simple text matching
            return self._simple_text_match(student_answer, correct_answer)
        
        try:
            prompt = f"""
Evaluate if the student's answer is correct for this question.

Question: {question_text}

Expected Answer: {correct_answer}

Student Answer: {student_answer}

Return only "CORRECT" or "INCORRECT" based on whether the student's answer captures the essential meaning of the expected answer. Be reasonably flexible with wording while ensuring the key concepts are present.
"""
            
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert evaluator. Respond with only CORRECT or INCORRECT."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=10,
                temperature=0.1
            )
            
            result = response.choices[0].message.content.strip().upper()
            return result == "CORRECT"
            
        except Exception as e:
            logger.error(f"Error in AI evaluation: {e}")
            return self._simple_text_match(student_answer, correct_answer)
    
    async def _evaluate_essay(
        self,
        question_text: str,
        student_answer: str,
        model_answer: str
    ) -> bool:
        """Evaluate essay answer using AI"""
        
        if not self.openai_client:
            # For essays, we need AI evaluation
            logger.warning("Essay evaluation requires OpenAI API")
            return len(student_answer.strip()) > 50  # Basic length check
        
        try:
            prompt = f"""
Evaluate this essay answer on a scale of 0-100 and determine if it should be marked as correct (score >= 60).

Question: {question_text}

Model Answer (for reference): {model_answer}

Student Answer: {student_answer}

Criteria:
- Content accuracy and relevance
- Understanding of key concepts
- Structure and coherence
- Completeness of response

Return only "PASS" or "FAIL" followed by the numeric score (0-100).
Example: "PASS 75" or "FAIL 45"
"""
            
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert essay evaluator."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=20,
                temperature=0.3
            )
            
            result = response.choices[0].message.content.strip()
            return result.startswith("PASS")
            
        except Exception as e:
            logger.error(f"Error in essay evaluation: {e}")
            return len(student_answer.strip()) > 50
    
    def _simple_text_match(self, student_answer: str, correct_answer: str) -> bool:
        """Simple text matching fallback"""
        if not student_answer or not correct_answer:
            return False
        
        student = student_answer.strip().lower()
        correct = correct_answer.strip().lower()
        
        # Check exact match
        if student == correct:
            return True
        
        # Check if key words are present
        correct_words = set(correct.split())
        student_words = set(student.split())
        
        # If more than 70% of correct words are present
        if len(correct_words) > 0:
            overlap = len(correct_words.intersection(student_words))
            return (overlap / len(correct_words)) > 0.7
        
        return False
    
    async def _generate_insights(
        self,
        questions: List[Question],
        answers: List[SubmissionAnswer],
        topic_scores: Dict[str, Dict[str, int]],
        overall_percentage: float
    ) -> Dict[str, Any]:
        """Generate insights and recommendations"""
        
        # Calculate topic-wise percentages
        topic_percentages = {}
        weak_topics = []
        strong_topics = []
        
        for topic, scores in topic_scores.items():
            percentage = (scores["correct"] / scores["total"] * 100) if scores["total"] > 0 else 0
            topic_percentages[topic] = percentage
            
            if percentage < 60:
                weak_topics.append(topic)
            elif percentage >= 80:
                strong_topics.append(topic)
        
        # Analyze difficulty performance
        difficulty_analysis = {}
        for question in questions:
            difficulty = question.difficulty.value
            if difficulty not in difficulty_analysis:
                difficulty_analysis[difficulty] = {"correct": 0, "total": 0}
            
            difficulty_analysis[difficulty]["total"] += 1
            
            # Find if this question was answered correctly
            student_answer = next(
                (answer for answer in answers if answer.question_id == question.id),
                None
            )
            
            if student_answer and student_answer.is_correct:
                difficulty_analysis[difficulty]["correct"] += 1
        
        # Generate recommendations
        recommendations = []
        
        if overall_percentage < 60:
            recommendations.append("Focus on understanding fundamental concepts before attempting practice tests.")
        
        if weak_topics:
            recommendations.append(f"Review these topics that need improvement: {', '.join(weak_topics[:3])}")
        
        if difficulty_analysis.get("easy", {}).get("total", 0) > 0:
            easy_percentage = (difficulty_analysis["easy"]["correct"] / difficulty_analysis["easy"]["total"] * 100)
            if easy_percentage < 80:
                recommendations.append("Work on basic concepts - you're missing easy questions.")
        
        return {
            "topic_percentages": topic_percentages,
            "weak_topics": weak_topics,
            "strong_topics": strong_topics,
            "difficulty_analysis": difficulty_analysis,
            "recommendations": recommendations,
            "study_time_suggestion": self._suggest_study_time(overall_percentage)
        }
    
    def _suggest_study_time(self, percentage: float) -> str:
        """Suggest study time based on performance"""
        if percentage >= 80:
            return "Maintain current study routine. Focus on advanced topics."
        elif percentage >= 60:
            return "Increase study time by 20-30%. Review weak areas daily."
        else:
            return "Significantly increase study time. Consider structured revision plan."
    
    def _calculate_time_spent(self, submission: StudentSubmission) -> Optional[int]:
        """Calculate time spent on exam in minutes"""
        if submission.started_at and submission.submitted_at:
            duration = submission.submitted_at - submission.started_at
            return int(duration.total_seconds() / 60)
        return None

    async def generate_answer_feedback(
        self,
        question_text: str,
        student_answer: str
    ) -> Dict[str, Any]:
        """Generate AI feedback and model answer for a student's response"""

        if not self.openai_client:
            return {
                "success": False,
                "error": "OpenAI API not configured"
            }

        try:
            prompt = f"""
Analyze the following student answer to this question and provide comprehensive feedback.

Question: {question_text}

Student Answer: {student_answer}

Please provide:
1. A model answer that demonstrates the best response to this question
2. A percentage score (0-100) based on accuracy, completeness, and understanding
3. Detailed feedback highlighting strengths and areas for improvement
4. Specific suggestions for improvement

Format your response as follows:

MODEL ANSWER:
[Provide an ideal answer to the question]

SCORE: [percentage from 0-100]

FEEDBACK:
[Detailed analysis of the student's answer including strengths and weaknesses]

SUGGESTIONS:
[Specific recommendations for improvement]
"""

            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert educational evaluator. Provide constructive, detailed feedback that helps students learn."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=800,
                temperature=0.3
            )

            result = response.choices[0].message.content

            # Parse the response to extract components
            model_answer = ""
            score = 0
            feedback = ""
            suggestions = ""

            sections = result.split("\n\n")
            current_section = ""

            for section in sections:
                section = section.strip()
                if section.startswith("MODEL ANSWER:"):
                    current_section = "model_answer"
                    model_answer = section.replace("MODEL ANSWER:", "").strip()
                elif section.startswith("SCORE:"):
                    current_section = "score"
                    score_text = section.replace("SCORE:", "").strip()
                    try:
                        score = int(''.join(filter(str.isdigit, score_text)))
                    except ValueError:
                        score = 50  # Default score if parsing fails
                elif section.startswith("FEEDBACK:"):
                    current_section = "feedback"
                    feedback = section.replace("FEEDBACK:", "").strip()
                elif section.startswith("SUGGESTIONS:"):
                    current_section = "suggestions"
                    suggestions = section.replace("SUGGESTIONS:", "").strip()
                else:
                    # Continue adding to current section
                    if current_section == "model_answer":
                        model_answer += "\n" + section
                    elif current_section == "feedback":
                        feedback += "\n" + section
                    elif current_section == "suggestions":
                        suggestions += "\n" + section

            # Combine feedback and suggestions
            combined_feedback = feedback
            if suggestions:
                combined_feedback += f"\n\nSuggestions for improvement:\n{suggestions}"

            return {
                "success": True,
                "model_answer": model_answer.strip(),
                "score": min(max(score, 0), 100),  # Ensure score is between 0-100
                "feedback": combined_feedback.strip()
            }

        except Exception as e:
            logger.error(f"Error generating answer feedback: {e}")
            return {
                "success": False,
                "error": f"Failed to generate feedback: {str(e)}"
            }
    
    async def generate_performance_report(
        self,
        student_id: str,
        course_id: Optional[str],
        db: Session
    ) -> Dict[str, Any]:
        """Generate comprehensive performance report for a student"""
        
        try:
            # Get all submissions for the student
            query = db.query(StudentSubmission).filter(
                StudentSubmission.student_id == student_id
            )
            
            if course_id:
                from ..models.assessment import MockExam
                query = query.join(MockExam).filter(MockExam.course_id == course_id)
            
            submissions = query.all()
            
            if not submissions:
                return {
                    "total_attempts": 0,
                    "message": "No exam attempts found"
                }
            
            # Calculate overall statistics
            total_attempts = len(submissions)
            passed_attempts = sum(1 for s in submissions if s.passed)
            pass_rate = (passed_attempts / total_attempts * 100) if total_attempts > 0 else 0
            
            average_score = sum(s.percentage_score for s in submissions if s.percentage_score) / total_attempts
            
            # Performance over time
            performance_trend = []
            for submission in submissions[-10:]:  # Last 10 attempts
                performance_trend.append({
                    "date": submission.submitted_at.isoformat() if submission.submitted_at else None,
                    "score": submission.percentage_score,
                    "passed": submission.passed
                })
            
            # Recent performance
            recent_submissions = submissions[-5:] if len(submissions) >= 5 else submissions
            recent_average = sum(s.percentage_score for s in recent_submissions) / len(recent_submissions)
            
            improvement = recent_average - average_score if len(submissions) > 5 else 0
            
            return {
                "total_attempts": total_attempts,
                "passed_attempts": passed_attempts,
                "pass_rate": pass_rate,
                "average_score": average_score,
                "recent_average": recent_average,
                "improvement": improvement,
                "performance_trend": performance_trend,
                "last_attempt": submissions[-1].submitted_at.isoformat() if submissions[-1].submitted_at else None
            }
            
        except Exception as e:
            logger.error(f"Error generating performance report: {e}")
            return {"error": "Failed to generate report"}


# Singleton instance
evaluation_service = EvaluationService()