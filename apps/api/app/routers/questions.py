import logging
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.assessment import Question, StudentAnswer
from ..models.content import Content
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_student, get_current_admin
from ..services.question_extraction_service import question_extraction_service
from ..services.evaluation_service import evaluation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/questions", tags=["questions"])


# Pydantic models
class QuestionResponse(BaseModel):
    id: str
    question_text: str
    question_number: Optional[int] = None
    question_type: str
    difficulty: str
    marks: int
    options: Optional[Dict] = None
    source_year: Optional[str] = None
    content_title: str
    extraction_confidence: Optional[int] = None
    
    @field_validator('id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None

    class Config:
        from_attributes = True


class StudentAnswerRequest(BaseModel):
    question_id: str
    answer_text: str
    time_spent_seconds: Optional[int] = None


class StudentAnswerResponse(BaseModel):
    id: str
    question_id: str
    answer_text: str
    ai_answer: Optional[str] = None
    ai_feedback: Optional[str] = None
    submitted_at: datetime
    feedback_generated_at: Optional[datetime] = None
    
    @field_validator('id', 'question_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None

    class Config:
        from_attributes = True


class QuestionWithAnswerResponse(BaseModel):
    question: QuestionResponse
    student_answer: Optional[StudentAnswerResponse] = None


@router.get("/past-paper/{content_id}", response_model=List[QuestionResponse])
async def get_questions_by_past_paper(
    content_id: str,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get all questions extracted from a specific past paper"""
    
    try:
        content_uuid = uuid.UUID(content_id)
        
        # Verify content exists and is a past paper
        content = db.query(Content).filter(
            Content.id == content_uuid,
            Content.is_past_paper == True
        ).first()
        
        if not content:
            raise HTTPException(status_code=404, detail="Past paper not found")
        
        # Get questions for this past paper
        questions = db.query(Question).filter(
            Question.content_id == content_uuid,
            Question.source_type == "past_paper"
        ).order_by(Question.question_number.asc().nulls_last()).all()
        
        if not questions:
            raise HTTPException(status_code=404, detail="No questions found for this past paper")
        
        # Format response
        response = []
        for question in questions:
            response.append(QuestionResponse(
                id=str(question.id),
                question_text=question.question_text,
                question_number=question.question_number,
                question_type=question.question_type.value,
                difficulty=question.difficulty.value,
                marks=question.marks,
                options=question.options,
                source_year=question.source_year,
                content_title=content.title,
                extraction_confidence=question.extraction_confidence
            ))
        
        return response
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")


@router.post("/answer", response_model=StudentAnswerResponse)
async def submit_student_answer(
    answer_request: StudentAnswerRequest,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Submit a student answer to a question"""
    
    try:
        question_uuid = uuid.UUID(answer_request.question_id)
        
        # Verify question exists
        question = db.query(Question).filter(Question.id == question_uuid).first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        
        # Check if student already answered this question
        existing_answer = db.query(StudentAnswer).filter(
            StudentAnswer.student_id == current_user.id,
            StudentAnswer.question_id == question_uuid
        ).first()
        
        if existing_answer:
            # Update existing answer
            existing_answer.answer_text = answer_request.answer_text
            existing_answer.time_spent_seconds = answer_request.time_spent_seconds
            existing_answer.submitted_at = datetime.utcnow()
            # Clear previous AI feedback since answer changed
            existing_answer.ai_answer = None
            existing_answer.ai_feedback = None
            existing_answer.feedback_generated_at = None
            
            student_answer = existing_answer
        else:
            # Create new answer
            student_answer = StudentAnswer(
                student_id=current_user.id,
                question_id=question_uuid,
                answer_text=answer_request.answer_text,
                time_spent_seconds=answer_request.time_spent_seconds,
                submitted_at=datetime.utcnow()
            )
            db.add(student_answer)
        
        db.commit()
        db.refresh(student_answer)

        # Automatically generate AI feedback after submitting answer
        try:
            logger.info(f"Starting AI feedback generation for answer {student_answer.id}")
            logger.info(f"Question text: {question.question_text[:100]}...")
            logger.info(f"Student answer: {student_answer.answer_text[:100]}...")

            feedback_result = await evaluation_service.generate_answer_feedback(
                question.question_text,
                student_answer.answer_text
            )

            logger.info(f"AI feedback result: {feedback_result}")

            if feedback_result["success"]:
                student_answer.ai_answer = feedback_result["model_answer"]
                student_answer.ai_feedback = f"Score: {feedback_result['score']}/100\n\n{feedback_result['feedback']}"
                student_answer.feedback_generated_at = datetime.utcnow()

                db.commit()
                db.refresh(student_answer)
                logger.info(f"AI feedback generated successfully for answer {student_answer.id}")
            else:
                logger.error(f"AI feedback generation failed for answer {student_answer.id}: {feedback_result.get('error')}")
        except Exception as e:
            logger.error(f"Exception in AI feedback generation: {str(e)}", exc_info=True)
            # Continue without AI feedback if there's an error

        return StudentAnswerResponse(
            id=str(student_answer.id),
            question_id=str(student_answer.question_id),
            answer_text=student_answer.answer_text,
            ai_answer=student_answer.ai_answer,
            ai_feedback=student_answer.ai_feedback,
            submitted_at=student_answer.submitted_at,
            feedback_generated_at=student_answer.feedback_generated_at
        )
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")


@router.post("/answer/{answer_id}/generate-feedback", response_model=StudentAnswerResponse)
async def generate_ai_feedback(
    answer_id: str,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Generate AI feedback for a student answer with score and detailed analysis"""

    try:
        answer_uuid = uuid.UUID(answer_id)

        # Get student answer with question
        student_answer = db.query(StudentAnswer).filter(
            StudentAnswer.id == answer_uuid,
            StudentAnswer.student_id == current_user.id
        ).first()

        if not student_answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        question = student_answer.question

        if not question:
            raise HTTPException(status_code=400, detail="Question not found")

        # Generate AI feedback using the evaluation service
        feedback_result = await evaluation_service.generate_answer_feedback(
            question.question_text,
            student_answer.answer_text
        )

        if feedback_result["success"]:
            student_answer.ai_answer = feedback_result["model_answer"]
            student_answer.ai_feedback = f"Score: {feedback_result['score']}/100\n\n{feedback_result['feedback']}"
            student_answer.feedback_generated_at = datetime.utcnow()

            db.commit()
            db.refresh(student_answer)
        else:
            logger.error(f"AI feedback generation failed: {feedback_result.get('error')}")
            raise HTTPException(status_code=500, detail=f"Failed to generate AI feedback: {feedback_result.get('error', 'Unknown error')}")

        return StudentAnswerResponse(
            id=str(student_answer.id),
            question_id=str(student_answer.question_id),
            answer_text=student_answer.answer_text,
            ai_answer=student_answer.ai_answer,
            ai_feedback=student_answer.ai_feedback,
            submitted_at=student_answer.submitted_at,
            feedback_generated_at=student_answer.feedback_generated_at
        )

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid answer ID")


@router.get("/my-answers", response_model=List[StudentAnswerResponse])
async def get_my_answers(
    question_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get student's answers to questions"""
    
    query = db.query(StudentAnswer).filter(StudentAnswer.student_id == current_user.id)
    
    if question_id:
        try:
            question_uuid = uuid.UUID(question_id)
            query = query.filter(StudentAnswer.question_id == question_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid question ID")
    
    answers = query.order_by(StudentAnswer.submitted_at.desc()).offset(offset).limit(limit).all()
    
    response = []
    for answer in answers:
        response.append(StudentAnswerResponse(
            id=str(answer.id),
            question_id=str(answer.question_id),
            answer_text=answer.answer_text,
            ai_answer=answer.ai_answer,
            ai_feedback=answer.ai_feedback,
            submitted_at=answer.submitted_at,
            feedback_generated_at=answer.feedback_generated_at
        ))
    
    return response


@router.get("/past-paper/{content_id}/with-answers", response_model=List[QuestionWithAnswerResponse])
async def get_questions_with_answers(
    content_id: str,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get questions from a past paper along with student's answers if any"""
    
    try:
        content_uuid = uuid.UUID(content_id)
        
        # Verify content exists and is a past paper
        content = db.query(Content).filter(
            Content.id == content_uuid,
            Content.is_past_paper == True
        ).first()
        
        if not content:
            raise HTTPException(status_code=404, detail="Past paper not found")
        
        # Get questions for this past paper
        questions = db.query(Question).filter(
            Question.content_id == content_uuid,
            Question.source_type == "past_paper"
        ).order_by(Question.question_number.asc().nulls_last()).all()
        
        if not questions:
            raise HTTPException(status_code=404, detail="No questions found for this past paper")
        
        response = []
        for question in questions:
            # Get student's answer if it exists
            student_answer = db.query(StudentAnswer).filter(
                StudentAnswer.student_id == current_user.id,
                StudentAnswer.question_id == question.id
            ).first()
            
            question_response = QuestionResponse(
                id=str(question.id),
                question_text=question.question_text,
                question_number=question.question_number,
                question_type=question.question_type.value,
                difficulty=question.difficulty.value,
                marks=question.marks,
                options=question.options,
                source_year=question.source_year,
                content_title=content.title,
                extraction_confidence=question.extraction_confidence
            )
            
            answer_response = None
            if student_answer:
                answer_response = StudentAnswerResponse(
                    id=str(student_answer.id),
                    question_id=str(student_answer.question_id),
                    answer_text=student_answer.answer_text,
                    ai_answer=student_answer.ai_answer,
                    ai_feedback=student_answer.ai_feedback,
                    submitted_at=student_answer.submitted_at,
                    feedback_generated_at=student_answer.feedback_generated_at
                )
            
            response.append(QuestionWithAnswerResponse(
                question=question_response,
                student_answer=answer_response
            ))
        
        return response
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")


# Admin models
class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_number: Optional[int] = None
    marks: Optional[int] = None
    options: Optional[Dict] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None


class QuestionCreate(BaseModel):
    question_text: str
    question_number: Optional[int] = None
    question_type: str = "essay"
    difficulty: str = "medium"
    marks: int = 5
    options: Optional[Dict] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    source_type: str = "past_paper"
    extraction_confidence: Optional[int] = 100


# Admin endpoints
@router.get("/admin/past-paper/{content_id}", response_model=List[QuestionResponse])
async def get_past_paper_questions_admin(
    content_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all questions for a past paper (admin only)"""
    
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")
    
    # Verify content exists and is a past paper
    content = db.query(Content).filter(
        Content.id == content_uuid,
        Content.is_past_paper == True
    ).first()
    
    if not content:
        raise HTTPException(status_code=404, detail="Past paper not found")
    
    # Get all questions for this past paper
    questions = db.query(Question).filter(
        Question.content_id == content_uuid
    ).order_by(Question.question_number).all()
    
    response = []
    for question in questions:
        response.append(QuestionResponse(
            id=str(question.id),
            question_text=question.question_text,
            question_number=question.question_number,
            question_type=question.question_type.value,
            difficulty=question.difficulty.value,
            marks=question.marks,
            options=question.options,
            source_year=question.source_year,
            content_title=content.title,
            extraction_confidence=question.extraction_confidence
        ))
    
    return response


@router.put("/admin/{question_id}", response_model=QuestionResponse)
async def update_question_admin(
    question_id: str,
    question_update: QuestionUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a question (admin only)"""
    
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    # Get the question
    question = db.query(Question).filter(Question.id == question_uuid).first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Update question fields
    for field, value in question_update.dict(exclude_unset=True).items():
        setattr(question, field, value)
    
    try:
        db.commit()
        db.refresh(question)
        
        # Get content for response
        content = question.content
        
        return QuestionResponse(
            id=str(question.id),
            question_text=question.question_text,
            question_number=question.question_number,
            question_type=question.question_type.value,
            difficulty=question.difficulty.value,
            marks=question.marks,
            options=question.options,
            source_year=question.source_year,
            content_title=content.title if content else "Unknown",
            extraction_confidence=question.extraction_confidence
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update question: {str(e)}")


@router.delete("/admin/{question_id}")
async def delete_question_admin(
    question_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a question (admin only)"""
    
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    # Get the question
    question = db.query(Question).filter(Question.id == question_uuid).first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    try:
        db.delete(question)
        db.commit()
        return {"message": "Question deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete question: {str(e)}")


@router.post("/admin/past-paper/{content_id}", response_model=QuestionResponse)
async def create_question_admin(
    content_id: str,
    question_create: QuestionCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new question for a past paper (admin only)"""
    
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")
    
    # Verify content exists and is a past paper
    content = db.query(Content).filter(
        Content.id == content_uuid,
        Content.is_past_paper == True
    ).first()
    
    if not content:
        raise HTTPException(status_code=404, detail="Past paper not found")
    
    # Create new question
    question_data = question_create.dict()
    question_data['content_id'] = content_uuid
    question_data['source_year'] = content.exam_year
    
    # Map string values to enums
    from ..models.assessment import QuestionType, QuestionDifficulty
    
    question_type_map = {
        'mcq': QuestionType.multiple_choice,
        'multiple_choice': QuestionType.multiple_choice,
        'essay': QuestionType.essay,
        'short_answer': QuestionType.short_answer,
        'true_false': QuestionType.true_false,
        'fill_blank': QuestionType.fill_blank,
    }
    
    difficulty_map = {
        'easy': QuestionDifficulty.easy,
        'medium': QuestionDifficulty.medium,
        'hard': QuestionDifficulty.hard,
    }
    
    question_data['question_type'] = question_type_map.get(question_create.question_type, QuestionType.essay)
    question_data['difficulty'] = difficulty_map.get(question_create.difficulty, QuestionDifficulty.medium)
    
    question = Question(**question_data)
    
    try:
        db.add(question)
        db.commit()
        db.refresh(question)
        
        return QuestionResponse(
            id=str(question.id),
            question_text=question.question_text,
            question_number=question.question_number,
            question_type=question.question_type.value,
            difficulty=question.difficulty.value,
            marks=question.marks,
            options=question.options,
            source_year=question.source_year,
            content_title=content.title,
            extraction_confidence=question.extraction_confidence
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create question: {str(e)}")