from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.assessment import MockExam, Question, StudentSubmission, SubmissionAnswer, ExamResult, QuestionType, QuestionDifficulty, SubmissionStatus, ExamStatus
from ..models.course import Course
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_admin
from ..services.evaluation_service import evaluation_service

router = APIRouter(prefix="/assessments", tags=["assessments"])
logger = logging.getLogger(__name__)


class QuestionCreate(BaseModel):
    question_text: str
    question_type: QuestionType
    options: Optional[List[str]] = None
    correct_answer: str
    explanation: Optional[str] = None
    difficulty: QuestionDifficulty = QuestionDifficulty.medium
    marks: int = 1


class MockExamCreate(BaseModel):
    title: str
    description: Optional[str] = None
    course_id: str
    duration_minutes: int
    total_marks: int
    passing_marks: int
    instructions: Optional[str] = None
    max_retakes: int = 3  # Maximum number of retakes allowed
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class MockExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None
    passing_marks: Optional[int] = None
    instructions: Optional[str] = None
    max_retakes: Optional[int] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class QuestionResponse(BaseModel):
    id: str
    question_text: str
    question_type: QuestionType
    options: Optional[List[str]] = None
    difficulty: QuestionDifficulty
    marks: int
    created_at: str

    @field_validator('id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True


class MockExamResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    course_id: str
    duration_minutes: int
    total_marks: int
    passing_marks: int
    instructions: Optional[str] = None
    max_retakes: int
    status: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    created_at: str
    total_questions: Optional[int] = None

    @field_validator('id', 'course_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('status', mode='before')
    @classmethod
    def validate_status(cls, v):
        if hasattr(v, 'value'):
            return v.value
        return str(v) if v else None
    
    @field_validator('created_at', 'start_time', 'end_time', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v) if v else None

    class Config:
        from_attributes = True


class SubmissionCreate(BaseModel):
    exam_id: str
    answers: List[Dict[str, Any]]  # [{"question_id": "uuid", "answer": "text/option"}]


class SubmissionResponse(BaseModel):
    id: str
    mock_exam_id: str
    student_id: str
    total_score: Optional[float] = None
    percentage_score: Optional[float] = None
    time_spent_minutes: Optional[int] = None
    submitted_at: Optional[str] = None
    passed: Optional[bool] = None
    status: SubmissionStatus

    @field_validator('id', 'mock_exam_id', 'student_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('submitted_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v) if v else None

    class Config:
        from_attributes = True


# Mock Exam Endpoints
@router.get("/exams", response_model=List[MockExamResponse])
async def get_mock_exams(
    course_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get mock exams"""
    query = db.query(MockExam)
    
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            query = query.filter(MockExam.course_id == course_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # For students, always filter to published exams only
    if current_user.role == UserRole.student:
        query = query.filter(MockExam.status == 'published')
    else:
        # For admins, respect the is_active parameter
        if is_active is not None:
            if is_active:
                query = query.filter(MockExam.status == 'published')
            else:
                query = query.filter(MockExam.status != 'published')
    
    exams = query.order_by(MockExam.created_at.desc()).all()
    
    # Add question count for each exam
    for exam in exams:
        question_count = db.query(func.count(Question.id)).filter(
            Question.mock_exam_id == exam.id
        ).scalar()
        exam.total_questions = question_count
    
    return exams


@router.get("/exams/{exam_id}", response_model=MockExamResponse)
async def get_mock_exam(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific mock exam"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    if current_user.role == UserRole.student and exam.status != 'published':
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    # Add question count
    question_count = db.query(func.count(Question.id)).filter(
        Question.mock_exam_id == exam.id
    ).scalar()
    exam.total_questions = question_count
    
    return exam


@router.post("/exams", response_model=MockExamResponse)
async def create_mock_exam(
    exam_data: MockExamCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new mock exam"""
    try:
        course_uuid = uuid.UUID(exam_data.course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # Verify course exists and user has permission
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to create exams for this course")
    
    exam = MockExam(
        id=uuid.uuid4(),
        title=exam_data.title,
        description=exam_data.description,
        course_id=course_uuid,
        duration_minutes=exam_data.duration_minutes,
        total_marks=exam_data.total_marks,
        passing_marks=exam_data.passing_marks,
        instructions=exam_data.instructions,
        start_time=exam_data.start_time,
        end_time=exam_data.end_time,
        question_source="mixed",  # Default value
        total_questions=10,  # Default value
        is_active=True  # Default to active
    )
    
    db.add(exam)
    db.commit()
    db.refresh(exam)
    
    exam.total_questions = 0
    return exam


@router.put("/exams/{exam_id}", response_model=MockExamResponse)
async def update_mock_exam(
    exam_id: str,
    exam_data: MockExamUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update mock exam"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == exam.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this exam")
    
    # Update fields
    if exam_data.title is not None:
        exam.title = exam_data.title
    if exam_data.description is not None:
        exam.description = exam_data.description
    if exam_data.duration_minutes is not None:
        exam.duration_minutes = exam_data.duration_minutes
    if exam_data.total_marks is not None:
        exam.total_marks = exam_data.total_marks
    if exam_data.passing_marks is not None:
        exam.passing_marks = exam_data.passing_marks
    if exam_data.instructions is not None:
        exam.instructions = exam_data.instructions
    if exam_data.is_active is not None:
        exam.is_active = exam_data.is_active
    if exam_data.status is not None:
        from ..models.assessment import ExamStatus
        if exam_data.status in [e.value for e in ExamStatus]:
            exam.status = ExamStatus(exam_data.status)
        else:
            raise HTTPException(status_code=400, detail=f"Invalid status: {exam_data.status}")
    if exam_data.start_time is not None:
        exam.start_time = exam_data.start_time
    if exam_data.end_time is not None:
        exam.end_time = exam_data.end_time
    
    db.commit()
    db.refresh(exam)
    
    return exam


@router.delete("/exams/{exam_id}")
async def delete_mock_exam(
    exam_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete mock exam"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == exam.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this exam")
    
    db.delete(exam)
    db.commit()
    
    return {"message": "Mock exam deleted successfully"}


# Question Endpoints
@router.get("/exams/{exam_id}/questions", response_model=List[QuestionResponse])
async def get_exam_questions(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get questions for an exam"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    if current_user.role == UserRole.student and exam.status != 'published':
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    questions = db.query(Question).filter(Question.mock_exam_id == exam_uuid).all()
    
    # For students taking exam, don't include correct answers and explanations
    if current_user.role == UserRole.student:
        for question in questions:
            question.correct_answer = None
            question.explanation = None
    
    return questions


@router.post("/exams/{exam_id}/questions", response_model=QuestionResponse)
async def create_question(
    exam_id: str,
    question_data: QuestionCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Add question to exam"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == exam.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to add questions to this exam")
    
    # Validate question based on type
    if question_data.question_type in [QuestionType.multiple_choice]:
        if not question_data.options or len(question_data.options) < 2:
            raise HTTPException(status_code=400, detail="Multiple choice questions require at least 2 options")
    
    question = Question(
        id=uuid.uuid4(),
        mock_exam_id=exam_uuid,
        question_text=question_data.question_text,
        question_type=question_data.question_type,
        options=question_data.options,
        correct_answer=question_data.correct_answer,
        explanation=question_data.explanation,
        difficulty=question_data.difficulty,
        marks=question_data.marks,
        source_type="manual"
    )
    
    db.add(question)
    db.commit()
    db.refresh(question)
    
    return question


@router.put("/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: str,
    question_data: QuestionCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update question"""
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    question = db.query(Question).filter(Question.id == question_uuid).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Check permissions through exam
    exam = db.query(MockExam).filter(MockExam.id == question.mock_exam_id).first()
    if exam:
        course = db.query(Course).filter(Course.id == exam.course_id).first()
        if current_user.role == UserRole.institution and course.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this question")
    
    # Update fields
    question.question_text = question_data.question_text
    question.question_type = question_data.question_type
    question.options = question_data.options
    question.correct_answer = question_data.correct_answer
    question.explanation = question_data.explanation
    question.difficulty = question_data.difficulty
    question.marks = question_data.marks
    
    db.commit()
    db.refresh(question)
    
    return question


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete question"""
    try:
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    question = db.query(Question).filter(Question.id == question_uuid).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Check permissions through exam
    exam = db.query(MockExam).filter(MockExam.id == question.mock_exam_id).first()
    if exam:
        course = db.query(Course).filter(Course.id == exam.course_id).first()
        if current_user.role == UserRole.institution and course.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this question")
    
    db.delete(question)
    db.commit()
    
    return {"message": "Question deleted successfully"}


# Submission Endpoints
@router.post("/exams/{exam_id}/submit", response_model=SubmissionResponse)
async def submit_exam(
    exam_id: str,
    submission_data: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit exam answers"""
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students can submit exams")
    
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(
        MockExam.id == exam_uuid,
        MockExam.status == 'published'
    ).first()
    
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found or not active")
    
    # Check existing submissions for retake logic
    existing_submissions = db.query(StudentSubmission).filter(
        StudentSubmission.mock_exam_id == exam_uuid,
        StudentSubmission.student_id == current_user.id
    ).all()

    # Check if retakes are allowed
    submission_count = len(existing_submissions)
    max_attempts_allowed = exam.max_retakes + 1  # +1 for the initial attempt

    if submission_count >= max_attempts_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum retakes reached. You have used {submission_count} out of {max_attempts_allowed} attempts."
        )

    # If this is a retake, we'll still create a new submission but mark previous ones as replaced
    if existing_submissions:
        # Mark all previous submissions as replaced
        for prev_submission in existing_submissions:
            prev_submission.status = SubmissionStatus.evaluated  # Keep them for history
        logger.info(f"Student {current_user.id} is retaking exam {exam_id}. Attempt {submission_count + 1} of {max_attempts_allowed}")
    
    # Create submission
    submission = StudentSubmission(
        id=uuid.uuid4(),
        mock_exam_id=exam_uuid,
        student_id=current_user.id,
        started_at=datetime.utcnow(),
        status=SubmissionStatus.in_progress
    )
    
    db.add(submission)
    db.flush()  # Get the ID without committing
    
    # Process answers and calculate score
    total_score = 0
    questions = db.query(Question).filter(Question.mock_exam_id == exam_uuid).all()
    question_dict = {str(q.id): q for q in questions}
    
    for answer_data in submission_data.answers:
        question_id = answer_data.get("question_id")
        student_answer = answer_data.get("answer", "")
        
        if question_id in question_dict:
            question = question_dict[question_id]
            is_correct = False
            
            # Simple answer matching (in production, use more sophisticated matching)
            if question.question_type == QuestionType.multiple_choice:
                is_correct = str(student_answer).strip().lower() == str(question.correct_answer).strip().lower()
            elif question.question_type == QuestionType.true_false:
                is_correct = str(student_answer).strip().lower() == str(question.correct_answer).strip().lower()
            elif question.question_type == QuestionType.short_answer:
                # For short answers, we'll mark as correct for now (manual review needed)
                is_correct = len(str(student_answer).strip()) > 0
            
            if is_correct:
                total_score += question.marks
            
            # Save individual answer
            submission_answer = SubmissionAnswer(
                id=uuid.uuid4(),
                submission_id=submission.id,
                question_id=uuid.UUID(question_id),
                student_answer=str(student_answer),
                is_correct=is_correct,
                marks_awarded=question.marks if is_correct else 0
            )
            db.add(submission_answer)
    
    # Update submission with score
    submission.total_score = total_score
    submission.percentage_score = (total_score / exam.total_marks) * 100 if exam.total_marks > 0 else 0
    submission.passed = submission.percentage_score >= (exam.passing_marks / exam.total_marks * 100)
    submission.submitted_at = datetime.utcnow()
    submission.status = SubmissionStatus.submitted

    # Calculate time spent in minutes
    time_spent = submission.submitted_at - submission.started_at
    submission.time_spent_minutes = int(time_spent.total_seconds() / 60)
    
    # Create exam result
    exam_result = ExamResult(
        id=uuid.uuid4(),
        submission_id=submission.id,
        accuracy_percentage=submission.percentage_score
    )
    
    db.add(exam_result)
    db.commit()
    db.refresh(submission)
    
    return submission


@router.get("/submissions", response_model=List[SubmissionResponse])
async def get_my_submissions(
    course_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's exam submissions"""
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students have submissions")
    
    query = db.query(StudentSubmission).filter(
        StudentSubmission.student_id == current_user.id
    )
    
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            # Join with MockExam to filter by course
            query = query.join(MockExam).filter(MockExam.course_id == course_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # Get all submissions ordered by date
    all_submissions = query.order_by(StudentSubmission.submitted_at.desc()).all()

    # Group by exam and keep only the latest submission for each exam
    latest_submissions = {}
    for submission in all_submissions:
        exam_id = str(submission.mock_exam_id)
        if exam_id not in latest_submissions:
            latest_submissions[exam_id] = submission

    # Return only the latest submission for each exam
    return list(latest_submissions.values())


@router.get("/exams/{exam_id}/results", response_model=List[SubmissionResponse])
async def get_exam_results(
    exam_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all results for an exam (admin only)"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == exam.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view results for this exam")
    
    submissions = db.query(StudentSubmission).filter(
        StudentSubmission.mock_exam_id == exam_uuid
    ).order_by(StudentSubmission.submitted_at.desc()).all()
    
    return submissions


# Detailed Results and Evaluation Endpoints
@router.get("/submissions/{submission_id}/detailed-results")
async def get_detailed_submission_results(
    submission_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed results for a specific submission with AI evaluation insights"""
    try:
        submission_uuid = uuid.UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid submission ID")
    
    # Get submission
    submission = db.query(StudentSubmission).filter(StudentSubmission.id == submission_uuid).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Check permissions - students can only see their own submissions
    if current_user.role == UserRole.student and submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this submission")
    
    # Get exam and questions
    exam = db.query(MockExam).filter(MockExam.id == submission.mock_exam_id).first()
    questions = db.query(Question).filter(Question.mock_exam_id == submission.mock_exam_id).all()
    answers = db.query(SubmissionAnswer).filter(SubmissionAnswer.submission_id == submission.id).all()
    
    # Get evaluation results using the evaluation service
    evaluation_results = await evaluation_service.evaluate_submission(
        submission, questions, answers, db
    )
    
    # Get detailed answer breakdown
    detailed_answers = []
    for question in questions:
        student_answer = next(
            (answer for answer in answers if answer.question_id == question.id),
            None
        )
        
        detailed_answers.append({
            "question_id": str(question.id),
            "question_text": question.question_text,
            "question_type": question.question_type.value,
            "options": question.options if question.question_type == QuestionType.multiple_choice else None,
            "correct_answer": question.correct_answer,
            "student_answer": student_answer.student_answer if student_answer else None,
            "is_correct": student_answer.is_correct if student_answer else False,
            "marks_awarded": student_answer.marks_awarded if student_answer else 0,
            "max_marks": question.marks,
            "explanation": question.explanation,
            "ai_feedback": student_answer.ai_feedback if student_answer else None
        })
    
    return {
        "submission_id": str(submission.id),
        "exam_title": exam.title,
        "student_name": current_user.full_name,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "total_score": submission.total_score,
        "total_marks": exam.total_marks,
        "percentage_score": submission.percentage_score,
        "passed": submission.passed,
        "time_spent_minutes": evaluation_results.get("time_spent"),
        "evaluation_results": evaluation_results,
        "detailed_answers": detailed_answers
    }


@router.post("/submissions/{submission_id}/re-evaluate")
async def re_evaluate_submission(
    submission_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Re-evaluate a submission with updated AI evaluation (admin only)"""
    try:
        submission_uuid = uuid.UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid submission ID")
    
    # Get submission
    submission = db.query(StudentSubmission).filter(StudentSubmission.id == submission_uuid).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Get exam and questions
    questions = db.query(Question).filter(Question.mock_exam_id == submission.mock_exam_id).all()
    answers = db.query(SubmissionAnswer).filter(SubmissionAnswer.submission_id == submission.id).all()
    
    # Re-evaluate using the evaluation service
    evaluation_results = await evaluation_service.evaluate_submission(
        submission, questions, answers, db
    )
    
    db.commit()
    
    return {
        "message": "Submission re-evaluated successfully",
        "submission_id": str(submission.id),
        "new_score": submission.total_score,
        "new_percentage": submission.percentage_score,
        "evaluation_results": evaluation_results
    }


@router.get("/students/{student_id}/performance-report")
async def get_student_performance_report(
    student_id: str,
    course_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive performance report for a student"""
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")
    
    # Check permissions
    if current_user.role == UserRole.student:
        if current_user.id != student_uuid:
            raise HTTPException(status_code=403, detail="Can only view your own performance")
    elif current_user.role not in [UserRole.admin, UserRole.institution]:
        raise HTTPException(status_code=403, detail="Not authorized to view performance reports")
    
    # Generate performance report
    performance_report = await evaluation_service.generate_performance_report(
        str(student_uuid), course_id, db
    )
    
    return performance_report


@router.get("/exams/{exam_id}/submissions")
async def get_exam_submissions(
    exam_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all submissions for a specific exam (admin only)"""
    try:
        exam_uuid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid exam ID")
    
    # Check if exam exists
    exam = db.query(MockExam).filter(MockExam.id == exam_uuid).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    # Get all submissions for this exam with student details
    submissions = db.query(StudentSubmission)\
        .join(User, StudentSubmission.student_id == User.id)\
        .filter(StudentSubmission.mock_exam_id == exam_uuid)\
        .all()
    
    # Format response
    result = []
    for submission in submissions:
        result.append({
            "id": str(submission.id),
            "student_id": str(submission.student_id),
            "student_name": submission.student.full_name,
            "student_email": submission.student.email,
            "started_at": submission.started_at.isoformat() if submission.started_at else None,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "total_score": submission.total_score,
            "percentage_score": submission.percentage_score,
            "passed": submission.passed,
            "status": submission.status.value,
            "time_spent_minutes": submission.time_spent_minutes
        })
    
    return result


@router.get("/analytics/overview")
async def get_analytics_overview(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get comprehensive analytics overview (admin only)"""
    try:
        # Get basic counts
        total_exams = db.query(MockExam).count()
        total_submissions = db.query(StudentSubmission).count()
        completed_submissions = db.query(StudentSubmission).filter(
            StudentSubmission.status == SubmissionStatus.submitted
        ).count()
        
        # Get student count
        from ..models.user import UserRole
        total_students = db.query(User).filter(User.role == UserRole.student).count()
        
        # Get course count
        from ..models.course import Course
        total_courses = db.query(Course).count()
        
        # Get content/materials count
        from ..models.content import Content
        total_materials = db.query(Content).count()
        
        # Calculate performance metrics
        completed_subs = db.query(StudentSubmission).filter(
            StudentSubmission.status == SubmissionStatus.submitted,
            StudentSubmission.percentage_score.isnot(None)
        ).all()
        
        average_score = 0
        pass_rate = 0
        if completed_subs:
            total_score = sum(sub.percentage_score for sub in completed_subs)
            average_score = total_score / len(completed_subs)
            
            passed_count = sum(1 for sub in completed_subs if sub.passed)
            pass_rate = (passed_count / len(completed_subs)) * 100
        
        # Get recent activity (last 7 days)
        from datetime import datetime, timedelta
        week_ago = datetime.utcnow() - timedelta(days=7)
        
        recent_submissions = db.query(StudentSubmission)\
            .filter(StudentSubmission.created_at >= week_ago)\
            .count()
            
        recent_exams = db.query(MockExam)\
            .filter(MockExam.created_at >= week_ago)\
            .count()
            
        # Get popular courses (simplified - just get first 5 courses)
        courses = db.query(Course).limit(5).all()
        popular_courses = []
        for course in courses:
            # For now, use mock enrollment count since relationship might be complex
            popular_courses.append({
                "id": str(course.id),
                "title": course.name,
                "enrollments": 1  # Simplified for now
            })
        
        # Active users this week (users with recent submissions)
        active_users_week = db.query(StudentSubmission)\
            .filter(StudentSubmission.created_at >= week_ago)\
            .distinct(StudentSubmission.student_id)\
            .count()
        
        return {
            "total_students": total_students,
            "total_courses": total_courses,
            "total_exams": total_exams,
            "total_materials": total_materials,
            "total_submissions": total_submissions,
            "completed_submissions": completed_submissions,
            "average_score": round(average_score, 1),
            "pass_rate": round(pass_rate, 1),
            "active_users_week": active_users_week,
            "recent_submissions_week": recent_submissions,
            "recent_exams_week": recent_exams,
            "popular_courses": popular_courses
        }
        
    except Exception as e:
        logger.error(f"Error getting analytics overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to get analytics overview")


@router.get("/analytics/recent-activity")
async def get_recent_activity(
    limit: int = 20,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get recent activity feed (admin only)"""
    try:
        # Return empty activity feed for now - endpoint works
        return []
        
    except Exception as e:
        logger.error(f"Error getting recent activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to get recent activity")

@router.get("/submissions/student/{student_id}")
async def get_student_submissions(
    student_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all submissions for a specific student (admin only)"""
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_uuid).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get student's submissions with exam and course details
    submissions = db.query(StudentSubmission)\
        .join(MockExam, StudentSubmission.mock_exam_id == MockExam.id)\
        .join(Course, MockExam.course_id == Course.id)\
        .filter(StudentSubmission.student_id == student_uuid)\
        .all()
    
    return [{
        "id": str(submission.id),
        "exam_id": str(submission.mock_exam_id),
        "exam_title": submission.mock_exam.title,
        "course_name": submission.mock_exam.course.name,
        "status": submission.status.value,
        "started_at": submission.started_at.isoformat() if submission.started_at else None,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "total_score": submission.total_score,
        "percentage_score": submission.percentage_score,
        "passed": submission.passed,
        "time_spent_minutes": submission.time_spent_minutes
    } for submission in submissions]