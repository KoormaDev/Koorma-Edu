import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, ForeignKey, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import relationship

from ..db.base import Base


class ExamType(str, enum.Enum):
    competitive = "competitive"
    academic = "academic"
    professional = "professional"
    certification = "certification"


class CourseStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    archived = "archived"


class Course(Base):
    __tablename__ = "courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    exam_type = Column(ENUM(ExamType, name="exam_type", create_type=False), nullable=False)
    default_language = Column(String(10), default="en", nullable=False)
    status = Column(ENUM(CourseStatus, name="course_status", create_type=False), default=CourseStatus.draft, nullable=False)
    
    # Creator/Institution
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Course dates
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    creator = relationship("User", back_populates="created_courses")
    syllabus = relationship("Syllabus", back_populates="course", uselist=False, cascade="all, delete-orphan")
    enrollments = relationship("CourseEnrollment", back_populates="course", cascade="all, delete-orphan")
    mock_exams = relationship("MockExam", back_populates="course", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="course")
    invitations = relationship("StudentInvitation", back_populates="course", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Course(id={self.id}, name={self.name}, exam_type={self.exam_type})>"


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    enrollment_status = Column(String(20), default="active", nullable=False)  # active, completed, dropped
    enrolled_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    course = relationship("Course", back_populates="enrollments")
    student = relationship("User", back_populates="course_enrollments")

    def __repr__(self):
        return f"<CourseEnrollment(course_id={self.course_id}, student_id={self.student_id})>"