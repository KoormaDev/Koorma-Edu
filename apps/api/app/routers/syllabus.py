from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.syllabus import Syllabus, SyllabusItem, ItemType
from ..models.course import Course
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_admin

router = APIRouter(prefix="/syllabus", tags=["syllabus"])


class SyllabusCreate(BaseModel):
    course_id: str
    title: str
    description: Optional[str] = None


class SyllabusUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None


class SyllabusItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    item_type: ItemType
    parent_id: Optional[str] = None
    order_index: int = 0


class SyllabusItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None


class SyllabusItemResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    item_type: ItemType
    parent_id: Optional[str] = None
    syllabus_id: str
    order_index: int
    created_at: str
    updated_at: str

    @field_validator('id', 'parent_id', 'syllabus_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True


class SyllabusResponse(BaseModel):
    id: str
    course_id: str
    title: str
    description: Optional[str] = None
    version: Optional[str] = None
    source_document_url: Optional[str] = None
    source_document_type: Optional[str] = None
    created_at: str
    updated_at: str
    items: List[SyllabusItemResponse] = []

    @field_validator('id', 'course_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True


@router.get("/course/{course_id}", response_model=SyllabusResponse)
async def get_course_syllabus(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get syllabus for a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this course")
    
    syllabus = db.query(Syllabus).filter(Syllabus.course_id == course_uuid).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    
    return syllabus


@router.post("/", response_model=SyllabusResponse)
async def create_syllabus(
    syllabus_data: SyllabusCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a syllabus for a course"""
    try:
        course_uuid = uuid.UUID(syllabus_data.course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to create syllabus for this course")
    
    # Check if syllabus already exists
    existing_syllabus = db.query(Syllabus).filter(Syllabus.course_id == course_uuid).first()
    if existing_syllabus:
        raise HTTPException(status_code=400, detail="Syllabus already exists for this course")
    
    syllabus = Syllabus(
        id=uuid.uuid4(),
        course_id=course_uuid,
        title=syllabus_data.title,
        description=syllabus_data.description
    )
    
    db.add(syllabus)
    db.commit()
    db.refresh(syllabus)
    
    return syllabus


@router.post("/create-with-document", response_model=SyllabusResponse)
async def create_syllabus_with_document(
    course_id: str = Form(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    version: Optional[str] = Form("1.0"),
    document: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a syllabus with optional document upload"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to create syllabus for this course")
    
    # Check if syllabus already exists
    existing_syllabus = db.query(Syllabus).filter(Syllabus.course_id == course_uuid).first()
    if existing_syllabus:
        raise HTTPException(status_code=400, detail="Syllabus already exists for this course")
    
    # Handle document upload if provided
    source_document_url = None
    source_document_type = None
    
    if document:
        # Validate file type
        allowed_types = ['.pdf', '.doc', '.docx', '.txt']
        file_extension = '.' + document.filename.split('.')[-1].lower() if document.filename else ''
        
        if file_extension not in allowed_types:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload PDF, Word documents, or text files.")
        
        # Save file
        import os
        from pathlib import Path
        
        upload_dir = Path("uploads/syllabus")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        import time
        filename = f"{int(time.time())}_{document.filename}"
        file_path = upload_dir / filename
        
        with open(file_path, "wb") as buffer:
            content = await document.read()
            buffer.write(content)
        
        source_document_url = str(file_path)
        source_document_type = file_extension[1:]  # Remove the dot
    
    # Create syllabus
    syllabus = Syllabus(
        id=uuid.uuid4(),
        course_id=course_uuid,
        title=title,
        description=description,
        version=version,
        source_document_url=source_document_url,
        source_document_type=source_document_type
    )
    
    db.add(syllabus)
    db.commit()
    db.refresh(syllabus)
    
    return syllabus


@router.put("/{syllabus_id}", response_model=SyllabusResponse)
async def update_syllabus(
    syllabus_id: str,
    syllabus_data: SyllabusUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update syllabus details"""
    try:
        syllabus_uuid = uuid.UUID(syllabus_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid syllabus ID")

    # Find syllabus
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_uuid).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    # Update fields
    update_data = syllabus_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(syllabus, field, value)

    db.commit()
    db.refresh(syllabus)

    return syllabus


@router.delete("/{syllabus_id}")
async def delete_syllabus(
    syllabus_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete an entire syllabus and all its items"""
    try:
        syllabus_uuid = uuid.UUID(syllabus_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid syllabus ID")
    
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_uuid).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == syllabus.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this syllabus")
    
    db.delete(syllabus)
    db.commit()
    
    return {"message": "Syllabus deleted successfully"}


@router.post("/{syllabus_id}/items", response_model=SyllabusItemResponse)
async def create_syllabus_item(
    syllabus_id: str,
    item_data: SyllabusItemCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a syllabus item"""
    try:
        syllabus_uuid = uuid.UUID(syllabus_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid syllabus ID")
    
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_uuid).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == syllabus.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this syllabus")
    
    # Validate parent_id if provided
    parent_uuid = None
    if item_data.parent_id:
        try:
            parent_uuid = uuid.UUID(item_data.parent_id)
            parent_item = db.query(SyllabusItem).filter(
                SyllabusItem.id == parent_uuid,
                SyllabusItem.syllabus_id == syllabus_uuid
            ).first()
            if not parent_item:
                raise HTTPException(status_code=400, detail="Parent item not found")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid parent ID")
    
    item = SyllabusItem(
        id=uuid.uuid4(),
        title=item_data.title,
        description=item_data.description,
        item_type=item_data.item_type,
        parent_id=parent_uuid,
        syllabus_id=syllabus_uuid,
        order_index=item_data.order_index
    )
    
    db.add(item)
    db.commit()
    db.refresh(item)
    
    return item


@router.get("/{syllabus_id}/items", response_model=List[SyllabusItemResponse])
async def get_syllabus_items(
    syllabus_id: str,
    item_type: Optional[ItemType] = None,
    parent_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get syllabus items"""
    try:
        syllabus_uuid = uuid.UUID(syllabus_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid syllabus ID")
    
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_uuid).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == syllabus.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this syllabus")
    
    query = db.query(SyllabusItem).filter(SyllabusItem.syllabus_id == syllabus_uuid)
    
    if item_type:
        query = query.filter(SyllabusItem.item_type == item_type)
    
    if parent_id:
        try:
            parent_uuid = uuid.UUID(parent_id)
            query = query.filter(SyllabusItem.parent_id == parent_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid parent ID")
    elif parent_id == "null" or parent_id == "":
        query = query.filter(SyllabusItem.parent_id.is_(None))
    
    items = query.order_by(SyllabusItem.order_index).all()
    return items


@router.put("/items/{item_id}", response_model=SyllabusItemResponse)
async def update_syllabus_item(
    item_id: str,
    item_data: SyllabusItemUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a syllabus item"""
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    
    item = db.query(SyllabusItem).filter(SyllabusItem.id == item_uuid).first()
    if not item:
        raise HTTPException(status_code=404, detail="Syllabus item not found")
    
    # Check permissions
    syllabus = db.query(Syllabus).filter(Syllabus.id == item.syllabus_id).first()
    course = db.query(Course).filter(Course.id == syllabus.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this item")
    
    # Update fields
    if item_data.title is not None:
        item.title = item_data.title
    if item_data.description is not None:
        item.description = item_data.description
    if item_data.order_index is not None:
        item.order_index = item_data.order_index
    
    db.commit()
    db.refresh(item)
    
    return item


@router.delete("/items/{item_id}")
async def delete_syllabus_item(
    item_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a syllabus item"""
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    
    item = db.query(SyllabusItem).filter(SyllabusItem.id == item_uuid).first()
    if not item:
        raise HTTPException(status_code=404, detail="Syllabus item not found")
    
    # Check permissions
    syllabus = db.query(Syllabus).filter(Syllabus.id == item.syllabus_id).first()
    course = db.query(Course).filter(Course.id == syllabus.course_id).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this item")
    
    db.delete(item)
    db.commit()
    
    return {"message": "Syllabus item deleted successfully"}