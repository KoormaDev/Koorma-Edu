import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from ..core.config import settings

logger = logging.getLogger(__name__)
from ..db.database import get_db
from ..models.conversation import Conversation, Message, MessageSender
from ..models.course import Course
from ..models.user import User, UserRole
from ..services.auth import get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])


class MessageCreate(BaseModel):
    content: str
    course_id: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"
    course_id: Optional[str] = None


class SourceResponse(BaseModel):
    title: str
    content_type: str
    chunk_text: str
    score: float
    metadata: Optional[dict] = None

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender: MessageSender
    content: str
    created_at: str
    sources: Optional[List[SourceResponse]] = None

    @field_validator('id', 'conversation_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, 'text_content'):
            # Create a dict with mapped fields
            data = {
                'id': str(obj.id),
                'conversation_id': str(obj.conversation_id),
                'sender': obj.sender,
                'content': obj.text_content,  # Map text_content to content
                'created_at': obj.created_at.isoformat() if obj.created_at else '',
                'sources': getattr(obj, 'sources', None)
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: str
    title: str
    course_id: Optional[str] = None
    user_id: str
    created_at: str
    updated_at: str
    message_count: Optional[int] = None

    @field_validator('id', 'course_id', 'user_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, 'topic'):
            # Create a dict with mapped fields
            data = {
                'id': str(obj.id),
                'title': obj.topic,  # Map topic to title
                'course_id': str(obj.course_id) if obj.course_id else None,
                'user_id': str(obj.user_id),
                'created_at': obj.created_at.isoformat() if obj.created_at else '',
                'updated_at': obj.updated_at.isoformat() if obj.updated_at else '',
                'message_count': getattr(obj, 'message_count', None)
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    message: MessageResponse
    ai_response: MessageResponse


@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    course_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's conversations"""
    query = db.query(Conversation).filter(Conversation.user_id == current_user.id)
    
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            query = query.filter(Conversation.course_id == course_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    conversations = query.order_by(Conversation.updated_at.desc()).all()
    
    # Add message count for each conversation
    for conv in conversations:
        message_count = db.query(Message).filter(Message.conversation_id == conv.id).count()
        conv.message_count = message_count
    
    return conversations


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific conversation"""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")
    
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Add message count
    message_count = db.query(Message).filter(Message.conversation_id == conv_uuid).count()
    conversation.message_count = message_count
    
    return conversation


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    conv_data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new conversation"""
    
    course_uuid = None
    if conv_data.course_id:
        try:
            course_uuid = uuid.UUID(conv_data.course_id)
            # Verify course exists and user has access
            course = db.query(Course).filter(Course.id == course_uuid).first()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
            
            # For students, check if enrolled (in a real app)
            # For now, allow access to any active course
            
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    conversation = Conversation(
        id=uuid.uuid4(),
        topic=conv_data.title or "New Conversation",
        course_id=course_uuid,
        user_id=current_user.id
    )
    
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    
    conversation.message_count = 0
    return conversation


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get messages in a conversation"""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")
    
    # Verify user owns the conversation
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    messages = db.query(Message).filter(
        Message.conversation_id == conv_uuid
    ).order_by(Message.created_at.desc()).offset(offset).limit(limit).all()
    
    return messages[::-1]  # Return in chronological order


@router.post("/conversations/{conversation_id}/messages", response_model=ChatResponse)
async def send_message(
    conversation_id: str,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message and get AI response"""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")
    
    # Verify user owns the conversation
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Create user message
    user_message = Message(
        id=uuid.uuid4(),
        conversation_id=conv_uuid,
        sender=MessageSender.user,
        text_content=message_data.content
    )
    
    db.add(user_message)
    db.flush()  # Get ID without committing
    
    # Generate AI response with sources
    ai_response_data = await generate_ai_response(
        message_data.content,
        conversation.course_id,
        db
    )
    
    # Create AI message
    ai_message = Message(
        id=uuid.uuid4(),
        conversation_id=conv_uuid,
        sender=MessageSender.ai,
        text_content=ai_response_data["response"] if isinstance(ai_response_data, dict) else ai_response_data
    )
    
    db.add(ai_message)
    
    # Update conversation timestamp
    conversation.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(user_message)
    db.refresh(ai_message)
    
    # Prepare AI message response with sources
    ai_message_response = MessageResponse(
        id=str(ai_message.id),
        conversation_id=str(ai_message.conversation_id),
        sender=ai_message.sender,
        content=ai_message.text_content,
        created_at=ai_message.created_at.isoformat() if ai_message.created_at else "",
        sources=[SourceResponse(**source) for source in ai_response_data.get("sources", [])] if isinstance(ai_response_data, dict) else []
    )
    
    return ChatResponse(
        message=user_message,
        ai_response=ai_message_response
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a conversation"""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")
    
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    db.delete(conversation)
    db.commit()
    
    return {"message": "Conversation deleted successfully"}


@router.put("/conversations/{conversation_id}/title")
async def update_conversation_title(
    conversation_id: str,
    title: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update conversation title"""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")
    
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation.topic = title
    conversation.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {"message": "Conversation title updated successfully"}


# Import RAG service
from ..services.rag_service import rag_service

# AI Response Generation
async def generate_ai_response(
    user_message: str,
    course_id: Optional[uuid.UUID],
    db: Session
) -> Dict[str, Any]:
    """
    Generate AI response using RAG system
    """
    try:
        # Get conversation history from database if needed
        # For now, we'll pass None for history
        
        course_id_str = str(course_id) if course_id else None
        
        logger.info(f"GENERATE_AI_RESPONSE: Query='{user_message}', Course={course_id_str}")
        logger.info(f"GENERATE_AI_RESPONSE: rag_service type: {type(rag_service)}")
        logger.info(f"GENERATE_AI_RESPONSE: rag_service methods: {dir(rag_service)}")
        
        response = await rag_service.generate_response(
            query=user_message,
            course_id=course_id_str,
            conversation_history=None  # Could be enhanced to include recent messages
        )
        
        logger.info(f"GENERATE_AI_RESPONSE RESULT: Response='{response.get('response', '')[:100]}...', Sources={len(response.get('sources', []))}")
        
        return response
        
    except Exception as e:
        logger.error(f"Error generating AI response: {e}")
        logger.exception("Full exception details:")
        return {
            "response": "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
            "sources": []
        }


# Quick Chat Endpoint (for one-off questions)
@router.post("/quick-chat")
async def quick_chat(
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Quick chat without creating a persistent conversation"""
    
    print(f"=== QUICK-CHAT REQUEST: User={current_user.email}, Message='{message_data.content}', Course={message_data.course_id}")
    logger.info(f"QUICK-CHAT REQUEST: User={current_user.email}, Message='{message_data.content}', Course={message_data.course_id}")
    
    course_uuid = None
    if message_data.course_id:
        try:
            course_uuid = uuid.UUID(message_data.course_id)
            logger.info(f"QUICK-CHAT: Parsed course UUID: {course_uuid}")
        except ValueError:
            logger.error(f"QUICK-CHAT: Invalid course ID: {message_data.course_id}")
            raise HTTPException(status_code=400, detail="Invalid course ID")
    
    logger.info(f"QUICK-CHAT: About to call generate_ai_response...")
    
    # Generate AI response
    ai_response_data = await generate_ai_response(
        message_data.content,
        course_uuid,
        db
    )
    
    logger.info(f"QUICK-CHAT RESPONSE: Response length={len(str(ai_response_data.get('response', '')))}, Sources={len(ai_response_data.get('sources', []))}")
    logger.info(f"QUICK-CHAT RESPONSE CONTENT: {str(ai_response_data)[:200]}...")
    
    return {
        "user_message": message_data.content,
        "ai_response": ai_response_data.get("response", ai_response_data) if isinstance(ai_response_data, dict) else ai_response_data,
        "sources": ai_response_data.get("sources", []) if isinstance(ai_response_data, dict) else [],
        "timestamp": datetime.utcnow().isoformat()
    }