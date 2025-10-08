from datetime import datetime, timedelta
from typing import Optional, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator

from ..core.config import settings
from ..db.database import get_db
from ..models.user import User, UserRole
from ..services.auth import (
    authenticate_user,
    create_user_access_token,
    get_current_user,
    get_password_hash,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


class UserRegister(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password: str
    full_name: Optional[str] = None
    role: Optional[UserRole] = UserRole.student
    institution_id: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    full_name: Optional[str] = None
    role: UserRole
    institution_id: Optional[str] = None
    is_active: str
    created_at: str
    updated_at: str

    @field_validator('id', 'institution_id', mode='before')
    @classmethod
    def validate_uuid(cls, v):
        if v is None:
            return None
        return str(v)
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def validate_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


@router.post("/register", response_model=UserResponse)
async def register_user(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""
    
    # Validate that either email or phone is provided
    if not user_data.email and not user_data.phone_number:
        raise HTTPException(
            status_code=400,
            detail="Either email or phone number must be provided"
        )
    
    # Check if user already exists
    existing_user = None
    if user_data.email:
        existing_user = db.query(User).filter(User.email == user_data.email).first()
    if not existing_user and user_data.phone_number:
        existing_user = db.query(User).filter(User.phone_number == user_data.phone_number).first()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email or phone number already exists"
        )
    
    # Only allow student registrations through public signup
    if user_data.role != UserRole.student:
        raise HTTPException(
            status_code=400,
            detail="Only students can register through public signup. Admins must be created by super administrators."
        )
    
    # Create new user
    new_user = User(
        id=str(uuid.uuid4()),
        email=user_data.email,
        phone_number=user_data.phone_number,
        full_name=user_data.full_name,
        password_hash=get_password_hash(user_data.password),
        role=UserRole.student,  # Force role to student
        institution_id=user_data.institution_id,
        is_active="pending"  # Students need admin approval
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login user and return access token"""
    
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.is_active != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is not active. Please contact administrator."
        )
    
    access_token = create_user_access_token(user)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user_profile(
    full_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    
    if full_name is not None:
        current_user.full_name = full_name
    
    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.post("/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    from ..services.auth import verify_password, get_password_hash
    
    # Verify current password
    if not verify_password(current_password, current_user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Incorrect current password"
        )
    
    # Update password
    current_user.password_hash = get_password_hash(new_password)
    db.commit()
    
    return {"message": "Password changed successfully"}


# Development/testing endpoints
@router.get("/dev/create-admin")
async def create_dev_admin(db: Session = Depends(get_db)):
    """Create development admin user - only for testing"""
    
    # Only allow in development
    if not settings.SECRET_KEY.startswith("your-super-secret"):
        raise HTTPException(status_code=404, detail="Not found")
    
    admin_email = "admin@ksai.com"
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    
    if existing_admin:
        return {"message": "Admin user already exists", "email": admin_email}
    
    admin_user = User(
        id=str(uuid.uuid4()),
        email=admin_email,
        phone_number=None,
        full_name="System Administrator",
        password_hash=get_password_hash("admin123"),
        role=UserRole.admin,
        is_active="active"
    )
    
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    
    return {
        "message": "Admin user created successfully",
        "email": admin_email,
        "password": "admin123",
        "id": admin_user.id
    }


# Admin-only endpoints for user management
@router.post("/admin/activate-user/{user_id}")
async def activate_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Activate a user account (admin only)"""
    
    # Check if current user is admin or super_admin
    if current_user.role not in [UserRole.admin, UserRole.super_admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can activate users"
        )
    
    # Find the user to activate
    user_to_activate = db.query(User).filter(User.id == user_id).first()
    if not user_to_activate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update user status
    user_to_activate.is_active = "active"
    db.commit()
    db.refresh(user_to_activate)
    
    return {
        "message": "User activated successfully",
        "user_id": user_id,
        "email": user_to_activate.email
    }


@router.post("/admin/deactivate-user/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate a user account (admin only)"""
    
    # Check if current user is admin or super_admin
    if current_user.role not in [UserRole.admin, UserRole.super_admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can deactivate users"
        )
    
    # Find the user to deactivate
    user_to_deactivate = db.query(User).filter(User.id == user_id).first()
    if not user_to_deactivate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent deactivating other admins or super_admins
    if user_to_deactivate.role in [UserRole.admin, UserRole.super_admin] and user_to_deactivate.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot deactivate other administrators"
        )
    
    # Update user status
    user_to_deactivate.is_active = "inactive"
    db.commit()
    db.refresh(user_to_deactivate)
    
    return {
        "message": "User deactivated successfully",
        "user_id": user_id,
        "email": user_to_deactivate.email
    }


@router.get("/admin/pending-users")
async def get_pending_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all pending users (admin only)"""
    
    # Check if current user is admin or super_admin
    if current_user.role not in [UserRole.admin, UserRole.super_admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can view pending users"
        )
    
    pending_users = db.query(User).filter(User.is_active == "pending").all()
    
    return {
        "pending_users": [
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "created_at": user.created_at.isoformat()
            }
            for user in pending_users
        ],
        "count": len(pending_users)
    }


@router.get("/users", response_model=List[UserResponse])
async def get_users(
    role: Optional[str] = Query(None, description="Filter users by role"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all users, optionally filtered by role (admin only)"""
    
    # Check if current user is admin or super_admin
    if current_user.role not in [UserRole.admin, UserRole.super_admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can view all users"
        )
    
    # Base query
    query = db.query(User)
    
    # Filter by role if provided
    if role:
        try:
            role_enum = UserRole(role)
            query = query.filter(User.role == role_enum)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role: {role}. Valid roles are: {[r.value for r in UserRole]}"
            )
    
    users = query.all()
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific user by ID (admin only)"""
    
    # Check if current user is admin or super_admin
    if current_user.role not in [UserRole.admin, UserRole.super_admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can view user details"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user


class AdminCreateRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password: str
    full_name: Optional[str] = None

    @field_validator('email', 'phone_number')
    @classmethod
    def at_least_one_contact(cls, v, info):
        if not v and not info.data.get('email') and not info.data.get('phone_number'):
            raise ValueError('Either email or phone number must be provided')
        return v


@router.post("/super-admin/create-admin", response_model=UserResponse)
async def create_admin(
    admin_data: AdminCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new admin account (super admin only)"""
    
    # Check if current user is super_admin
    if current_user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super administrators can create admin accounts"
        )
    
    # Validate that either email or phone is provided
    if not admin_data.email and not admin_data.phone_number:
        raise HTTPException(
            status_code=400,
            detail="Either email or phone number must be provided"
        )
    
    # Check if user already exists
    existing_user = None
    if admin_data.email:
        existing_user = db.query(User).filter(User.email == admin_data.email).first()
    if not existing_user and admin_data.phone_number:
        existing_user = db.query(User).filter(User.phone_number == admin_data.phone_number).first()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email or phone number already exists"
        )
    
    # Create new admin
    new_admin = User(
        id=str(uuid.uuid4()),
        email=admin_data.email,
        phone_number=admin_data.phone_number,
        full_name=admin_data.full_name,
        password_hash=get_password_hash(admin_data.password),
        role=UserRole.admin,
        is_active="active"  # Admins are active immediately
    )
    
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    
    return new_admin