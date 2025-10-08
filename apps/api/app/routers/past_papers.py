import logging
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.content import Content, ContentType, ContentStatus, DifficultyLevel, QuestionType
from ..models.course import Course
from ..models.syllabus import SyllabusItem
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_admin
from ..services.ocr_service import ocr_service
from ..services.ingestion_service import ingestion_service
from ..services.question_extraction_service import question_extraction_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/past-papers", tags=["past-papers"])


class PastPaperUploadResponse(BaseModel):
    id: str
    title: str
    exam_year: Optional[str] = None
    exam_stage: Optional[str] = None
    status: str
    extraction_method: Optional[str] = None
    pages_processed: Optional[int] = None
    text_extracted: bool = False
    ocr_confidence: Optional[float] = None
    processing_status: str = "pending"

    @field_validator('id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None

    class Config:
        from_attributes = True


class PastPaperResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    exam_year: Optional[str] = None
    exam_stage: Optional[str] = None
    status: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    syllabus_item_id: Optional[str] = None
    course_name: Optional[str] = None
    syllabus_item_title: Optional[str] = None
    created_at: str
    updated_at: str

    @field_validator('id', 'syllabus_item_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v) if v else None

    class Config:
        from_attributes = True


@router.post("/upload", response_model=PastPaperUploadResponse)
async def upload_past_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    exam_year: Optional[str] = Form(None),
    exam_stage: Optional[str] = Form(None),
    difficulty_level: Optional[DifficultyLevel] = Form(None),
    question_type: Optional[QuestionType] = Form(None),
    description: Optional[str] = Form(None),
    course_id: Optional[str] = Form(None),
    syllabus_item_id: Optional[str] = Form(None),
    use_ocr: bool = Form(True),
    extract_questions: bool = Form(False),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Upload and process a past question paper"""
    
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    
    allowed_extensions = {'.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'}
    file_extension = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
    
    if f'.{file_extension}' not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"File type .{file_extension} not supported. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    # Validate course if provided
    course = None
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            course = db.query(Course).filter(Course.id == course_uuid).first()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    # Validate syllabus item if provided
    syllabus_item = None
    if syllabus_item_id:
        try:
            syllabus_uuid = uuid.UUID(syllabus_item_id)
            syllabus_item = db.query(SyllabusItem).filter(SyllabusItem.id == syllabus_uuid).first()
            if not syllabus_item:
                raise HTTPException(status_code=404, detail="Syllabus item not found")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid syllabus item ID")
    
    try:
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Validate file size (50MB limit)
        max_size = 50 * 1024 * 1024  # 50MB
        if file_size > max_size:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size is {max_size // (1024*1024)}MB"
            )
        
        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}_{file.filename}"
        file_path = f"past_papers/{unique_filename}"
        
        # Create content record
        content = Content(
            title=title,
            description=description,
            content_type=ContentType.past_paper,
            status=ContentStatus.processing,
            file_path=file_path,
            file_size=file_size,
            syllabus_item_id=uuid.UUID(syllabus_item_id) if syllabus_item_id else None,
            is_past_paper=True,
            exam_year=exam_year,
            exam_stage=exam_stage,
            difficulty_level=difficulty_level,
            question_type=question_type
        )
        
        db.add(content)
        db.commit()
        db.refresh(content)
        
        # Schedule background processing
        background_tasks.add_task(
            process_past_paper_content,
            str(content.id),
            file_content,
            file.filename,
            use_ocr,
            extract_questions
        )
        
        # Get related information for response
        course_name = None
        syllabus_item_title = None
        
        if syllabus_item:
            syllabus_item_title = syllabus_item.title
            if syllabus_item.syllabus and syllabus_item.syllabus.course:
                course_name = syllabus_item.syllabus.course.name
        elif course:
            course_name = course.name
        
        return PastPaperUploadResponse(
            id=str(content.id),
            title=content.title,
            exam_year=content.exam_year,
            exam_stage=content.exam_stage,
            status=content.status.value,
            processing_status="started"
        )
        
    except Exception as e:
        logger.error(f"Error uploading past paper {file.filename}: {e}")
        # Clean up database record if it was created
        if 'content' in locals():
            try:
                db.delete(content)
                db.commit()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/", response_model=List[PastPaperResponse])
async def get_past_papers(
    course_id: Optional[str] = None,
    exam_year: Optional[str] = None,
    exam_stage: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of past papers with filtering"""
    
    # Build query
    query = db.query(Content).filter(Content.is_past_paper == True)
    
    # Apply filters
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            # Filter by course through syllabus items
            query = query.join(SyllabusItem).join(
                SyllabusItem.syllabus
            ).filter(SyllabusItem.syllabus.has(course_id=course_uuid))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    if exam_year:
        query = query.filter(Content.exam_year == exam_year)
    
    if exam_stage:
        query = query.filter(Content.exam_stage == exam_stage)
    
    if status:
        try:
            status_enum = ContentStatus(status)
            query = query.filter(Content.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status value")
    
    # Apply pagination
    past_papers = query.order_by(Content.created_at.desc()).offset(offset).limit(limit).all()
    
    # Build response with related information
    response = []
    for paper in past_papers:
        course_name = None
        syllabus_item_title = None
        
        if paper.syllabus_item:
            syllabus_item_title = paper.syllabus_item.title
            if paper.syllabus_item.syllabus and paper.syllabus_item.syllabus.course:
                course_name = paper.syllabus_item.syllabus.course.name
        
        response.append(PastPaperResponse(
            id=str(paper.id),
            title=paper.title,
            description=paper.description,
            exam_year=paper.exam_year,
            exam_stage=paper.exam_stage,
            status=paper.status.value,
            file_path=paper.file_path,
            file_size=paper.file_size,
            syllabus_item_id=str(paper.syllabus_item_id) if paper.syllabus_item_id else None,
            course_name=course_name,
            syllabus_item_title=syllabus_item_title,
            created_at=paper.created_at,
            updated_at=paper.updated_at
        ))
    
    return response


@router.get("/{paper_id}", response_model=PastPaperResponse)
async def get_past_paper(
    paper_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific past paper details"""
    
    try:
        paper_uuid = uuid.UUID(paper_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid paper ID")
    
    paper = db.query(Content).filter(
        Content.id == paper_uuid,
        Content.is_past_paper == True
    ).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="Past paper not found")
    
    # Get related information
    course_name = None
    syllabus_item_title = None
    
    if paper.syllabus_item:
        syllabus_item_title = paper.syllabus_item.title
        if paper.syllabus_item.syllabus and paper.syllabus_item.syllabus.course:
            course_name = paper.syllabus_item.syllabus.course.name
    
    return PastPaperResponse(
        id=str(paper.id),
        title=paper.title,
        description=paper.description,
        exam_year=paper.exam_year,
        exam_stage=paper.exam_stage,
        status=paper.status.value,
        file_path=paper.file_path,
        file_size=paper.file_size,
        syllabus_item_id=str(paper.syllabus_item_id) if paper.syllabus_item_id else None,
        course_name=course_name,
        syllabus_item_title=syllabus_item_title,
        created_at=paper.created_at,
        updated_at=paper.updated_at
    )


@router.delete("/{paper_id}")
async def delete_past_paper(
    paper_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a past paper"""
    
    try:
        paper_uuid = uuid.UUID(paper_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid paper ID")
    
    paper = db.query(Content).filter(
        Content.id == paper_uuid,
        Content.is_past_paper == True
    ).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="Past paper not found")
    
    try:
        # Delete from knowledge base
        await ingestion_service.delete_content(str(paper.id))
        
        # Delete database record
        db.delete(paper)
        db.commit()
        
        return {"message": "Past paper deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting past paper {paper_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete past paper")


async def process_past_paper_content(
    content_id: str,
    file_content: bytes,
    filename: str,
    use_ocr: bool = True,
    extract_questions: bool = False
):
    """Background task to process past paper content with OCR"""
    
    logger.info(f"Starting OCR processing for past paper: {filename}")
    
    # Get database session
    from ..db.database import SessionLocal
    db = SessionLocal()
    
    try:
        # Get content record
        content_uuid = uuid.UUID(content_id)
        content = db.query(Content).filter(Content.id == content_uuid).first()
        
        if not content:
            logger.error(f"Content record not found: {content_id}")
            return
        
        # Update status to processing
        content.status = ContentStatus.processing
        db.commit()
        
        # Determine file type and process accordingly
        file_extension = filename.lower().split('.')[-1] if '.' in filename else ''
        extracted_text = ""
        ocr_metadata = {}
        
        if file_extension == 'pdf':
            # Process PDF with OCR
            result = await ocr_service.extract_text_from_pdf(
                file_content, 
                filename, 
                use_ocr=use_ocr
            )
            
            if result["success"]:
                extracted_text = result["text"]
                ocr_metadata = {
                    "extraction_method": result["extraction_method"],
                    "pages_processed": result["pages"],
                    "ocr_used": result["ocr_used"],
                    "confidence_score": result["confidence_score"]
                }
            else:
                logger.error(f"OCR failed for {filename}: {result.get('error', 'Unknown error')}")
                content.status = ContentStatus.failed
                db.commit()
                return
                
        elif file_extension in ['png', 'jpg', 'jpeg', 'tiff', 'bmp']:
            # Process image file
            result = await ocr_service.process_image_file(file_content, filename)
            
            if result["success"]:
                extracted_text = result["text"]
                ocr_metadata = {
                    "extraction_method": "ocr",
                    "pages_processed": 1,
                    "ocr_used": True,
                    "confidence_score": result["confidence_score"],
                    "file_format": result["file_format"]
                }
            else:
                logger.error(f"Image OCR failed for {filename}: {result.get('error', 'Unknown error')}")
                content.status = ContentStatus.failed
                db.commit()
                return
        
        # Store extracted text
        content.content_text = extracted_text
        
        # If we have text, process it for RAG
        if extracted_text and extracted_text.strip():
            # Prepare metadata for ingestion
            ingestion_metadata = {
                "content_id": str(content.id),
                "title": content.title,
                "exam_year": content.exam_year,
                "exam_stage": content.exam_stage,
                "syllabus_item_id": str(content.syllabus_item_id) if content.syllabus_item_id else None,
                "is_past_paper": True,
                **ocr_metadata
            }
            
            # Process for knowledge base
            ingestion_result = await ingestion_service.process_file(
                file_content,
                filename,
                ContentType.past_paper,
                ingestion_metadata
            )
            
            if ingestion_result["success"]:
                # Extract questions if requested
                if extract_questions:
                    logger.info(f"Extracting questions from {filename}")
                    await extract_and_store_questions(
                        content, extracted_text, db
                    )
                
                content.status = ContentStatus.completed
                logger.info(f"Successfully processed past paper {filename}: {ingestion_result['chunks_processed']} chunks created")
            else:
                logger.error(f"Ingestion failed for {filename}: {ingestion_result.get('error', 'Unknown error')}")
                content.status = ContentStatus.failed
        else:
            logger.warning(f"No text extracted from {filename}")
            content.status = ContentStatus.failed
        
        db.commit()
        
    except Exception as e:
        logger.error(f"Error processing past paper {filename}: {e}")
        if content:
            content.status = ContentStatus.failed
            db.commit()
    finally:
        db.close()


async def extract_and_store_questions(content: Content, text: str, db: Session):
    """Extract questions from text and store them in database"""
    try:
        # Extract questions using AI service
        extraction_result = await question_extraction_service.extract_questions_from_text(
            text,
            difficulty_level=content.difficulty_level.value if content.difficulty_level else None,
            question_type=content.question_type.value if content.question_type else None,
            exam_year=content.exam_year,
            exam_stage=content.exam_stage
        )
        
        if not extraction_result["success"]:
            logger.error(f"Question extraction failed: {extraction_result.get('error')}")
            return
        
        logger.info(f"Extracted {len(extraction_result.get('questions', []))} questions from content {content.id}")
        
        # Store questions using the service method
        stored_questions = question_extraction_service.store_extracted_questions(
            extraction_result, content, db
        )
        
        logger.info(f"Successfully stored {len(stored_questions)} questions for content {content.id}")
        
    except Exception as e:
        logger.error(f"Error extracting and storing questions: {e}")
        db.rollback()