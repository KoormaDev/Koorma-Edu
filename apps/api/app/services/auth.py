import logging
from datetime import datetime, timedelta
from typing import Optional
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db.database import get_db
from ..models.user import User, UserRole

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT token scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def authenticate_user(db: Session, username: str, password: str):
    """Authenticate user with email/phone and password"""
    # Try to find user by email or phone
    user = (
        db.query(User)
        .filter((User.email == username) | (User.phone_number == username))
        .first()
    )

    if not user or not verify_password(password, user.password_hash):
        return False
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Handle fallback admin token - improved security
    if user_id == "admin-fallback":
        # Only allow this in development/testing
        if not settings.SECRET_KEY.startswith("your-super-secret"):
            raise credentials_exception
            
        admin_uuid = str(uuid.UUID('00000000-0000-0000-0000-000000000001'))
        
        try:
            # Try to get existing admin user
            admin_user = db.query(User).filter(User.id == admin_uuid).first()
            if admin_user:
                return admin_user
            
            # Create admin user if it doesn't exist
            admin_user = User(
                id=admin_uuid,
                email="admin@ksai.com",
                phone_number=None,
                full_name="System Administrator",
                password_hash=get_password_hash("admin123"),
                role=UserRole.admin,
                is_active="active"
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            return admin_user
        except Exception as e:
            logger.warning(f"Could not create/fetch admin user: {e}")
            raise credentials_exception
    
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise credentials_exception
        
        # Check if user is active
        if user.is_active != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
            
        return user
    except Exception:
        raise credentials_exception


async def get_current_admin(current_user: User = Depends(get_current_user)):
    """Get current admin user (admin, super_admin, or institution)"""
    if current_user.role not in [UserRole.admin, UserRole.super_admin, UserRole.institution]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Not enough permissions"
        )
    return current_user


async def get_current_super_admin(current_user: User = Depends(get_current_user)):
    """Get current super admin user"""
    if current_user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Super admin access required"
        )
    return current_user


async def get_current_student(current_user: User = Depends(get_current_user)):
    """Get current student user"""
    if current_user.role != UserRole.student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return current_user


def create_user_access_token(user: User) -> str:
    """Create access token for user"""
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}, 
        expires_delta=access_token_expires
    )
    return access_token