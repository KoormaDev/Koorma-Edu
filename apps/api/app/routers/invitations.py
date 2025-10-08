import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.invitation import StudentInvitation, InvitationStatus
from ..models.course import Course, CourseEnrollment
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invitations", tags=["invitations"])


class InvitationCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    personal_message: Optional[str] = None


class BulkInvitationCreate(BaseModel):
    emails: List[EmailStr]
    personal_message: Optional[str] = None


class InvitationResponse(BaseModel):
    id: str
    course_id: str
    email: str
    full_name: Optional[str] = None
    status: InvitationStatus
    invited_at: str
    expires_at: str
    accepted_at: Optional[str] = None
    personal_message: Optional[str] = None
    invitation_url: Optional[str] = None
    
    # Additional fields for UI display
    course_name: Optional[str] = None
    course_description: Optional[str] = None
    exam_type: Optional[str] = None
    inviter_name: Optional[str] = None

    @field_validator('id', 'course_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('invited_at', 'expires_at', 'accepted_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v) if v else None

    class Config:
        from_attributes = True


class InvitationAcceptance(BaseModel):
    full_name: str
    password: str


@router.post("/courses/{course_id}/invite", response_model=InvitationResponse)
async def invite_student(
    course_id: str,
    invitation_data: InvitationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Send invitation to a student"""
    
    # Validate course ID and check permissions
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if user has permission to invite to this course
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to invite to this course")
    
    # Check if invitation already exists for this email and course
    existing_invitation = db.query(StudentInvitation).filter(
        StudentInvitation.course_id == course_uuid,
        StudentInvitation.email == invitation_data.email,
        StudentInvitation.status == InvitationStatus.pending
    ).first()
    
    if existing_invitation:
        raise HTTPException(
            status_code=400, 
            detail="A pending invitation already exists for this email"
        )
    
    # Check if user is already enrolled
    existing_user = db.query(User).filter(User.email == invitation_data.email).first()
    if existing_user:
        existing_enrollment = db.query(CourseEnrollment).filter(
            CourseEnrollment.course_id == course_uuid,
            CourseEnrollment.student_id == existing_user.id
        ).first()
        if existing_enrollment:
            raise HTTPException(
                status_code=400, 
                detail="Student is already enrolled in this course"
            )
    
    # Create invitation
    invitation = StudentInvitation(
        course_id=course_uuid,
        inviter_id=current_user.id,
        email=invitation_data.email,
        full_name=invitation_data.full_name,
        personal_message=invitation_data.personal_message,
        invitation_token=StudentInvitation.create_invitation_token(),
        expires_at=datetime.utcnow() + timedelta(days=7)  # 7 days to accept
    )
    
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    
    # Send invitation email in background
    background_tasks.add_task(
        send_invitation_email,
        invitation.email,
        invitation.full_name or invitation.email,
        course.name,
        invitation.invitation_token,
        invitation.personal_message
    )
    
    # Prepare response with invitation URL
    invitation_response = InvitationResponse.model_validate(invitation)
    invitation_response.invitation_url = invitation.get_invitation_url(settings.FRONTEND_URL)
    
    return invitation_response


@router.post("/courses/{course_id}/bulk-invite", response_model=List[InvitationResponse])
async def bulk_invite_students(
    course_id: str,
    invitation_data: BulkInvitationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Send bulk invitations to multiple students"""
    
    # Validate course ID and check permissions
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check if user has permission to invite to this course
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to invite to this course")
    
    invitations = []
    successful_invitations = []
    failed_invitations = []
    
    for email in invitation_data.emails:
        try:
            # Check if invitation already exists
            existing_invitation = db.query(StudentInvitation).filter(
                StudentInvitation.course_id == course_uuid,
                StudentInvitation.email == email,
                StudentInvitation.status == InvitationStatus.pending
            ).first()
            
            if existing_invitation:
                failed_invitations.append(f"{email}: Already has pending invitation")
                continue
            
            # Check if user is already enrolled
            existing_user = db.query(User).filter(User.email == email).first()
            if existing_user:
                existing_enrollment = db.query(CourseEnrollment).filter(
                    CourseEnrollment.course_id == course_uuid,
                    CourseEnrollment.student_id == existing_user.id
                ).first()
                if existing_enrollment:
                    failed_invitations.append(f"{email}: Already enrolled")
                    continue
            
            # Create invitation
            invitation = StudentInvitation(
                course_id=course_uuid,
                inviter_id=current_user.id,
                email=email,
                personal_message=invitation_data.personal_message,
                invitation_token=StudentInvitation.create_invitation_token(),
                expires_at=datetime.utcnow() + timedelta(days=7)
            )
            
            db.add(invitation)
            invitations.append(invitation)
            successful_invitations.append(email)
            
        except Exception as e:
            logger.error(f"Failed to create invitation for {email}: {e}")
            failed_invitations.append(f"{email}: Error creating invitation")
    
    if invitations:
        db.commit()
        for invitation in invitations:
            db.refresh(invitation)
            
            # Send invitation emails in background
            background_tasks.add_task(
                send_invitation_email,
                invitation.email,
                invitation.email,  # Use email as name for bulk invites
                course.name,
                invitation.invitation_token,
                invitation.personal_message
            )
    
    # Convert to response format
    response_invitations = [
        InvitationResponse.model_validate(inv) for inv in invitations
    ]
    
    # Log results
    if failed_invitations:
        logger.warning(f"Some invitations failed: {failed_invitations}")
    
    return response_invitations


@router.get("/courses/{course_id}/invitations", response_model=List[InvitationResponse])
async def get_course_invitations(
    course_id: str,
    status: Optional[InvitationStatus] = None,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all invitations for a course"""
    
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view invitations")
    
    query = db.query(StudentInvitation).filter(StudentInvitation.course_id == course_uuid)
    
    if status:
        query = query.filter(StudentInvitation.status == status)
    
    invitations = query.order_by(StudentInvitation.invited_at.desc()).all()
    
    return [InvitationResponse.model_validate(inv) for inv in invitations]


@router.post("/accept/{invitation_token}")
async def accept_invitation(
    invitation_token: str,
    acceptance_data: InvitationAcceptance,
    db: Session = Depends(get_db)
):
    """Accept an invitation and create/enroll student account"""
    
    invitation = db.query(StudentInvitation).filter(
        StudentInvitation.invitation_token == invitation_token,
        StudentInvitation.status == InvitationStatus.pending
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    # Check if invitation is expired
    if invitation.is_expired:
        invitation.status = InvitationStatus.expired
        db.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == invitation.email).first()
    
    if existing_user:
        # Check if already enrolled
        existing_enrollment = db.query(CourseEnrollment).filter(
            CourseEnrollment.course_id == invitation.course_id,
            CourseEnrollment.student_id == existing_user.id
        ).first()
        
        if existing_enrollment:
            raise HTTPException(status_code=400, detail="Already enrolled in this course")
        
        student = existing_user
    else:
        # Create new user account
        from ..services.auth import get_password_hash
        
        student = User(
            email=invitation.email,
            password_hash=get_password_hash(acceptance_data.password),
            full_name=acceptance_data.full_name,
            role=UserRole.student,
            is_active="active"
        )
        
        db.add(student)
        db.flush()  # Get ID without committing
    
    # Create enrollment
    enrollment = CourseEnrollment(
        course_id=invitation.course_id,
        student_id=student.id
    )
    
    db.add(enrollment)
    
    # Update invitation status
    invitation.status = InvitationStatus.accepted
    invitation.accepted_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "message": "Invitation accepted successfully",
        "student_id": str(student.id),
        "course_id": str(invitation.course_id),
        "enrollment_id": str(enrollment.id)
    }


@router.get("/token/{invitation_token}", response_model=Dict[str, Any])
async def get_invitation_details(
    invitation_token: str,
    db: Session = Depends(get_db)
):
    """Get invitation details by token (for invitation acceptance page)"""
    
    invitation = db.query(StudentInvitation).filter(
        StudentInvitation.invitation_token == invitation_token,
        StudentInvitation.status == InvitationStatus.pending
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    if invitation.is_expired:
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    course = db.query(Course).filter(Course.id == invitation.course_id).first()
    inviter = db.query(User).filter(User.id == invitation.inviter_id).first()
    existing_user = db.query(User).filter(User.email == invitation.email).first()
    
    return {
        "email": invitation.email,
        "full_name": invitation.full_name,
        "course_name": course.name if course else "Unknown Course",
        "course_description": course.description if course else None,
        "exam_type": course.exam_type if course else None,
        "inviter_name": inviter.full_name if inviter else "Unknown",
        "personal_message": invitation.personal_message,
        "expires_at": invitation.expires_at.isoformat(),
        "invited_at": invitation.invited_at.isoformat(),
        "user_exists": existing_user is not None
    }


@router.delete("/courses/{course_id}/invitations/{invitation_id}")
async def cancel_invitation(
    course_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Cancel a pending invitation"""
    
    try:
        course_uuid = uuid.UUID(course_id)
        invitation_uuid = uuid.UUID(invitation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    invitation = db.query(StudentInvitation).filter(
        StudentInvitation.id == invitation_uuid,
        StudentInvitation.course_id == course_uuid
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Check permissions
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if invitation.status != InvitationStatus.pending:
        raise HTTPException(status_code=400, detail="Can only cancel pending invitations")
    
    invitation.status = InvitationStatus.cancelled
    db.commit()
    
    return {"message": "Invitation cancelled successfully"}


@router.get("/my-invitations", response_model=List[InvitationResponse])
async def get_my_invitations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending invitations for current user's email"""
    
    if not current_user.email:
        raise HTTPException(status_code=400, detail="User email not found")
    
    # Get pending invitations for this user's email
    invitations = db.query(StudentInvitation).filter(
        StudentInvitation.email == current_user.email,
        StudentInvitation.status == InvitationStatus.pending
    ).all()
    
    # Add course and invitation details to response
    response_invitations = []
    for invitation in invitations:
        course = db.query(Course).filter(Course.id == invitation.course_id).first()
        inviter = db.query(User).filter(User.id == invitation.inviter_id).first()
        
        inv_response = InvitationResponse.model_validate(invitation)
        inv_response.invitation_url = invitation.get_invitation_url(settings.FRONTEND_URL)
        
        # Add course details if available
        if course:
            inv_response.course_name = course.name
            inv_response.course_description = course.description
            inv_response.exam_type = course.exam_type
            
        if inviter:
            inv_response.inviter_name = inviter.full_name or inviter.email
            
        response_invitations.append(inv_response)
    
    return response_invitations


async def send_invitation_email(
    email: str,
    student_name: str,
    course_name: str,
    invitation_token: str,
    personal_message: Optional[str] = None
):
    """Send invitation email (background task)"""
    
    # This would integrate with your email service (SendGrid, AWS SES, etc.)
    # For now, we'll just log the email details
    
    invitation_url = f"{settings.FRONTEND_URL}/invite/accept/{invitation_token}"
    
    email_content = f"""
    Dear {student_name},
    
    You have been invited to join the course "{course_name}" on KSAI Education Platform.
    
    {"Personal message: " + personal_message if personal_message else ""}
    
    To accept this invitation and create your account, please click the link below:
    {invitation_url}
    
    This invitation will expire in 7 days.
    
    Best regards,
    KSAI Education Platform
    """
    
    logger.info(f"Sending invitation email to {email}: {email_content}")
    
    # TODO: Replace with actual email sending implementation
    # await email_service.send_email(
    #     to=email,
    #     subject=f"Invitation to join {course_name}",
    #     content=email_content
    # )