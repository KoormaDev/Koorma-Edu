from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.course import Course, CourseEnrollment, ExamType, CourseStatus
from ..models.user import User, UserRole
from ..services.auth import get_current_user, get_current_admin

router = APIRouter(prefix="/courses", tags=["courses"])


class CourseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    exam_type: ExamType
    default_language: str = "en"
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    exam_type: Optional[ExamType] = None
    default_language: Optional[str] = None
    status: Optional[CourseStatus] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CourseResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    exam_type: ExamType
    default_language: str
    status: CourseStatus
    creator_id: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    created_at: str
    updated_at: str

    @field_validator('id', 'creator_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('created_at', 'updated_at', 'start_date', 'end_date', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v) if v else None

    class Config:
        from_attributes = True


class CourseEnrollmentResponse(BaseModel):
    id: str
    course_id: str
    student_id: str
    enrollment_status: str
    enrolled_at: str

    @field_validator('id', 'course_id', 'student_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('enrolled_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True


@router.get("/", response_model=List[CourseResponse])
async def get_courses(
    status: Optional[CourseStatus] = None,
    exam_type: Optional[ExamType] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all courses (filtered by user role)"""
    query = db.query(Course)
    
    if current_user.role == UserRole.student:
        # Students can only see active courses
        query = query.filter(Course.status == CourseStatus.active)
    elif current_user.role in [UserRole.admin, UserRole.super_admin, UserRole.institution]:
        # Admins and super_admins see all courses, institutions see their own
        if current_user.role == UserRole.institution:
            query = query.filter(Course.creator_id == current_user.id)
    
    if status:
        query = query.filter(Course.status == status)
    if exam_type:
        query = query.filter(Course.exam_type == exam_type)
    
    courses = query.all()
    return courses


@router.get("/my-enrollments", response_model=List[CourseEnrollmentResponse])
async def get_my_enrollments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's course enrollments"""
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students have enrollments")
    
    enrollments = db.query(CourseEnrollment).filter(
        CourseEnrollment.student_id == current_user.id
    ).all()
    
    return enrollments


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.student:
        if course.status != CourseStatus.active:
            raise HTTPException(status_code=404, detail="Course not found")
    elif current_user.role == UserRole.institution:
        if course.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this course")
    # Admins and super_admins can access all courses (no restriction)
    
    return course


@router.post("/", response_model=CourseResponse)
async def create_course(
    course_data: CourseCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new course"""
    
    # Parse date strings to datetime objects
    start_date = None
    end_date = None
    
    if course_data.start_date:
        try:
            start_date = datetime.fromisoformat(course_data.start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
    
    if course_data.end_date:
        try:
            end_date = datetime.fromisoformat(course_data.end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
    
    # Validate dates
    if start_date and end_date and end_date <= start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    
    course = Course(
        id=uuid.uuid4(),
        name=course_data.name,
        description=course_data.description,
        exam_type=course_data.exam_type,
        default_language=course_data.default_language,
        start_date=start_date,
        end_date=end_date,
        creator_id=current_user.id
    )
    
    db.add(course)
    db.commit()
    db.refresh(course)
    
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: str,
    course_data: CourseUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this course")
    
    # Update fields
    if course_data.name is not None:
        course.name = course_data.name
    if course_data.description is not None:
        course.description = course_data.description
    if course_data.exam_type is not None:
        course.exam_type = course_data.exam_type
    if course_data.default_language is not None:
        course.default_language = course_data.default_language
    if course_data.status is not None:
        course.status = course_data.status
    
    # Handle date updates
    if course_data.start_date is not None:
        if course_data.start_date:
            try:
                course.start_date = datetime.fromisoformat(course_data.start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
        else:
            course.start_date = None
    
    if course_data.end_date is not None:
        if course_data.end_date:
            try:
                course.end_date = datetime.fromisoformat(course_data.end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
        else:
            course.end_date = None
    
    # Validate dates after update
    if course.start_date and course.end_date and course.end_date <= course.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    
    db.commit()
    db.refresh(course)
    
    return course


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a course"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this course")
    
    db.delete(course)
    db.commit()
    
    return {"message": "Course deleted successfully"}


@router.post("/{course_id}/enroll", response_model=CourseEnrollmentResponse)
async def enroll_in_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enroll student in a course"""
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students can enroll in courses")
    
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(
        Course.id == course_uuid,
        Course.status == CourseStatus.active
    ).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found or not active")
    
    # Check if already enrolled
    existing_enrollment = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == course_uuid,
        CourseEnrollment.student_id == current_user.id
    ).first()
    
    if existing_enrollment:
        raise HTTPException(status_code=400, detail="Already enrolled in this course")
    
    enrollment = CourseEnrollment(
        id=uuid.uuid4(),
        course_id=course_uuid,
        student_id=current_user.id
    )
    
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    
    return enrollment


class CourseEnrollmentWithStudentResponse(BaseModel):
    id: str
    course_id: str
    student_id: str
    enrollment_status: str
    enrolled_at: str
    student: dict

    @field_validator('id', 'course_id', 'student_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        return str(v) if v else None
    
    @field_validator('enrolled_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True


@router.get("/{course_id}/enrollments")
async def get_course_enrollments(
    course_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all enrollments for a course with student details"""
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view enrollments")
    
    # Get enrollments with student details using eager loading
    enrollments = db.query(CourseEnrollment).options(
        joinedload(CourseEnrollment.student)
    ).filter(
        CourseEnrollment.course_id == course_uuid
    ).all()
    
    # Format response with student details
    result = []
    for enrollment in enrollments:
        if enrollment.student:  # Only include enrollments where student exists
            result.append({
                "id": str(enrollment.id),
                "course_id": str(enrollment.course_id),
                "student_id": str(enrollment.student_id),
                "enrollment_status": enrollment.enrollment_status,
                "enrolled_at": enrollment.enrolled_at.isoformat(),
                "student": {
                    "id": str(enrollment.student.id),
                    "email": enrollment.student.email,
                    "full_name": enrollment.student.full_name,
                    "phone_number": enrollment.student.phone_number
                }
            })
    
    return result


@router.delete("/{course_id}/enrollments/{student_id}")
async def remove_student_from_course(
    course_id: str,
    student_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Remove a student from a course by student ID"""
    try:
        course_uuid = uuid.UUID(course_id)
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course ID or student ID")
    
    course = db.query(Course).filter(Course.id == course_uuid).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if current_user.role == UserRole.institution and course.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to manage this course")
    
    enrollment = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == course_uuid,
        CourseEnrollment.student_id == student_uuid
    ).first()
    
    if not enrollment:
        raise HTTPException(status_code=404, detail="Student is not enrolled in this course")
    
    db.delete(enrollment)
    db.commit()
    
    return {"message": "Student removed from course successfully"}


@router.get("/enrollments/student/{student_id}", response_model=List[CourseEnrollmentResponse])
async def get_student_enrollments(
    student_id: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all enrollments for a specific student (admin only)"""
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_uuid).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    enrollments = db.query(CourseEnrollment).filter(
        CourseEnrollment.student_id == student_uuid
    ).all()
    
    return enrollments


