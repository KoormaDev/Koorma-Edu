import enum
import uuid
from datetime import datetime, timedelta

from sqlalchemy import Column, DateTime, String, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import relationship

from ..db.base import Base


class InvitationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"
    cancelled = "cancelled"


class StudentInvitation(Base):
    __tablename__ = "student_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    inviter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Student information
    email = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    
    # Invitation details
    invitation_token = Column(String(255), unique=True, nullable=False)
    status = Column(ENUM(InvitationStatus, name="invitation_status", create_type=False), 
                   default=InvitationStatus.pending, nullable=False)
    
    # Timestamps
    invited_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    
    # Optional message from inviter
    personal_message = Column(String(1000), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    course = relationship("Course", back_populates="invitations")
    inviter = relationship("User", back_populates="sent_invitations", foreign_keys=[inviter_id])

    def __repr__(self):
        return f"<StudentInvitation(id={self.id}, email={self.email}, status={self.status})>"

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at and self.status == InvitationStatus.pending

    @classmethod
    def create_invitation_token(cls) -> str:
        """Generate a unique invitation token"""
        return str(uuid.uuid4()).replace('-', '')

    def get_invitation_url(self, base_url: str) -> str:
        """Get the full invitation URL for the student"""
        return f"{base_url}/invite/accept/{self.invitation_token}"