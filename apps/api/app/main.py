from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import logging
import time

from .core.config import settings
from .routers import auth, courses, syllabus, content, assessments, chat, invitations, past_papers, questions

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="KSAI Education Platform - Comprehensive Learning and Assessment System",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings else "/openapi.json"
)

# Add request size limit middleware for large file uploads
@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    # Allow larger uploads for content upload endpoints
    if '/content/upload' in str(request.url):
        # Set a more generous limit for file uploads (100MB)
        max_size = 100 * 1024 * 1024  # 100MB in bytes

        content_length = request.headers.get('content-length')
        if content_length:
            content_length = int(content_length)
            if content_length > max_size:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=413,
                    detail=f"Request entity too large. Maximum size allowed: {max_size} bytes"
                )

    response = await call_next(request)
    return response

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    logger.info(f"REQUEST: {request.method} {request.url} - Headers: {dict(request.headers)}")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    logger.info(f"RESPONSE: {request.method} {request.url} - Status: {response.status_code} - Time: {process_time:.3f}s")
    
    return response

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(courses.router, prefix=settings.API_V1_STR)
app.include_router(syllabus.router, prefix=settings.API_V1_STR)
app.include_router(content.router, prefix=settings.API_V1_STR)
app.include_router(assessments.router, prefix=settings.API_V1_STR)
app.include_router(chat.router, prefix=settings.API_V1_STR)
app.include_router(invitations.router, prefix=settings.API_V1_STR)
app.include_router(past_papers.router, prefix=settings.API_V1_STR)
app.include_router(questions.router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "KSAI Education Platform API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ksai-exam-api"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)