import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, String, Text, ForeignKey, Integer, Float, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM, UUID, ARRAY
from sqlalchemy.orm import relationship

from ..db.base import Base


class ContentType(str, enum.Enum):
    document = "document"
    video = "video"
    text = "text"
    past_paper = "past_paper"
    question_bank = "question_bank"
    pdf = "pdf"
    youtube = "youtube"
    website = "website"
    docx = "docx"
    xlsx = "xlsx"
    video_link = "video_link"


class DifficultyLevel(str, enum.Enum):
    beginner = "beginner"
    moderate = "moderate"
    advanced = "advanced"


class QuestionType(str, enum.Enum):
    mcq = "mcq"
    descriptive = "descriptive"
    other = "other"


class ContentStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    archived = "archived"
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class MaterialProcessingStatus(str, enum.Enum):
    uploading = "uploading"
    extracting = "extracting"
    translating = "translating"
    embedding = "embedding"
    ready = "ready"
    failed = "failed"


class Language(str, enum.Enum):
    english = "english"
    tamil = "tamil"
    sinhala = "sinhala"
    en = "en"
    ta = "ta"


class Content(Base):
    __tablename__ = "content"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    content_type = Column(ENUM(ContentType, name="content_type", create_type=False), nullable=False)
    status = Column(ENUM(ContentStatus, name="content_status", create_type=False), default=ContentStatus.draft, nullable=False)
    processing_status = Column(ENUM(MaterialProcessingStatus, name="material_processing_status", create_type=False), default=MaterialProcessingStatus.ready, nullable=False)
    language = Column(ENUM(Language, name="language_code", create_type=False), default=Language.en, nullable=False)
    
    # Content storage fields
    source_url = Column(Text, nullable=True)  # For external URLs
    file_path = Column(Text, nullable=True)   # For uploaded files
    content_text = Column(Text, nullable=True)  # For text content
    file_size = Column(Integer, nullable=True)
    
    # Legacy fields
    category = Column(String(255), nullable=True)
    needs_translation = Column(Boolean, default=False, nullable=False)
    
    # Course syllabus integration
    syllabus_item_id = Column(UUID(as_uuid=True), ForeignKey("syllabus_items.id"), nullable=True)
    is_study_material = Column(Boolean, default=False, nullable=False)
    is_past_paper = Column(Boolean, default=False, nullable=False)
    exam_year = Column(String(20), nullable=True)
    exam_stage = Column(String(100), nullable=True)
    difficulty_level = Column(ENUM(DifficultyLevel, name="difficulty_level", create_type=False), nullable=True)
    question_type = Column(ENUM(QuestionType, name="question_type_content", create_type=False), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    syllabus_item = relationship("SyllabusItem", back_populates="contents")
    questions = relationship("Question", back_populates="content", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Content(id={self.id}, title={self.title}, status={self.status})>"


class ContentSummary(Base):
    __tablename__ = "content_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id = Column(UUID(as_uuid=True), ForeignKey("content.id", ondelete="CASCADE"), nullable=False)
    summary_text = Column(Text, nullable=False)
    key_topics = Column(ARRAY(String), nullable=True, default=[])
    content_type = Column(String(50), nullable=False)
    difficulty_level = Column(String(20), nullable=True)
    estimated_reading_time = Column(Integer, nullable=True)  # in minutes
    learning_objectives = Column(ARRAY(String), nullable=True, default=[])

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    content = relationship("Content", backref="summary")

    def __repr__(self):
        return f"<ContentSummary(id={self.id}, content_id={self.content_id})>"


class StudentMaterialProgress(Base):
    __tablename__ = "student_material_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content_id = Column(UUID(as_uuid=True), ForeignKey("content.id", ondelete="CASCADE"), nullable=False)

    # Progress tracking
    is_completed = Column(Boolean, default=False, nullable=False)
    completion_percentage = Column(Float, default=0.0, nullable=False)  # 0-100
    time_spent_minutes = Column(Integer, default=0, nullable=False)

    # Timestamps
    first_accessed = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_accessed = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    student = relationship("User", backref="material_progress")
    content = relationship("Content", backref="student_progress")

    # Unique constraint to prevent duplicate progress records
    __table_args__ = (
        UniqueConstraint('student_id', 'content_id', name='_student_content_progress_uc'),
    )

    def __repr__(self):
        return f"<StudentMaterialProgress(student_id={self.student_id}, content_id={self.content_id}, completed={self.is_completed})>"


class StudentStudySession(Base):
    __tablename__ = "student_study_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content_id = Column(UUID(as_uuid=True), ForeignKey("content.id", ondelete="CASCADE"), nullable=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)

    # Session details
    session_start = Column(DateTime, default=datetime.utcnow, nullable=False)
    session_end = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    session_type = Column(String(50), default="study", nullable=False)  # "study", "exam", "practice"

    # Activity tracking
    is_active = Column(Boolean, default=True, nullable=False)
    activity_data = Column(Text, nullable=True)  # JSON string for detailed activity tracking

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    student = relationship("User", backref="study_sessions")
    content = relationship("Content", backref="study_sessions")

    def __repr__(self):
        return f"<StudentStudySession(student_id={self.student_id}, session_start={self.session_start}, duration={self.duration_minutes})>"


class UserLoginSession(Base):
    __tablename__ = "user_login_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Session details
    login_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    logout_time = Column(DateTime, nullable=True)
    last_activity = Column(DateTime, default=datetime.utcnow, nullable=False)
    duration_minutes = Column(Integer, nullable=True)

    # Learning time breakdown (in minutes)
    material_time_minutes = Column(Integer, default=0, nullable=False)
    ai_tutor_time_minutes = Column(Integer, default=0, nullable=False)
    past_paper_time_minutes = Column(Integer, default=0, nullable=False)
    exam_time_minutes = Column(Integer, default=0, nullable=False)
    other_time_minutes = Column(Integer, default=0, nullable=False)

    # Session metadata
    ip_address = Column(String(45), nullable=True)  # Support IPv6
    user_agent = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="login_sessions")

    def __repr__(self):
        return f"<UserLoginSession(user_id={self.user_id}, login_time={self.login_time}, is_active={self.is_active})>"


class PageTimeTracking(Base):
    __tablename__ = "page_time_tracking"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("user_login_sessions.id", ondelete="CASCADE"), nullable=True)

    # Page information
    page_type = Column(String(50), nullable=False)  # 'material', 'ai_tutor', 'past_paper', 'exam', 'other'
    page_url = Column(Text, nullable=True)
    content_id = Column(UUID(as_uuid=True), ForeignKey("content.id", ondelete="CASCADE"), nullable=True)
    exam_id = Column(UUID(as_uuid=True), nullable=True)

    # Time tracking
    start_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # User activity metrics
    interactions_count = Column(Integer, default=0, nullable=False)
    scroll_depth = Column(Float, default=0.0, nullable=False)  # 0-100 percentage

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="page_time_tracking")
    content = relationship("Content", backref="page_time_tracking")
    session = relationship("UserLoginSession", backref="page_tracking")

    def __repr__(self):
        return f"<PageTimeTracking(user_id={self.user_id}, page_type={self.page_type}, duration={self.duration_seconds})>"


class ChatSender(str, enum.Enum):
    user = "user"
    assistant = "assistant"


class ChatConversation(Base):
    """Chat conversation between student and AI tutor for a specific course"""
    __tablename__ = "chat_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)

    # Conversation metadata
    title = Column(String(200), nullable=True)  # Optional conversation title
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_message_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Conversation settings
    is_active = Column(Boolean, default=True, nullable=False)
    message_count = Column(Integer, default=0, nullable=False)

    # Ensure one conversation per student per course
    __table_args__ = (UniqueConstraint('student_id', 'course_id', name='unique_student_course_conversation'),)

    # Relationships
    student = relationship("User", backref="chat_conversations")
    course = relationship("Course", backref="chat_conversations")
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.created_at")

    def __repr__(self):
        return f"<ChatConversation(student_id={self.student_id}, course_id={self.course_id}, messages={self.message_count})>"


class ChatMessage(Base):
    """Individual chat message in a conversation"""
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False)

    # Message content
    content = Column(Text, nullable=False)
    sender = Column(Enum(ChatSender), nullable=False)

    # Message metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    edited_at = Column(DateTime, nullable=True)
    is_edited = Column(Boolean, default=False, nullable=False)

    # AI response metadata (only for assistant messages)
    response_time_ms = Column(Integer, nullable=True)  # Time taken to generate response
    tokens_used = Column(Integer, nullable=True)  # Tokens used for this response
    model_used = Column(String(50), nullable=True)  # AI model used

    # Sources and context (only for assistant messages)
    sources = Column(ARRAY(Text), nullable=True)  # Source references used
    context_used = Column(Text, nullable=True)  # Context/RAG content used

    # Relationships
    conversation = relationship("ChatConversation", back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage(conversation_id={self.conversation_id}, sender={self.sender}, length={len(self.content)})>"