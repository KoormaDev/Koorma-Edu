import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, ForeignKey, Integer, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import relationship

from ..db.base import Base


class ItemType(str, enum.Enum):
    subject = "subject"
    topic = "topic"
    subtopic = "subtopic"


class Syllabus(Base):
    __tablename__ = "syllabi"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(50), default="1.0", nullable=False)
    
    # Source document info
    source_document_url = Column(Text, nullable=True)
    source_document_type = Column(String(20), nullable=True)  # pdf, docx, xlsx
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    course = relationship("Course", back_populates="syllabus")
    items = relationship("SyllabusItem", back_populates="syllabus", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Syllabus(id={self.id}, title={self.title}, course_id={self.course_id})>"


class SyllabusItem(Base):
    __tablename__ = "syllabus_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    syllabus_id = Column(UUID(as_uuid=True), ForeignKey("syllabi.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("syllabus_items.id"), nullable=True)
    
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    
    # Hierarchy information
    item_type = Column(ENUM(ItemType, name="item_type", create_type=False), nullable=False)
    order_index = Column(Integer, default=0, nullable=False)
    depth_level = Column(Integer, default=0, nullable=False)
    
    # Progress tracking
    is_completed = Column(Boolean, default=False, nullable=False)
    completion_percentage = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    syllabus = relationship("Syllabus", back_populates="items")
    parent = relationship("SyllabusItem", remote_side=[id], backref="children")
    contents = relationship("Content", back_populates="syllabus_item")
    questions = relationship("Question", back_populates="syllabus_item")

    def __repr__(self):
        return f"<SyllabusItem(id={self.id}, title={self.title}, type={self.item_type})>"