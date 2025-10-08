import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, String, ForeignKey
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..db.base import Base


class UserRole(str, enum.Enum):
    student = "student"
    admin = "admin"
    super_admin = "super_admin"
    institution = "institution"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=True)
    phone_number = Column(String(50), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(ENUM(UserRole, name="user_role", create_type=False), default=UserRole.student, nullable=False)
    institution_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    is_active = Column(String(10), nullable=False)  # active, inactive, pending
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    institution = relationship("User", remote_side=[id], backref="students")
    conversations = relationship(
        "Conversation", back_populates="user", cascade="all, delete-orphan"
    )
    course_enrollments = relationship(
        "CourseEnrollment", back_populates="student"
    )
    submissions = relationship(
        "StudentSubmission", back_populates="student", cascade="all, delete-orphan"
    )
    created_courses = relationship(
        "Course", back_populates="creator", cascade="all, delete-orphan"
    )
    sent_invitations = relationship(
        "StudentInvitation", back_populates="inviter", cascade="all, delete-orphan"
    )
    student_answers = relationship(
        "StudentAnswer", back_populates="student", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"