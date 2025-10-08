import logging
import uuid
from typing import Dict, Any, List, Optional
from pathlib import Path
import fitz  # PyMuPDF - better Tamil Unicode support
import docx
import pandas as pd
from io import BytesIO

from ..core.config import settings
from .embedding_service import embedding_service
from .qdrant_service import qdrant_service
from .translation_service import translation_service
from ..models.content import Content, ContentType, Language

logger = logging.getLogger(__name__)


class ContentIngestionService:
    """Service for processing and ingesting content into the knowledge base"""
    
    def __init__(self):
        self.max_chunk_size = 1000  # Characters per chunk
        self.overlap_size = 100     # Overlap between chunks
    
    async def process_file(
        self,
        file_content: bytes,
        filename: str,
        content_type: ContentType,
        metadata: Dict[str, Any],
        language: str = "english"
    ) -> Dict[str, Any]:
        """Process uploaded file and ingest into knowledge base"""

        try:
            # Extract text from file based on type
            text_content = await self._extract_text(file_content, filename, content_type)

            if not text_content:
                return {
                    "success": False,
                    "error": "Could not extract text from file"
                }

            # Check if we need to translate Tamil to English
            if language and (language == "tamil" or language == "ta" or language == Language.tamil.value):
                logger.info(f"Detected Tamil content, translating to English...")
                logger.info(f"Extracted {len(text_content)} Tamil characters")

                # Translate Tamil to English using OpenAI (chunk-based translation)
                translation_result = await translation_service.translate_tamil_to_english(
                    text_content,
                    preserve_format=True
                )

                if not translation_result["success"]:
                    logger.error(f"Translation failed: {translation_result.get('error')}")
                    return {
                        "success": False,
                        "error": f"Translation failed: {translation_result.get('error')}"
                    }

                # Use the translated English text for embeddings
                text_content = translation_result["translated_text"]
                logger.info(f"Translated to {len(text_content)} English characters")

            # Split text into chunks
            chunks = self._split_text_into_chunks(text_content)
            
            # Process each chunk
            processed_chunks = []
            for i, chunk in enumerate(chunks):
                chunk_metadata = {
                    **metadata,
                    "filename": filename,
                    "content_type": content_type.value,
                    "chunk_index": i,
                    "total_chunks": len(chunks)
                }
                
                # Create embedding for chunk
                embedding = await embedding_service.create_embedding(chunk)
                
                if embedding:
                    # Store in Qdrant
                    content_id = f"{metadata.get('content_id', str(uuid.uuid4()))}_{i}"
                    
                    await qdrant_service.add_content(
                        content_id=content_id,
                        text=chunk,
                        embedding=embedding,
                        metadata=chunk_metadata
                    )
                    
                    processed_chunks.append({
                        "chunk_id": content_id,
                        "text": chunk,
                        "chunk_index": i
                    })
            
            return {
                "success": True,
                "chunks_processed": len(processed_chunks),
                "total_characters": len(text_content),
                "filename": filename
            }
            
        except Exception as e:
            logger.error(f"Error processing file {filename}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _extract_text(
        self,
        file_content: bytes,
        filename: str,
        content_type: ContentType
    ) -> Optional[str]:
        """Extract text from different file types"""
        
        try:
            file_extension = Path(filename).suffix.lower()
            
            if content_type == ContentType.pdf or file_extension == '.pdf':
                return await self._extract_pdf_text(file_content)
            
            elif content_type == ContentType.docx or file_extension == '.docx':
                return await self._extract_docx_text(file_content)
            
            elif file_extension == '.xlsx':
                return await self._extract_xlsx_text(file_content)
            
            elif content_type == ContentType.text or file_extension in ['.txt', '.md']:
                return file_content.decode('utf-8')
            
            else:
                logger.warning(f"Unsupported file type: {file_extension}")
                return None
                
        except Exception as e:
            logger.error(f"Error extracting text from {filename}: {e}")
            return None
    
    async def _extract_pdf_text(self, file_content: bytes) -> Optional[str]:
        """Extract text from PDF file using PyMuPDF for perfect Tamil Unicode support"""
        try:
            pdf_file = BytesIO(file_content)
            doc = fitz.open(stream=pdf_file, filetype="pdf")

            text_parts = []
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_parts.append(text.strip())

            doc.close()
            return '\n\n'.join(text_parts) if text_parts else None

        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            return None
    
    async def _extract_docx_text(self, file_content: bytes) -> Optional[str]:
        """Extract text from DOCX file"""
        try:
            doc_file = BytesIO(file_content)
            doc = docx.Document(doc_file)
            
            text_parts = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_parts.append(paragraph.text.strip())
            
            return '\n\n'.join(text_parts) if text_parts else None
            
        except Exception as e:
            logger.error(f"Error extracting DOCX text: {e}")
            return None
    
    async def _extract_xlsx_text(self, file_content: bytes) -> Optional[str]:
        """Extract text from XLSX file"""
        try:
            excel_file = BytesIO(file_content)
            
            # Read all sheets
            dfs = pd.read_excel(excel_file, sheet_name=None)
            
            text_parts = []
            for sheet_name, df in dfs.items():
                # Convert dataframe to text representation
                text_parts.append(f"Sheet: {sheet_name}")
                text_parts.append(df.to_string(index=False))
                text_parts.append("")  # Empty line between sheets
            
            return '\n'.join(text_parts) if text_parts else None
            
        except Exception as e:
            logger.error(f"Error extracting XLSX text: {e}")
            return None
    
    def _split_text_into_chunks(self, text: str) -> List[str]:
        """Split text into manageable chunks for embedding"""
        
        if len(text) <= self.max_chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + self.max_chunk_size
            
            if end >= len(text):
                # Last chunk
                chunks.append(text[start:])
                break
            
            # Try to break at sentence or word boundary
            chunk = text[start:end]
            
            # Look for sentence endings
            sentence_endings = ['. ', '! ', '? ', '\n\n']
            best_break = -1
            
            for ending in sentence_endings:
                last_occurrence = chunk.rfind(ending)
                if last_occurrence > best_break and last_occurrence > self.overlap_size:
                    best_break = last_occurrence + len(ending)
            
            # If no good sentence break, look for word boundary
            if best_break == -1:
                last_space = chunk.rfind(' ')
                if last_space > self.overlap_size:
                    best_break = last_space
            
            # If still no break, use hard cut
            if best_break == -1:
                best_break = self.max_chunk_size
            
            chunks.append(text[start:start + best_break])
            start = start + best_break - self.overlap_size  # Add overlap
        
        return [chunk.strip() for chunk in chunks if chunk.strip()]
    
    async def process_url_content(
        self,
        url: str,
        content_type: ContentType,
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process content from URL (e.g., YouTube videos)"""
        
        try:
            text_content = ""
            
            if 'youtube.com' in url or 'youtu.be' in url:
                text_content = await self._extract_youtube_transcript(url)
            else:
                return {
                    "success": False,
                    "error": "URL type not supported yet"
                }
            
            if not text_content:
                return {
                    "success": False,
                    "error": "Could not extract content from URL"
                }
            
            # Split and process chunks
            chunks = self._split_text_into_chunks(text_content)
            
            processed_chunks = []
            for i, chunk in enumerate(chunks):
                chunk_metadata = {
                    **metadata,
                    "source_url": url,
                    "content_type": content_type.value,
                    "chunk_index": i,
                    "total_chunks": len(chunks)
                }
                
                # Create embedding for chunk
                embedding = await embedding_service.create_embedding(chunk)
                
                if embedding:
                    content_id = f"{metadata.get('content_id', str(uuid.uuid4()))}_{i}"
                    
                    await qdrant_service.add_content(
                        content_id=content_id,
                        text=chunk,
                        embedding=embedding,
                        metadata=chunk_metadata
                    )
                    
                    processed_chunks.append({
                        "chunk_id": content_id,
                        "text": chunk,
                        "chunk_index": i
                    })
            
            return {
                "success": True,
                "chunks_processed": len(processed_chunks),
                "total_characters": len(text_content),
                "url": url
            }
            
        except Exception as e:
            logger.error(f"Error processing URL {url}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _extract_youtube_transcript(self, url: str) -> Optional[str]:
        """Extract transcript from YouTube video"""
        # This would require youtube-transcript-api or similar
        # For now, return a placeholder
        logger.warning(f"YouTube transcript extraction not implemented for {url}")
        return None
    
    async def delete_content(self, content_id: str) -> bool:
        """Delete content from knowledge base"""
        try:
            return await qdrant_service.delete_content(content_id)
        except Exception as e:
            logger.error(f"Error deleting content {content_id}: {e}")
            return False
    
    async def update_content_metadata(
        self,
        content_id: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """Update content metadata"""
        try:
            # This would require retrieving existing content first
            # then updating with new metadata
            # For now, log the request
            logger.info(f"Update metadata request for {content_id}: {metadata}")
            return True
        except Exception as e:
            logger.error(f"Error updating content metadata {content_id}: {e}")
            return False


# Singleton instance
ingestion_service = ContentIngestionService()