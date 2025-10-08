import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, ForeignKey, Integer, Boolean, Float, JSON
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import relationship

from ..db.base import Base


class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"
    true_false = "true_false"
    short_answer = "short_answer"
    essay = "essay"
    fill_blank = "fill_blank"


class QuestionDifficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class ExamStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class SubmissionStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    evaluated = "evaluated"


class MockExam(Base):
    __tablename__ = "mock_exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    
    # Exam configuration
    duration_minutes = Column(Integer, nullable=False)
    total_marks = Column(Integer, default=100, nullable=False)
    passing_marks = Column(Integer, default=40, nullable=False)
    
    # Question configuration
    question_source = Column(String(50), default="manual", nullable=False)  # ai_generated, past_paper, mixed, manual
    total_questions = Column(Integer, default=0, nullable=False)
    
    # Settings
    randomize_questions = Column(Boolean, default=True, nullable=False)
    allow_review = Column(Boolean, default=True, nullable=False)
    show_results_immediately = Column(Boolean, default=True, nullable=False)
    max_retakes = Column(Integer, default=3, nullable=False)  # Maximum number of retakes allowed
    
    # Scheduling
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    
    status = Column(ENUM(ExamStatus, name="exam_status", create_type=False), default=ExamStatus.draft, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    course = relationship("Course", back_populates="mock_exams")
    questions = relationship("Question", back_populates="mock_exam")
    submissions = relationship("StudentSubmission", back_populates="mock_exam", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<MockExam(id={self.id}, title={self.title}, course_id={self.course_id})>"


class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mock_exam_id = Column(UUID(as_uuid=True), ForeignKey("mock_exams.id", ondelete="CASCADE"), nullable=True)
    content_id = Column(UUID(as_uuid=True), ForeignKey("content.id", ondelete="CASCADE"), nullable=True)
    syllabus_item_id = Column(UUID(as_uuid=True), ForeignKey("syllabus_items.id"), nullable=True)
    
    question_text = Column(Text, nullable=False)
    question_type = Column(ENUM(QuestionType, name="question_type", create_type=False), nullable=False)
    difficulty = Column(ENUM(QuestionDifficulty, name="question_difficulty", create_type=False), default=QuestionDifficulty.medium, nullable=False)
    
    # Options and answers (stored as JSON)
    options = Column(JSON, nullable=True)  # For multiple choice questions
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    
    # Metadata
    marks = Column(Integer, default=1, nullable=False)
    time_limit_seconds = Column(Integer, nullable=True)
    question_number = Column(Integer, nullable=True)  # For past paper questions
    extraction_confidence = Column(Integer, nullable=True)  # AI extraction confidence
    
    # Source information
    source_type = Column(String(50), default="manual", nullable=False)  # ai_generated, past_paper, manual
    source_year = Column(String(20), nullable=True)
    source_document = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    mock_exam = relationship("MockExam", back_populates="questions")
    content = relationship("Content", back_populates="questions")
    syllabus_item = relationship("SyllabusItem", back_populates="questions")
    submission_answers = relationship("SubmissionAnswer", back_populates="question")
    student_answers = relationship("StudentAnswer", back_populates="question", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Question(id={self.id}, type={self.question_type}, difficulty={self.difficulty})>"


class StudentSubmission(Base):
    __tablename__ = "student_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mock_exam_id = Column(UUID(as_uuid=True), ForeignKey("mock_exams.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Submission details
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    time_spent_minutes = Column(Integer, nullable=True)
    
    status = Column(ENUM(SubmissionStatus, name="submission_status", create_type=False), default=SubmissionStatus.in_progress, nullable=False)
    
    # Results (populated after evaluation)
    total_score = Column(Float, nullable=True)
    percentage_score = Column(Float, nullable=True)
    passed = Column(Boolean, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    mock_exam = relationship("MockExam", back_populates="submissions")
    student = relationship("User", back_populates="submissions")
    answers = relationship("SubmissionAnswer", back_populates="submission", cascade="all, delete-orphan")
    result = relationship("ExamResult", back_populates="submission", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<StudentSubmission(id={self.id}, student_id={self.student_id}, exam_id={self.mock_exam_id})>"


class SubmissionAnswer(Base):
    __tablename__ = "submission_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id = Column(UUID(as_uuid=True), ForeignKey("student_submissions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    
    # Student's answer
    student_answer = Column(Text, nullable=True)
    is_marked_for_review = Column(Boolean, default=False, nullable=False)
    time_spent_seconds = Column(Integer, nullable=True)
    
    # Evaluation results
    is_correct = Column(Boolean, nullable=True)
    marks_awarded = Column(Float, nullable=True)
    ai_feedback = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    submission = relationship("StudentSubmission", back_populates="answers")
    question = relationship("Question", back_populates="submission_answers")

    def __repr__(self):
        return f"<SubmissionAnswer(id={self.id}, submission_id={self.submission_id}, question_id={self.question_id})>"


class StudentAnswer(Base):
    __tablename__ = "student_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    
    # Answer details
    answer_text = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    time_spent_seconds = Column(Integer, nullable=True)
    
    # AI feedback
    ai_answer = Column(Text, nullable=True)
    ai_feedback = Column(Text, nullable=True)
    feedback_generated_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    student = relationship("User", back_populates="student_answers")
    question = relationship("Question", back_populates="student_answers")

    def __repr__(self):
        return f"<StudentAnswer(id={self.id}, student_id={self.student_id}, question_id={self.question_id})>"


class ExamResult(Base):
    __tablename__ = "exam_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id = Column(UUID(as_uuid=True), ForeignKey("student_submissions.id", ondelete="CASCADE"), nullable=False)
    
    # Detailed analysis
    topic_wise_scores = Column(JSON, nullable=True)  # {"topic_id": {"correct": 5, "total": 10, "percentage": 50}}
    weak_areas = Column(JSON, nullable=True)  # List of syllabus item IDs where student performed poorly
    strong_areas = Column(JSON, nullable=True)  # List of syllabus item IDs where student performed well
    
    # Recommendations
    suggested_topics = Column(JSON, nullable=True)  # List of topics to focus on
    ai_recommendations = Column(Text, nullable=True)
    
    # Performance metrics
    accuracy_percentage = Column(Float, nullable=True)
    speed_percentile = Column(Float, nullable=True)  # How fast compared to other students
    difficulty_handled = Column(String(20), nullable=True)  # easy, medium, hard
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    submission = relationship("StudentSubmission", back_populates="result")

    def __repr__(self):
        return f"<ExamResult(id={self.id}, submission_id={self.submission_id})>"