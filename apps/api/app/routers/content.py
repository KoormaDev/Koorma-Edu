from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Request, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.content import Content, ContentType, ContentStatus, MaterialProcessingStatus, Language, ContentSummary, StudentMaterialProgress, StudentStudySession, ChatConversation, ChatMessage, ChatSender
from ..models.syllabus import SyllabusItem, Syllabus
from ..models.course import Course
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_admin
from ..services.ingestion_service import ingestion_service
from ..services.embedding_service import EmbeddingService
from ..services.qdrant_service import QdrantService
from ..services.ocr_service import ocr_service
from ..services.translation_service import translation_service

router = APIRouter(prefix="/content", tags=["content"])

# Initialize services
embedding_service = EmbeddingService()
qdrant_service = QdrantService()

import logging
logger = logging.getLogger(__name__)

from openai import OpenAI
openai_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None


async def process_content_embeddings(
    content_id: str,
    content_text: str = None,
    file_path: str = None,
    external_url: str = None,
    metadata: dict = None
):
    """Background task to process content embeddings and update status"""
    from ..db.database import get_db

    db = next(get_db())

    try:
        # Get content from database
        content_uuid = uuid.UUID(content_id)
        content = db.query(Content).filter(Content.id == content_uuid).first()

        if not content:
            logger.error(f"Content {content_id} not found for embedding processing")
            return

        # Update status to processing
        content.processing_status = MaterialProcessingStatus.embedding
        db.commit()

        logger.info(f"Starting embedding processing for content {content_id}")

        # Process the content using existing ingestion service
        try:
            await ingestion_service.process_content(
                str(content.id),
                content_text or content.content_text,
                file_path or content.file_path,
                external_url or content.source_url,
                metadata or {
                    'title': content.title,
                    'description': content.description or '',
                    'content_type': content.content_type.value,
                    'language': content.language.value
                }
            )

            # Mark as ready
            content.processing_status = MaterialProcessingStatus.ready
            logger.info(f"Embedding processing completed for content {content_id}")

        except Exception as e:
            logger.error(f"Embedding processing failed for content {content_id}: {e}")
            content.processing_status = MaterialProcessingStatus.failed

        db.commit()

    except Exception as e:
        logger.error(f"Error in background embedding processing for {content_id}: {e}")
        db.rollback()
    finally:
        db.close()

async def generate_content_summary(
    content_id: str,
    content_text: str = None,
    file_path: str = None,
    url: str = None,
    metadata: dict = None
):
    """Generate AI-powered content summary"""
    if not openai_client:
        logger.warning(f"OpenAI client not available, skipping summary generation for content {content_id}")
        return

    try:
        # Get the actual content to summarize
        text_to_summarize = ""
        content_type = metadata.get('content_type', 'document') if metadata else 'document'

        if content_text:
            text_to_summarize = content_text
        elif file_path:
            # Extract text from file if available
            try:
                if file_path.lower().endswith('.txt'):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        text_to_summarize = f.read()
                else:
                    # For other file types, use ingestion service to extract text
                    logger.info(f"Extracting text from file {file_path} for summary")
                    # For now, skip non-text files as text extraction might be complex
                    return
            except Exception as e:
                logger.warning(f"Could not extract text from file {file_path}: {e}")
                return

        if not text_to_summarize or len(text_to_summarize.strip()) < 50:
            logger.warning(f"Insufficient content for summary generation: {len(text_to_summarize)} chars")
            return

        # Truncate if too long (keep first 8000 chars for summary)
        if len(text_to_summarize) > 8000:
            text_to_summarize = text_to_summarize[:8000] + "..."

        # Generate summary using OpenAI
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """You are an AI assistant that creates comprehensive educational content summaries.
                    Generate a structured summary with:
                    1. A brief overview (2-3 sentences)
                    2. Key topics covered (3-5 bullet points)
                    3. Learning objectives (2-4 bullet points)
                    4. Target difficulty level (Beginner/Intermediate/Advanced)

                    Format as JSON with these exact fields:
                    {
                        "summary_text": "Brief overview here",
                        "key_topics": ["topic1", "topic2", "topic3"],
                        "learning_objectives": ["objective1", "objective2"],
                        "difficulty_level": "Beginner|Intermediate|Advanced",
                        "estimated_read_time": "5-10 minutes"
                    }"""
                },
                {
                    "role": "user",
                    "content": f"Create a comprehensive educational summary for this {content_type} content:\n\n{text_to_summarize}"
                }
            ],
            temperature=0.3,
            max_tokens=1000
        )

        import json
        summary_data = json.loads(response.choices[0].message.content)

        # Save to database
        from ..db.database import SessionLocal
        db = SessionLocal()
        try:
            content_uuid = uuid.UUID(content_id)

            # Check if summary already exists
            existing = db.query(ContentSummary).filter(ContentSummary.content_id == content_uuid).first()
            if existing:
                logger.info(f"Content summary already exists for {content_id}, skipping")
                return

            # Create new summary
            content_summary = ContentSummary(
                content_id=content_uuid,
                summary_text=summary_data.get('summary_text', ''),
                key_topics=summary_data.get('key_topics', []),
                learning_objectives=summary_data.get('learning_objectives', []),
                difficulty_level=summary_data.get('difficulty_level', 'Intermediate'),
                estimated_read_time=summary_data.get('estimated_read_time', '5-10 minutes')
            )

            db.add(content_summary)
            db.commit()
            logger.info(f"Created content summary for {content_id}")

        except Exception as e:
            db.rollback()
            logger.error(f"Database error creating content summary: {e}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error generating content summary for {content_id}: {e}")

async def process_content_for_embeddings(
    content_id: str,
    content_text: str = None,
    file_path: str = None,
    url: str = None,
    metadata: dict = None
):
    """Background task to process content and create embeddings"""
    logger.info(f"Starting background processing for content {content_id}")
    logger.info(f"Processing type: text={bool(content_text)}, file={bool(file_path)}, url={bool(url)}")
    
    try:
        if metadata is None:
            metadata = {}
        
        metadata['content_id'] = content_id
        
        if content_text:
            # Process text content
            chunks = ingestion_service._split_text_into_chunks(content_text)
            logger.info(f"Split text into {len(chunks)} chunks")
            
            for i, chunk in enumerate(chunks):
                chunk_metadata = {
                    **metadata,
                    'chunk_index': i,
                    'total_chunks': len(chunks),
                    'content_type': 'text'
                }
                
                embedding = await embedding_service.create_embedding(chunk)
                if embedding:
                    await qdrant_service.add_content(
                        content_id=f"{content_id}_{i}",
                        text=chunk,
                        embedding=embedding,
                        metadata=chunk_metadata
                    )
                    logger.info(f"Added chunk {i+1}/{len(chunks)} to Qdrant")
                else:
                    logger.warning(f"Failed to create embedding for chunk {i}")
            
            logger.info(f"Completed processing {len(chunks)} chunks for content {content_id}")
        
        elif file_path:
            # Process file content
            import os
            if os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                
                content_type = ContentType.document  # Default
                filename = os.path.basename(file_path)
                
                # Get language from metadata
                language = metadata.get('language', 'english')

                result = await ingestion_service.process_file(
                    file_content=file_content,
                    filename=filename,
                    content_type=content_type,
                    metadata=metadata,
                    language=language
                )
                logger.info(f"File processing result for {content_id}: {result}")
        
        elif url:
            # Process URL content - handle YouTube URLs specially
            content_type = metadata.get('content_type')
            logger.info(f"Processing URL content. Content type: {content_type}, URL: {url}")
            
            if content_type == 'youtube':
                # Process YouTube video
                from ..services.youtube_service import youtube_service
                try:
                    logger.info(f"Processing YouTube video: {url}")
                    segments, yt_metadata = await youtube_service.process_youtube_video(url)
                    
                    # Merge metadata
                    combined_metadata = {**metadata, **yt_metadata}
                    
                    # Process each transcript segment
                    for i, segment in enumerate(segments):
                        segment_metadata = {
                            **combined_metadata,
                            'chunk_index': i,
                            'total_chunks': len(segments),
                            'start_time_seconds': segment.get('start', 0.0),
                            'filename': f"{yt_metadata.get('title', 'YouTube Video')}.transcript"
                        }
                        
                        # Create embedding for this segment
                        embedding = await embedding_service.create_embedding(segment['text'])
                        if embedding:
                            await qdrant_service.add_content(
                                content_id=f"{content_id}_{i}",
                                text=segment['text'],
                                embedding=embedding,
                                metadata=segment_metadata
                            )
                    
                    logger.info(f"Successfully processed YouTube video with {len(segments)} segments")
                except Exception as e:
                    logger.error(f"Failed to process YouTube video {url}: {e}")
                    raise
            elif content_type == 'website':
                # Process website content with scraping
                from ..services.web_scraping_service import web_scraping_service
                try:
                    logger.info(f"Processing website content with scraping: {url}")
                    scrape_result = await web_scraping_service.scrape_website(url)
                    
                    if scrape_result['success'] and scrape_result['content']:
                        # Split content into chunks for better processing
                        content = scrape_result['content']
                        chunk_size = 1000
                        chunks = [content[i:i+chunk_size] for i in range(0, len(content), chunk_size)]
                        
                        # Create metadata for website content
                        website_metadata = {
                            **metadata,
                            'title': scrape_result['title'],
                            'source_url': url,
                            'content_length': len(content),
                            'scraped': True
                        }
                        
                        # Process each chunk
                        for i, chunk in enumerate(chunks):
                            chunk_metadata = {
                                **website_metadata,
                                'chunk_index': i,
                                'total_chunks': len(chunks),
                                'filename': f"{scrape_result['title']}.website"
                            }
                            
                            # Create embedding for this chunk
                            embedding = await embedding_service.create_embedding(chunk)
                            if embedding:
                                await qdrant_service.add_content(
                                    content_id=f"{content_id}_{i}",
                                    text=chunk,
                                    embedding=embedding,
                                    metadata=chunk_metadata
                                )
                        
                        logger.info(f"Successfully processed website with {len(chunks)} chunks")
                    else:
                        logger.warning(f"Failed to scrape content from {url}: {scrape_result.get('error')}")
                        
                except Exception as e:
                    logger.error(f"Failed to process website {url}: {e}")
                    raise
            else:
                # Process other URL content (video, etc.)
                logger.info(f"Falling back to default URL processing for content_type: {content_type}")
                result = await ingestion_service.process_url_content(
                    url=url,
                    content_type=ContentType.video,  # Default for URLs
                    metadata=metadata
                )
                logger.info(f"URL processing result for {content_id}: {result}")
        
        logger.info(f"Successfully processed content {content_id} for embeddings")

        # Generate content summary after embeddings are created
        await generate_content_summary(content_id, content_text, file_path, url, metadata)

    except Exception as e:
        logger.error(f"Error processing content {content_id} for embeddings: {e}")


class ContentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    content_type: ContentType
    language: Language = Language.english
    syllabus_item_id: Optional[str] = None
    file_path: Optional[str] = None
    external_url: Optional[str] = None
    content_text: Optional[str] = None


class ContentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ContentStatus] = None
    language: Optional[Language] = None
    external_url: Optional[str] = None
    content_text: Optional[str] = None


class ContentResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    content_type: ContentType
    status: ContentStatus
    processing_status: Optional[MaterialProcessingStatus] = MaterialProcessingStatus.ready
    language: Language
    syllabus_item_id: Optional[str] = None
    file_path: Optional[str] = None
    source_url: Optional[str] = None
    content_text: Optional[str] = None
    file_size: Optional[int] = None
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
        return str(v)

    @field_validator('content_type', 'status', 'language', mode='before')
    @classmethod
    def validate_enums(cls, v):
        if hasattr(v, 'value'):
            return v.value
        return str(v)

    class Config:
        from_attributes = True


class ContentSummaryCreate(BaseModel):
    content_id: str
    summary_text: str
    key_topics: Optional[List[str]] = []
    content_type: str
    difficulty_level: Optional[str] = None
    estimated_reading_time: Optional[int] = None
    learning_objectives: Optional[List[str]] = []


class ContentSummaryResponse(BaseModel):
    id: str
    content_id: str
    summary_text: str
    key_topics: Optional[List[str]] = []
    content_type: str
    difficulty_level: Optional[str] = None
    estimated_reading_time: Optional[int] = None
    learning_objectives: Optional[List[str]] = []
    created_at: str
    updated_at: str

    @field_validator('id', 'content_id', mode='before')
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


# Student Progress Tracking Models
class MaterialProgressUpdate(BaseModel):
    is_completed: Optional[bool] = None
    completion_percentage: Optional[float] = None

class MaterialProgressResponse(BaseModel):
    id: str
    student_id: str
    content_id: str
    is_completed: bool
    completion_percentage: float
    time_spent_minutes: int
    first_accessed: str
    last_accessed: str
    completed_at: Optional[str] = None

    @field_validator('id', 'student_id', 'content_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None

    @field_validator('first_accessed', 'last_accessed', 'completed_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True

class StudySessionStart(BaseModel):
    content_id: Optional[str] = None
    course_id: Optional[str] = None
    session_type: str = "study"

class StudySessionEnd(BaseModel):
    session_id: str

class StudySessionResponse(BaseModel):
    id: str
    student_id: str
    content_id: Optional[str] = None
    course_id: Optional[str] = None
    session_start: str
    session_end: Optional[str] = None
    duration_minutes: Optional[int] = None
    session_type: str
    is_active: bool

    @field_validator('id', 'student_id', 'content_id', 'course_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None

    @field_validator('session_start', 'session_end', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True

class CourseProgressResponse(BaseModel):
    course_id: str
    total_materials: int
    completed_materials: int
    completion_percentage: float
    total_time_spent_minutes: int
    materials_progress: List[MaterialProgressResponse]

    @field_validator('course_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None


@router.get("/", response_model=List[ContentResponse])
async def get_content(
    content_type: Optional[ContentType] = None,
    status: Optional[ContentStatus] = None,
    language: Optional[Language] = None,
    syllabus_item_id: Optional[str] = None,
    course_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get content list with filters"""
    query = db.query(Content)
    
    # Apply filters
    if content_type:
        query = query.filter(Content.content_type == content_type)
    if status:
        query = query.filter(Content.status == status)
    elif current_user.role == UserRole.student:
        # Students can only see active content
        query = query.filter(Content.status == ContentStatus.active)
    if language:
        query = query.filter(Content.language == language)
    if syllabus_item_id:
        try:
            item_uuid = uuid.UUID(syllabus_item_id)
            query = query.filter(Content.syllabus_item_id == item_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid syllabus item ID")
    
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            # Use LEFT JOIN to include materials not linked to syllabus items
            # Filter by course: either linked to course syllabus OR unlinked materials
            query = query.outerjoin(SyllabusItem, Content.syllabus_item_id == SyllabusItem.id)\
                         .outerjoin(Syllabus, SyllabusItem.syllabus_id == Syllabus.id)\
                         .filter(
                             # Either linked to this course's syllabus
                             (Syllabus.course_id == course_uuid) |
                             # Or unlinked (no syllabus_item_id)
                             (Content.syllabus_item_id.is_(None))
                         )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    content_list = query.order_by(Content.created_at.desc()).all()
    return content_list


@router.get("/{content_id}", response_model=ContentResponse)
async def get_content_by_id(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific content by ID"""
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")
    
    content = db.query(Content).filter(Content.id == content_uuid).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Check permissions
    if current_user.role == UserRole.student and content.status != ContentStatus.active:
        raise HTTPException(status_code=404, detail="Content not found")
    
    return content


@router.post("/", response_model=ContentResponse)
async def create_content(
    content_data: ContentCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create new content with automatic Tamil to English translation"""
    
    # Validate syllabus_item_id if provided
    syllabus_item_uuid = None
    if content_data.syllabus_item_id:
        try:
            syllabus_item_uuid = uuid.UUID(content_data.syllabus_item_id)
            syllabus_item = db.query(SyllabusItem).filter(
                SyllabusItem.id == syllabus_item_uuid
            ).first()
            if not syllabus_item:
                raise HTTPException(status_code=400, detail="Syllabus item not found")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid syllabus item ID")
    
    # Validate content requirements based on type
    if content_data.content_type == ContentType.document and not content_data.file_path:
        raise HTTPException(status_code=400, detail="Document content requires file_path")
    elif content_data.content_type == ContentType.video and not content_data.external_url:
        raise HTTPException(status_code=400, detail="Video content requires external_url")
    elif content_data.content_type == ContentType.youtube and not content_data.external_url:
        raise HTTPException(status_code=400, detail="YouTube content requires external_url")
    elif content_data.content_type == ContentType.website and not content_data.external_url:
        raise HTTPException(status_code=400, detail="Website content requires external_url")
    elif content_data.content_type == ContentType.text and not content_data.content_text:
        raise HTTPException(status_code=400, detail="Text content requires content_text")
        
    # Validate YouTube URL if content type is YouTube
    if content_data.content_type == ContentType.youtube:
        from ..services.youtube_service import extract_video_id
        if not extract_video_id(content_data.external_url):
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    
    # Check if content is in Tamil and needs translation
    content_text_for_storage = content_data.content_text
    original_tamil_text = None

    if content_data.language == 'ta' and content_data.content_text:
        logger.info(f"Tamil content detected for {content_data.title}, translating to English...")

        # Store original Tamil text for reference
        original_tamil_text = content_data.content_text

        # Translate Tamil text to English for embeddings and AI processing
        translation_result = await translation_service.translate_tamil_to_english(
            content_data.content_text,
            preserve_format=True
        )

        if translation_result["success"]:
            content_text_for_storage = translation_result["translated_text"]
            logger.info(f"Successfully translated Tamil content to English for {content_data.title}")
        else:
            logger.warning(f"Translation failed for {content_data.title}: {translation_result['error']}")
            # Continue with original text if translation fails

    # Determine initial processing status
    initial_processing_status = MaterialProcessingStatus.ready

    if content_data.file_path or content_data.external_url:
        # File uploads or external content need processing for embeddings
        initial_processing_status = MaterialProcessingStatus.embedding
    elif content_data.language == 'ta':
        # Tamil content needed translation (already done above)
        initial_processing_status = MaterialProcessingStatus.ready

    content = Content(
        id=uuid.uuid4(),
        title=content_data.title,
        description=content_data.description,
        content_type=content_data.content_type,
        language=content_data.language,
        processing_status=initial_processing_status,
        syllabus_item_id=syllabus_item_uuid,
        file_path=content_data.file_path,
        source_url=content_data.external_url,
        content_text=content_text_for_storage,  # Store translated text if Tamil, original otherwise
        status=ContentStatus.active
    )
    
    db.add(content)
    db.commit()
    db.refresh(content)

    # Schedule background processing for embeddings
    if initial_processing_status == MaterialProcessingStatus.embedding:
        background_tasks.add_task(
            process_content_embeddings,
            content_id=str(content.id),
            content_text=content_text_for_storage,
            file_path=content_data.file_path,
            external_url=content_data.external_url,
            metadata={
                'content_type': content_data.content_type,
                'title': content_data.title
            }
        )

    # Schedule background task to process content for embeddings
    metadata = {
        'title': content.title,
        'description': content.description or '',
        'content_type': content.content_type.value,
        'language': content.language.value,
        'course_id': None,  # Will be set when we have course info
        'syllabus_item_id': str(content.syllabus_item_id) if content.syllabus_item_id else None
    }
    
    # Get course info if syllabus item is provided
    if content.syllabus_item_id:
        syllabus_item = db.query(SyllabusItem).filter(
            SyllabusItem.id == content.syllabus_item_id
        ).first()
        if syllabus_item and syllabus_item.syllabus:
            metadata['course_id'] = str(syllabus_item.syllabus.course_id)
            logger.info(f"Content {content.id} assigned to course {metadata['course_id']}")
        else:
            logger.warning(f"Could not resolve course for syllabus item {content.syllabus_item_id}")
    else:
        logger.info(f"Content {content.id} has no syllabus item - course_id will be None")
    
    # Process embeddings immediately instead of in background for now
    # This ensures embeddings are created even though it may be slower
    logger.info(f"Processing embeddings immediately for content {content.id}")
    
    # Run the processing task directly (await it)
    import asyncio
    asyncio.create_task(process_content_for_embeddings(
        content_id=str(content.id),
        content_text=content.content_text,
        file_path=content.file_path,
        url=content.source_url,
        metadata=metadata
    ))
    
    # Still add to background task as well for safety
    background_tasks.add_task(
        process_content_for_embeddings,
        content_id=str(content.id),
        content_text=content.content_text,
        file_path=content.file_path,
        url=content.source_url,
        metadata=metadata
    )
    
    return content


@router.put("/{content_id}", response_model=ContentResponse)
async def update_content(
    content_id: str,
    content_data: ContentUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update content"""
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")
    
    content = db.query(Content).filter(Content.id == content_uuid).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Update fields
    if content_data.title is not None:
        content.title = content_data.title
    if content_data.description is not None:
        content.description = content_data.description
    if content_data.status is not None:
        content.status = content_data.status
    if content_data.language is not None:
        content.language = content_data.language
    if content_data.external_url is not None:
        content.source_url = content_data.external_url
    if content_data.content_text is not None:
        content.content_text = content_data.content_text
    
    db.commit()
    db.refresh(content)
    
    return content


@router.delete("/{content_id}")
async def delete_content(
    content_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete content completely from PostgreSQL, Qdrant, and file system"""
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")
    
    content = db.query(Content).filter(Content.id == content_uuid).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Store file path before deleting from database
    file_path = content.file_path
    
    try:
        # Delete from PostgreSQL first
        db.delete(content)
        db.commit()
        logger.info(f"Deleted content {content_id} from PostgreSQL")
        
        # Delete from Qdrant vector database
        try:
            await qdrant_service.delete_content(content_id)
            logger.info(f"Deleted content {content_id} from Qdrant")
        except Exception as e:
            logger.error(f"Failed to delete content {content_id} from Qdrant: {e}")
            # Don't fail the entire operation if Qdrant deletion fails
        
        # Delete physical file if it exists
        if file_path:
            try:
                import os
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Deleted physical file: {file_path}")
            except Exception as e:
                logger.error(f"Failed to delete physical file {file_path}: {e}")
                # Don't fail the entire operation if file deletion fails
                
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete content {content_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete content: {str(e)}")
    
    return {
        "message": "Content deleted successfully from all systems", 
        "deleted_from": ["PostgreSQL", "Qdrant", "FileSystem"]
    }


@router.post("/upload")
async def upload_content_file(
    file: UploadFile = File(...),
    use_ocr: bool = Form(False),
    language: str = Form("en"),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Upload a content file - returns immediately without processing"""

    # Validate file type
    allowed_extensions = {'.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png', '.mp4', '.avi', '.mov'}
    file_extension = '.' + file.filename.split('.')[-1].lower() if '.' in file.filename else ''

    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file_extension} not allowed. Allowed types: {', '.join(allowed_extensions)}"
        )

    # Check file size (100MB limit)
    if file.size and file.size > 100 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds 100MB limit"
        )

    # Generate unique filename
    file_id = str(uuid.uuid4())
    filename = f"{file_id}_{file.filename}"

    # Create uploads directory if it doesn't exist
    import os
    upload_dir = "uploads/content"
    os.makedirs(upload_dir, exist_ok=True)

    # Save file to disk - simplified approach
    file_path = f"{upload_dir}/{filename}"
    try:
        contents = await file.read()
        file_size = len(contents)

        with open(file_path, "wb") as f:
            f.write(contents)

        logger.info(f"Saved file {file.filename} ({file_size} bytes) to {file_path}")

    except Exception as e:
        # Clean up partial file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error(f"Failed to save file {file.filename}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Prepare response
    response = {
        "message": "File uploaded successfully",
        "file_path": file_path,
        "original_filename": file.filename,
        "file_size": file_size,
        "ocr_requested": use_ocr,
        "language": language
    }

    # Create content record in database with initial status
    content = Content(
        title=file.filename,
        content_type=ContentType.document if file_extension in {'.pdf', '.docx'} else ContentType.video,
        file_path=file_path,
        source_url=None,
        content_text="",  # Will be filled by background processing
        status=ContentStatus.active,
        processing_status=MaterialProcessingStatus.uploading,
        language=Language.ta if language == "ta" else Language.en
    )

    db.add(content)
    db.commit()
    db.refresh(content)

    # Re-enable background processing for Tamil documents
    if language == "ta" and file_extension in {'.pdf', '.docx'}:
        logger.info(f"Scheduling Tamil document processing for {file.filename}")
        # Start processing in a separate thread
        import threading
        thread = threading.Thread(
            target=process_tamil_document_sync,
            args=(str(content.id), file_path, file_extension, file.filename)
        )
        thread.daemon = True
        thread.start()
    elif file_extension in {'.pdf', '.docx'}:
        logger.info(f"Scheduling document processing for {file.filename}")
        # Start processing in a separate thread for English documents
        import threading
        thread = threading.Thread(
            target=process_document_sync,
            args=(str(content.id), file_path, file_extension, file.filename)
        )
        thread.daemon = True
        thread.start()
    else:
        logger.info(f"File {file.filename} uploaded successfully, no processing needed for this file type")

    # Return immediate response
    return {
        "message": "File uploaded successfully. Processing in background.",
        "content_id": str(content.id),
        "file_path": file_path,
        "original_filename": file.filename,
        "file_size": file_size,
        "language": language,
        "processing_status": "uploading",
        "note": "Tamil documents will be translated to English before embedding generation" if language == "ta" else None
    }


def process_tamil_document_sync(content_id: str, file_path: str, file_extension: str, filename: str):
    """Synchronous version of Tamil document processing for threading"""
    import asyncio

    # Create a new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(process_tamil_document(content_id, file_path, file_extension, filename))
    finally:
        loop.close()


def process_document_sync(content_id: str, file_path: str, file_extension: str, filename: str):
    """Synchronous version of document processing for threading"""
    import asyncio

    # Create a new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(process_document_for_embeddings(content_id, file_path, file_extension, filename))
    finally:
        loop.close()


async def process_tamil_document(content_id: str, file_path: str, file_extension: str, filename: str):
    """Background task to process Tamil PDF/DOCX documents"""
    from ..db.database import get_db

    db = next(get_db())

    try:
        # Update status to extracting
        content = db.query(Content).filter(Content.id == content_id).first()
        if not content:
            logger.error(f"Content {content_id} not found for processing")
            return

        content.processing_status = MaterialProcessingStatus.extracting
        db.commit()

        # Extract text from file
        extracted_text = ""

        if file_extension == '.pdf':
            # Read PDF file
            import PyPDF2
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    extracted_text += page.extract_text() + "\n"

        elif file_extension == '.docx':
            # Read DOCX file
            from docx import Document
            doc = Document(file_path)
            extracted_text = "\n".join([paragraph.text for paragraph in doc.paragraphs if paragraph.text])

        if not extracted_text:
            logger.warning(f"No text extracted from {filename}")
            content.processing_status = MaterialProcessingStatus.failed
            db.commit()
            return

        logger.info(f"Extracted {len(extracted_text)} characters from {filename}")

        # Update status to translating
        content.processing_status = MaterialProcessingStatus.translating
        db.commit()

        # Translate Tamil to English
        translation_result = await translation_service.translate_tamil_to_english(
            extracted_text,
            preserve_format=True
        )

        if not translation_result["success"]:
            logger.error(f"Translation failed for {filename}: {translation_result['error']}")
            content.processing_status = MaterialProcessingStatus.failed
            db.commit()
            return

        translated_text = translation_result["translated_text"]
        logger.info(f"Successfully translated {filename} from Tamil to English")

        # Store translated text
        content.content_text = translated_text
        # Note: Original text could be stored if we add an original_text field to Content model

        # Update status to embedding
        content.processing_status = MaterialProcessingStatus.embedding
        db.commit()

        # Generate embeddings for translated text
        await generate_embeddings_for_content(content_id, translated_text, db)

        # Update final status
        content.processing_status = MaterialProcessingStatus.ready
        db.commit()

        logger.info(f"Successfully processed Tamil document {filename}")

    except Exception as e:
        logger.error(f"Error processing Tamil document {filename}: {str(e)}")
        content = db.query(Content).filter(Content.id == content_id).first()
        if content:
            content.processing_status = MaterialProcessingStatus.failed
            db.commit()


async def process_document_for_embeddings(content_id: str, file_path: str, file_extension: str, filename: str):
    """Background task to process regular documents for embeddings"""
    from ..db.database import get_db

    db = next(get_db())

    try:
        # Update status to extracting
        content = db.query(Content).filter(Content.id == content_id).first()
        if not content:
            logger.error(f"Content {content_id} not found for processing")
            return

        content.processing_status = MaterialProcessingStatus.extracting
        db.commit()

        # Extract text from file
        extracted_text = ""

        if file_extension == '.pdf':
            # Read PDF file
            import PyPDF2
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    extracted_text += page.extract_text() + "\n"

        elif file_extension == '.docx':
            # Read DOCX file
            from docx import Document
            doc = Document(file_path)
            extracted_text = "\n".join([paragraph.text for paragraph in doc.paragraphs if paragraph.text])

        if not extracted_text:
            logger.warning(f"No text extracted from {filename}")
            content.processing_status = MaterialProcessingStatus.failed
            db.commit()
            return

        logger.info(f"Extracted {len(extracted_text)} characters from {filename}")

        # Store extracted text
        content.content_text = extracted_text

        # Update status to embedding
        content.processing_status = MaterialProcessingStatus.embedding
        db.commit()

        # Generate embeddings
        await generate_embeddings_for_content(content_id, extracted_text, db)

        # Update final status
        content.processing_status = MaterialProcessingStatus.ready
        db.commit()

        logger.info(f"Successfully processed document {filename}")

    except Exception as e:
        logger.error(f"Error processing document {filename}: {str(e)}")
        content = db.query(Content).filter(Content.id == content_id).first()
        if content:
            content.processing_status = MaterialProcessingStatus.failed
            db.commit()


async def generate_embeddings_for_content(content_id: str, text: str, db):
    """Generate embeddings for content text"""
    try:
        # Split text into chunks (max 8000 chars per chunk for OpenAI)
        chunk_size = 8000
        chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

        for i, chunk in enumerate(chunks):
            if not chunk.strip():
                continue

            # Generate embedding
            embedding = await embedding_service.generate_embedding(chunk)

            # Store in Qdrant
            metadata = {
                "content_id": content_id,
                "chunk_index": i,
                "chunk_text": chunk[:500]  # Store first 500 chars for reference
            }

            await qdrant_service.add_content(
                content_id=f"{content_id}_{i}",
                embedding=embedding,
                metadata=metadata
            )

        logger.info(f"Generated embeddings for {len(chunks)} chunks of content {content_id}")

    except Exception as e:
        logger.error(f"Error generating embeddings for content {content_id}: {str(e)}")
        raise


@router.get("/download/{file_path:path}")
async def download_file(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    """Download a file"""
    import os
    from pathlib import Path

    # Ensure file path is within allowed directories for security
    allowed_prefixes = ["uploads/", "past_papers/"]
    if not any(file_path.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Try different possible file locations
    possible_paths = [
        file_path,  # Direct path as provided
        os.path.join(os.getcwd(), file_path),  # Relative to current working directory
        os.path.abspath(file_path)  # Absolute path
    ]

    actual_file_path = None
    for path in possible_paths:
        if os.path.exists(path) and os.path.isfile(path):
            actual_file_path = path
            break

    if not actual_file_path:
        logger.error(f"File not found at any of these paths: {possible_paths}")
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    # Extract original filename from the stored filename
    filename_parts = os.path.basename(file_path).split('_', 1)
    original_filename = filename_parts[1] if len(filename_parts) > 1 else os.path.basename(file_path)

    logger.info(f"Downloading file: {actual_file_path} as {original_filename}")

    return FileResponse(
        path=actual_file_path,
        filename=original_filename,
        media_type='application/octet-stream'
    )


@router.get("/syllabus/{syllabus_item_id}", response_model=List[ContentResponse])
async def get_content_by_syllabus_item(
    syllabus_item_id: str,
    content_type: Optional[ContentType] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all content for a specific syllabus item"""
    try:
        item_uuid = uuid.UUID(syllabus_item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid syllabus item ID")
    
    # Verify syllabus item exists
    syllabus_item = db.query(SyllabusItem).filter(SyllabusItem.id == item_uuid).first()
    if not syllabus_item:
        raise HTTPException(status_code=404, detail="Syllabus item not found")
    
    query = db.query(Content).filter(Content.syllabus_item_id == item_uuid)
    
    if content_type:
        query = query.filter(Content.content_type == content_type)
    
    if current_user.role == UserRole.student:
        query = query.filter(Content.status == ContentStatus.active)

    content_list = query.order_by(Content.created_at.desc()).all()
    return content_list


# Content Summary Endpoints

@router.post("/summaries", response_model=ContentSummaryResponse)
async def create_content_summary(
    summary_data: ContentSummaryCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a content summary"""

    # Validate content_id
    try:
        content_uuid = uuid.UUID(summary_data.content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")

    # Check if content exists
    content = db.query(Content).filter(Content.id == content_uuid).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    # Check if summary already exists for this content
    existing_summary = db.query(ContentSummary).filter(
        ContentSummary.content_id == content_uuid
    ).first()
    if existing_summary:
        raise HTTPException(status_code=409, detail="Summary already exists for this content")

    # Create summary
    summary = ContentSummary(
        id=uuid.uuid4(),
        content_id=content_uuid,
        summary_text=summary_data.summary_text,
        key_topics=summary_data.key_topics or [],
        content_type=summary_data.content_type,
        difficulty_level=summary_data.difficulty_level,
        estimated_reading_time=summary_data.estimated_reading_time,
        learning_objectives=summary_data.learning_objectives or []
    )

    db.add(summary)
    db.commit()
    db.refresh(summary)

    logger.info(f"Created content summary for content {content_uuid}")
    return summary


@router.get("/summaries", response_model=List[ContentSummaryResponse])
async def get_content_summaries(
    course_id: Optional[str] = None,
    content_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get content summaries with optional filters"""

    query = db.query(ContentSummary)

    if content_id:
        try:
            content_uuid = uuid.UUID(content_id)
            query = query.filter(ContentSummary.content_id == content_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content ID")

    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            # Join with content and syllabus to filter by course
            query = query.join(Content, ContentSummary.content_id == Content.id)\
                         .join(SyllabusItem, Content.syllabus_item_id == SyllabusItem.id)\
                         .join(Syllabus, SyllabusItem.syllabus_id == Syllabus.id)\
                         .filter(Syllabus.course_id == course_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")

    summaries = query.order_by(ContentSummary.created_at.desc()).all()
    return summaries


@router.get("/summaries/{summary_id}", response_model=ContentSummaryResponse)
async def get_content_summary(
    summary_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific content summary"""
    try:
        summary_uuid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid summary ID")

    summary = db.query(ContentSummary).filter(ContentSummary.id == summary_uuid).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Content summary not found")

    return summary


@router.get("/summaries/content/{content_id}", response_model=ContentSummaryResponse)
async def get_content_summary_by_content_id(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get content summary by content ID"""
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")

    summary = db.query(ContentSummary).filter(ContentSummary.content_id == content_uuid).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Content summary not found")

    return summary


@router.put("/summaries/{summary_id}", response_model=ContentSummaryResponse)
async def update_content_summary(
    summary_id: str,
    summary_data: ContentSummaryCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a content summary"""
    try:
        summary_uuid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid summary ID")

    summary = db.query(ContentSummary).filter(ContentSummary.id == summary_uuid).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Content summary not found")

    # Update fields
    summary.summary_text = summary_data.summary_text
    summary.key_topics = summary_data.key_topics or []
    summary.content_type = summary_data.content_type
    summary.difficulty_level = summary_data.difficulty_level
    summary.estimated_reading_time = summary_data.estimated_reading_time
    summary.learning_objectives = summary_data.learning_objectives or []

    db.commit()
    db.refresh(summary)

    logger.info(f"Updated content summary {summary_uuid}")
    return summary


@router.delete("/summaries/{summary_id}")
async def delete_content_summary(
    summary_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a content summary"""
    try:
        summary_uuid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid summary ID")

    summary = db.query(ContentSummary).filter(ContentSummary.id == summary_uuid).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Content summary not found")

    db.delete(summary)
    db.commit()

    logger.info(f"Deleted content summary {summary_uuid}")
    return {"message": "Content summary deleted successfully"}


# ================================
# Student Progress Tracking Endpoints
# ================================

@router.get("/progress/material/{content_id}", response_model=MaterialProgressResponse)
async def get_material_progress(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get progress for a specific material"""
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")

    # Check if content exists
    content = db.query(Content).filter(Content.id == content_uuid).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    # Get or create progress record
    progress = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == current_user.id,
        StudentMaterialProgress.content_id == content_uuid
    ).first()

    if not progress:
        # Create new progress record
        progress = StudentMaterialProgress(
            student_id=current_user.id,
            content_id=content_uuid,
            is_completed=False,
            completion_percentage=0.0,
            time_spent_minutes=0
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)

    return progress

@router.put("/progress/material/{content_id}", response_model=MaterialProgressResponse)
async def update_material_progress(
    content_id: str,
    progress_update: MaterialProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update progress for a material"""
    try:
        content_uuid = uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content ID")

    # Check if content exists
    content = db.query(Content).filter(Content.id == content_uuid).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    # Get or create progress record
    progress = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == current_user.id,
        StudentMaterialProgress.content_id == content_uuid
    ).first()

    if not progress:
        progress = StudentMaterialProgress(
            student_id=current_user.id,
            content_id=content_uuid,
            is_completed=False,
            completion_percentage=0.0,
            time_spent_minutes=0
        )
        db.add(progress)

    # Update fields
    if progress_update.is_completed is not None:
        progress.is_completed = progress_update.is_completed
        if progress_update.is_completed:
            progress.completed_at = datetime.utcnow()
            progress.completion_percentage = 100.0
        else:
            progress.completed_at = None

    if progress_update.completion_percentage is not None:
        progress.completion_percentage = max(0.0, min(100.0, progress_update.completion_percentage))
        if progress.completion_percentage >= 100.0:
            progress.is_completed = True
            progress.completed_at = datetime.utcnow()

    progress.last_accessed = datetime.utcnow()

    db.commit()
    db.refresh(progress)

    logger.info(f"Updated material progress for student {current_user.id}, content {content_id}")
    return progress

@router.get("/progress/course/{course_id}", response_model=CourseProgressResponse)
async def get_course_progress(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get overall progress for a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    # Check if course exists
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Get all materials for the course
    materials = db.query(Content).join(SyllabusItem).join(Syllabus).filter(
        Syllabus.course_id == course_uuid,
        Content.is_study_material == True
    ).all()

    # Get progress for all materials
    material_progress = []
    total_time = 0
    completed_count = 0

    for material in materials:
        progress = db.query(StudentMaterialProgress).filter(
            StudentMaterialProgress.student_id == current_user.id,
            StudentMaterialProgress.content_id == material.id
        ).first()

        if progress:
            material_progress.append(progress)
            total_time += progress.time_spent_minutes
            if progress.is_completed:
                completed_count += 1
        else:
            # Create default progress record for response
            default_progress = MaterialProgressResponse(
                id="",
                student_id=str(current_user.id),
                content_id=str(material.id),
                is_completed=False,
                completion_percentage=0.0,
                time_spent_minutes=0,
                first_accessed=datetime.utcnow().isoformat(),
                last_accessed=datetime.utcnow().isoformat(),
                completed_at=None
            )
            material_progress.append(default_progress)

    # Calculate overall completion percentage
    overall_percentage = (completed_count / len(materials) * 100) if materials else 0

    return CourseProgressResponse(
        course_id=str(course_uuid),
        total_materials=len(materials),
        completed_materials=completed_count,
        completion_percentage=overall_percentage,
        total_time_spent_minutes=total_time,
        materials_progress=material_progress
    )

@router.post("/sessions/start", response_model=StudySessionResponse)
async def start_study_session(
    session_data: StudySessionStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start a new study session"""
    # End any active sessions first
    active_sessions = db.query(StudentStudySession).filter(
        StudentStudySession.student_id == current_user.id,
        StudentStudySession.is_active == True
    ).all()

    for session in active_sessions:
        session.is_active = False
        session.session_end = datetime.utcnow()
        if session.session_start:
            duration = session.session_end - session.session_start
            session.duration_minutes = int(duration.total_seconds() / 60)

    # Create new session
    new_session = StudentStudySession(
        student_id=current_user.id,
        content_id=uuid.UUID(session_data.content_id) if session_data.content_id else None,
        course_id=uuid.UUID(session_data.course_id) if session_data.course_id else None,
        session_type=session_data.session_type,
        is_active=True
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    logger.info(f"Started study session for student {current_user.id}")
    return new_session

@router.post("/sessions/end")
async def end_study_session(
    session_data: StudySessionEnd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """End a study session"""
    try:
        session_uuid = uuid.UUID(session_data.session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(StudentStudySession).filter(
        StudentStudySession.id == session_uuid,
        StudentStudySession.student_id == current_user.id,
        StudentStudySession.is_active == True
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")

    # End the session
    session.session_end = datetime.utcnow()
    session.is_active = False

    if session.session_start:
        duration = session.session_end - session.session_start
        session.duration_minutes = int(duration.total_seconds() / 60)

        # Update material progress if this was for a specific content
        if session.content_id:
            progress = db.query(StudentMaterialProgress).filter(
                StudentMaterialProgress.student_id == current_user.id,
                StudentMaterialProgress.content_id == session.content_id
            ).first()

            if progress:
                progress.time_spent_minutes += session.duration_minutes
                progress.last_accessed = datetime.utcnow()
            else:
                # Create new progress record
                progress = StudentMaterialProgress(
                    student_id=current_user.id,
                    content_id=session.content_id,
                    time_spent_minutes=session.duration_minutes,
                    is_completed=False,
                    completion_percentage=0.0
                )
                db.add(progress)

    db.commit()

    logger.info(f"Ended study session {session_uuid} for student {current_user.id}")
    return {"message": "Session ended successfully", "duration_minutes": session.duration_minutes}

@router.get("/sessions/active", response_model=List[StudySessionResponse])
async def get_active_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get active study sessions for the current user"""
    sessions = db.query(StudentStudySession).filter(
        StudentStudySession.student_id == current_user.id,
        StudentStudySession.is_active == True
    ).all()

    return sessions


# Login Session Tracking Endpoints
@router.post("/login-session/start")
async def start_login_session(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start or update login session when user logs in or becomes active"""
    from ..models import UserLoginSession

    # End any existing active sessions for the user
    active_sessions = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == current_user.id,
        UserLoginSession.is_active == True
    ).all()

    for session in active_sessions:
        session.is_active = False
        session.logout_time = datetime.utcnow()
        if session.login_time:
            duration = session.logout_time - session.login_time
            session.duration_minutes = int(duration.total_seconds() / 60)

    # Create new login session
    new_session = UserLoginSession(
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        is_active=True
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    logger.info(f"Started login session for user {current_user.id}")
    return {"session_id": str(new_session.id), "login_time": new_session.login_time.isoformat()}


@router.post("/login-session/heartbeat")
async def update_login_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update last activity time for active login session"""
    from ..models import UserLoginSession

    # Find active session
    session = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == current_user.id,
        UserLoginSession.is_active == True
    ).first()

    if session:
        session.last_activity = datetime.utcnow()
        db.commit()
        return {"message": "Session heartbeat updated"}

    return {"message": "No active session found"}


@router.post("/login-session/end")
async def end_login_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """End login session when user logs out"""
    from ..models import UserLoginSession

    # End all active sessions for the user
    active_sessions = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == current_user.id,
        UserLoginSession.is_active == True
    ).all()

    total_duration = 0
    for session in active_sessions:
        session.is_active = False
        session.logout_time = datetime.utcnow()
        if session.login_time:
            duration = session.logout_time - session.login_time
            session.duration_minutes = int(duration.total_seconds() / 60)
            total_duration += session.duration_minutes

    db.commit()

    logger.info(f"Ended login session for user {current_user.id}, total duration: {total_duration} minutes")
    return {"message": "Session ended successfully", "total_duration_minutes": total_duration}


@router.get("/login-session/total-time")
async def get_total_login_time(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get total time user has spent in the system"""
    from ..models import UserLoginSession

    # Get all sessions for the user
    sessions = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == current_user.id
    ).all()

    total_minutes = 0
    for session in sessions:
        if session.is_active:
            # Calculate current session duration
            if session.login_time:
                duration = datetime.utcnow() - session.login_time
                total_minutes += int(duration.total_seconds() / 60)
        elif session.duration_minutes:
            total_minutes += session.duration_minutes

    # Also get study session time
    study_sessions = db.query(StudentStudySession).filter(
        StudentStudySession.student_id == current_user.id
    ).all()

    study_minutes = 0
    for session in study_sessions:
        if session.is_active and session.session_start:
            duration = datetime.utcnow() - session.session_start
            study_minutes += int(duration.total_seconds() / 60)
        elif session.duration_minutes:
            study_minutes += session.duration_minutes

    return {
        "total_login_time_minutes": total_minutes,
        "total_study_time_minutes": study_minutes,
        "total_time_minutes": max(total_minutes, study_minutes)  # Use the larger value
    }


@router.get("/progress/all-courses")
async def get_all_courses_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get progress for all courses the student is enrolled in"""
    from ..models import Course

    # Get all courses for the student
    enrollments = db.query(enrollment_table).filter(
        enrollment_table.c.student_id == current_user.id
    ).all()

    course_progress_list = []

    for enrollment in enrollments:
        course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        if not course:
            continue

        # Get materials for this course
        materials = db.query(Content).filter(
            Content.course_id == enrollment.course_id,
            Content.is_study_material == True
        ).all()

        # Get progress for materials in this course
        completed_count = 0
        total_time = 0

        for material in materials:
            progress = db.query(StudentMaterialProgress).filter(
                StudentMaterialProgress.student_id == current_user.id,
                StudentMaterialProgress.content_id == material.id
            ).first()

            if progress:
                if progress.is_completed:
                    completed_count += 1
                total_time += progress.time_spent_minutes

        completion_percentage = (completed_count / len(materials) * 100) if materials else 0

        course_progress_list.append({
            "course_id": str(course.id),
            "course_name": course.name,
            "exam_type": course.exam_type,
            "total_materials": len(materials),
            "completed_materials": completed_count,
            "completion_percentage": completion_percentage,
            "time_spent_minutes": total_time
        })

    # Calculate overall statistics
    total_materials = sum(cp["total_materials"] for cp in course_progress_list)
    total_completed = sum(cp["completed_materials"] for cp in course_progress_list)
    total_time = sum(cp["time_spent_minutes"] for cp in course_progress_list)
    overall_percentage = (total_completed / total_materials * 100) if total_materials > 0 else 0

    return {
        "courses": course_progress_list,
        "overall": {
            "total_courses": len(course_progress_list),
            "total_materials": total_materials,
            "completed_materials": total_completed,
            "completion_percentage": overall_percentage,
            "total_time_spent_minutes": total_time
        }
    }


# Page Time Tracking Endpoints
@router.post("/page-tracking/start")
async def start_page_tracking(
    page_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start tracking time on a specific page"""
    from ..models import PageTimeTracking, UserLoginSession

    # End any active page tracking for this user
    active_tracking = db.query(PageTimeTracking).filter(
        PageTimeTracking.user_id == current_user.id,
        PageTimeTracking.is_active == True
    ).all()

    for tracking in active_tracking:
        tracking.is_active = False
        tracking.end_time = datetime.utcnow()
        if tracking.start_time:
            duration = (tracking.end_time - tracking.start_time).total_seconds()
            tracking.duration_seconds = int(duration)

    # Get active login session (session without logout_time)
    active_session = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == current_user.id,
        UserLoginSession.logout_time.is_(None)
    ).order_by(UserLoginSession.login_time.desc()).first()

    # Create new page tracking
    new_tracking = PageTimeTracking(
        user_id=current_user.id,
        session_id=active_session.id if active_session else None,
        page_type=page_data.get("page_type", "other"),
        page_url=page_data.get("page_url"),
        content_id=uuid.UUID(page_data["content_id"]) if page_data.get("content_id") else None,
        exam_id=uuid.UUID(page_data["exam_id"]) if page_data.get("exam_id") else None,
        is_active=True
    )

    db.add(new_tracking)
    db.commit()
    db.refresh(new_tracking)

    return {"tracking_id": str(new_tracking.id), "started": True}


@router.post("/page-tracking/end/{tracking_id}")
async def end_page_tracking(
    tracking_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """End tracking time on a page"""
    from ..models import PageTimeTracking, UserLoginSession

    try:
        tracking_uuid = uuid.UUID(tracking_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tracking ID")

    tracking = db.query(PageTimeTracking).filter(
        PageTimeTracking.id == tracking_uuid,
        PageTimeTracking.user_id == current_user.id,
        PageTimeTracking.is_active == True
    ).first()

    if not tracking:
        raise HTTPException(status_code=404, detail="Active tracking not found")

    # End the tracking
    tracking.is_active = False
    tracking.end_time = datetime.utcnow()
    if tracking.start_time:
        duration = (tracking.end_time - tracking.start_time).total_seconds()
        tracking.duration_seconds = int(duration)

        # Update session totals
        if tracking.session_id:
            session = db.query(UserLoginSession).filter(
                UserLoginSession.id == tracking.session_id
            ).first()

            if session:
                # Update specific page type time
                if tracking.page_type == "material":
                    session.material_time_minutes += int(duration / 60)
                elif tracking.page_type == "ai_tutor":
                    session.ai_tutor_time_minutes += int(duration / 60)
                elif tracking.page_type == "past_paper":
                    session.past_paper_time_minutes += int(duration / 60)
                elif tracking.page_type == "exam":
                    session.exam_time_minutes += int(duration / 60)
                else:
                    session.other_time_minutes += int(duration / 60)

    db.commit()

    return {"tracking_id": tracking_id, "duration_seconds": tracking.duration_seconds}


@router.post("/page-tracking/heartbeat/{tracking_id}")
async def update_page_tracking(
    tracking_id: str,
    activity_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update page tracking with activity data"""
    from ..models import PageTimeTracking

    try:
        tracking_uuid = uuid.UUID(tracking_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tracking ID")

    tracking = db.query(PageTimeTracking).filter(
        PageTimeTracking.id == tracking_uuid,
        PageTimeTracking.user_id == current_user.id,
        PageTimeTracking.is_active == True
    ).first()

    if not tracking:
        raise HTTPException(status_code=404, detail="Active tracking not found")

    # Update activity metrics
    if activity_data.get("interactions_count"):
        tracking.interactions_count = activity_data["interactions_count"]
    if activity_data.get("scroll_depth"):
        tracking.scroll_depth = activity_data["scroll_depth"]

    # Update duration
    if tracking.start_time:
        duration = (datetime.utcnow() - tracking.start_time).total_seconds()
        tracking.duration_seconds = int(duration)

    db.commit()

    return {"tracking_id": tracking_id, "updated": True}


# Chat Persistence Endpoints
@router.get("/chat/conversations/{course_id}")
async def get_chat_conversation(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get or create chat conversation for student and course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    # Get or create conversation
    conversation = db.query(ChatConversation).filter(
        ChatConversation.student_id == current_user.id,
        ChatConversation.course_id == course_uuid
    ).first()

    if not conversation:
        conversation = ChatConversation(
            student_id=current_user.id,
            course_id=course_uuid,
            title=f"Chat with AI Tutor"
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Get messages
    messages = db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation.id
    ).order_by(ChatMessage.created_at).all()

    return {
        "conversation_id": str(conversation.id),
        "course_id": course_id,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "message_count": conversation.message_count,
        "messages": [
            {
                "id": str(msg.id),
                "content": msg.content,
                "sender": msg.sender,
                "created_at": msg.created_at.isoformat(),
                "sources": msg.sources or [],
                "response_time_ms": msg.response_time_ms,
                "model_used": msg.model_used
            }
            for msg in messages
        ]
    }


@router.post("/chat/conversations/{course_id}/messages")
async def add_chat_message(
    course_id: str,
    message_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a new message to the chat conversation"""

    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    # Get or create conversation
    conversation = db.query(ChatConversation).filter(
        ChatConversation.student_id == current_user.id,
        ChatConversation.course_id == course_uuid
    ).first()

    if not conversation:
        conversation = ChatConversation(
            student_id=current_user.id,
            course_id=course_uuid,
            title=f"Chat with AI Tutor"
        )
        db.add(conversation)
        db.flush()  # Get the ID without committing

    # Create the message
    new_message = ChatMessage(
        conversation_id=conversation.id,
        content=message_data.get("content", ""),
        sender=ChatSender(message_data.get("sender", "user")),
        response_time_ms=message_data.get("response_time_ms"),
        tokens_used=message_data.get("tokens_used"),
        model_used=message_data.get("model_used"),
        sources=message_data.get("sources"),
        context_used=message_data.get("context_used")
    )

    db.add(new_message)

    # Update conversation metadata
    conversation.message_count += 1
    conversation.last_message_at = datetime.utcnow()
    conversation.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(new_message)

    return {
        "message_id": str(new_message.id),
        "conversation_id": str(conversation.id),
        "content": new_message.content,
        "sender": new_message.sender,
        "created_at": new_message.created_at.isoformat(),
        "sources": new_message.sources or []
    }


@router.delete("/chat/conversations/{course_id}")
async def clear_chat_conversation(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear all messages in a chat conversation"""

    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")

    # Get conversation
    conversation = db.query(ChatConversation).filter(
        ChatConversation.student_id == current_user.id,
        ChatConversation.course_id == course_uuid
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete all messages
    db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation.id
    ).delete()

    # Reset conversation metadata
    conversation.message_count = 0
    conversation.updated_at = datetime.utcnow()

    db.commit()

    return {"message": "Chat conversation cleared successfully"}


@router.get("/chat/conversations")
async def get_all_chat_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all chat conversations for the current student"""

    conversations = db.query(ChatConversation).join(Course).filter(
        ChatConversation.student_id == current_user.id,
        ChatConversation.is_active == True
    ).order_by(ChatConversation.last_message_at.desc()).all()

    return {
        "conversations": [
            {
                "conversation_id": str(conv.id),
                "course_id": str(conv.course_id),
                "course_name": conv.course.name if conv.course else "Unknown Course",
                "title": conv.title,
                "message_count": conv.message_count,
                "last_message_at": conv.last_message_at.isoformat(),
                "created_at": conv.created_at.isoformat()
            }
            for conv in conversations
        ]
    }


@router.get("/page-tracking/summary")
async def get_page_tracking_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of page time tracking for the user"""
    from ..models import PageTimeTracking, UserLoginSession

    # Get all sessions for the user
    sessions = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == current_user.id
    ).all()

    # Calculate totals
    total_material_time = sum(s.material_time_minutes for s in sessions)
    total_ai_tutor_time = sum(s.ai_tutor_time_minutes for s in sessions)
    total_past_paper_time = sum(s.past_paper_time_minutes for s in sessions)
    total_exam_time = sum(s.exam_time_minutes for s in sessions)
    total_other_time = sum(s.other_time_minutes for s in sessions)

    total_learning_time = (
        total_material_time +
        total_ai_tutor_time +
        total_past_paper_time +
        total_exam_time
    )

    # Get recent page visits
    recent_pages = db.query(PageTimeTracking).filter(
        PageTimeTracking.user_id == current_user.id
    ).order_by(PageTimeTracking.start_time.desc()).limit(10).all()

    return {
        "total_learning_time_minutes": total_learning_time,
        "breakdown": {
            "material_time_minutes": total_material_time,
            "ai_tutor_time_minutes": total_ai_tutor_time,
            "past_paper_time_minutes": total_past_paper_time,
            "exam_time_minutes": total_exam_time,
            "other_time_minutes": total_other_time
        },
        "percentages": {
            "material": round((total_material_time / max(total_learning_time, 1)) * 100, 1),
            "ai_tutor": round((total_ai_tutor_time / max(total_learning_time, 1)) * 100, 1),
            "past_paper": round((total_past_paper_time / max(total_learning_time, 1)) * 100, 1),
            "exam": round((total_exam_time / max(total_learning_time, 1)) * 100, 1)
        },
        "recent_activity": [
            {
                "page_type": page.page_type,
                "duration_seconds": page.duration_seconds,
                "start_time": page.start_time.isoformat() if page.start_time else None
            }
            for page in recent_pages
        ]
    }


@router.get("/page-tracking/summary/student/{student_id}")
async def get_student_page_tracking_summary(
    student_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get summary of page time tracking for a specific student (admin only)"""
    from ..models import PageTimeTracking, UserLoginSession
    import uuid

    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")

    # Verify student exists
    student = db.query(User).filter(User.id == student_uuid, User.role == UserRole.student).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get all sessions for the student
    sessions = db.query(UserLoginSession).filter(
        UserLoginSession.user_id == student_uuid
    ).all()

    # Calculate totals
    total_material_time = sum(s.material_time_minutes for s in sessions)
    total_ai_tutor_time = sum(s.ai_tutor_time_minutes for s in sessions)
    total_past_paper_time = sum(s.past_paper_time_minutes for s in sessions)
    total_exam_time = sum(s.exam_time_minutes for s in sessions)
    total_other_time = sum(s.other_time_minutes for s in sessions)

    total_learning_time = (
        total_material_time +
        total_ai_tutor_time +
        total_past_paper_time +
        total_exam_time
    )

    # Get recent page visits
    recent_pages = db.query(PageTimeTracking).filter(
        PageTimeTracking.user_id == student_uuid
    ).order_by(PageTimeTracking.start_time.desc()).limit(10).all()

    return {
        "total_learning_time_minutes": total_learning_time,
        "breakdown": {
            "material_time_minutes": total_material_time,
            "ai_tutor_time_minutes": total_ai_tutor_time,
            "past_paper_time_minutes": total_past_paper_time,
            "exam_time_minutes": total_exam_time,
            "other_time_minutes": total_other_time
        },
        "percentages": {
            "material": round((total_material_time / max(total_learning_time, 1)) * 100, 1),
            "ai_tutor": round((total_ai_tutor_time / max(total_learning_time, 1)) * 100, 1),
            "past_paper": round((total_past_paper_time / max(total_learning_time, 1)) * 100, 1),
            "exam": round((total_exam_time / max(total_learning_time, 1)) * 100, 1)
        },
        "recent_activity": [
            {
                "page_type": page.page_type,
                "duration_seconds": page.duration_seconds,
                "start_time": page.start_time.isoformat() if page.start_time else None
            }
            for page in recent_pages
        ]
    }