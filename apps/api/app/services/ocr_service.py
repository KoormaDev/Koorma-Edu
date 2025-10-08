import logging
import asyncio
from typing import Optional, List, Dict, Any
from io import BytesIO
from PIL import Image
import uuid

try:
    import pytesseract
    from pdf2image import convert_from_bytes
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    pytesseract = None
    convert_from_bytes = None

import PyPDF2
from pathlib import Path

logger = logging.getLogger(__name__)


class OCRService:
    """Service for OCR processing of past question papers"""
    
    def __init__(self):
        self.tesseract_available = TESSERACT_AVAILABLE
        if not self.tesseract_available:
            logger.warning("OCR dependencies not available. Install pytesseract and pdf2image for full OCR support.")
    
    async def extract_text_from_pdf(
        self, 
        file_content: bytes, 
        filename: str,
        use_ocr: bool = True
    ) -> Dict[str, Any]:
        """
        Extract text from PDF using both native text extraction and OCR
        Returns extracted text along with metadata about the extraction process
        """
        
        result = {
            "success": False,
            "text": "",
            "pages": 0,
            "extraction_method": "none",
            "ocr_used": False,
            "confidence_score": 0.0,
            "processing_time": 0.0
        }
        
        try:
            # First try native PDF text extraction
            native_text = await self._extract_native_pdf_text(file_content)
            
            if native_text and len(native_text.strip()) > 100:
                # Native extraction successful with substantial content
                result.update({
                    "success": True,
                    "text": native_text,
                    "extraction_method": "native",
                    "confidence_score": 0.95
                })
                
                # Count pages
                try:
                    pdf_file = BytesIO(file_content)
                    pdf_reader = PyPDF2.PdfReader(pdf_file)
                    result["pages"] = len(pdf_reader.pages)
                except:
                    result["pages"] = 1
                    
                return result
            
            # Native extraction failed or insufficient, try OCR
            if use_ocr and self.tesseract_available:
                logger.info(f"Native text extraction insufficient for {filename}, attempting OCR")
                ocr_result = await self._extract_text_with_ocr(file_content, filename)
                
                if ocr_result["success"]:
                    result.update(ocr_result)
                    result["extraction_method"] = "ocr"
                    result["ocr_used"] = True
                    return result
            
            # If we reach here, both methods failed
            if native_text:
                result.update({
                    "success": True,
                    "text": native_text,
                    "extraction_method": "native_partial",
                    "confidence_score": 0.6
                })
            else:
                result["error"] = "Unable to extract text from PDF"
                
        except Exception as e:
            logger.error(f"Error in PDF text extraction for {filename}: {e}")
            result["error"] = str(e)
            
        return result
    
    async def _extract_native_pdf_text(self, file_content: bytes) -> Optional[str]:
        """Extract text using PyPDF2 native extraction"""
        try:
            pdf_file = BytesIO(file_content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    text = page.extract_text()
                    if text.strip():
                        text_parts.append(f"--- Page {page_num + 1} ---\n{text.strip()}")
                except Exception as e:
                    logger.warning(f"Error extracting text from page {page_num + 1}: {e}")
                    continue
            
            return '\n\n'.join(text_parts) if text_parts else None
            
        except Exception as e:
            logger.error(f"Error in native PDF text extraction: {e}")
            return None
    
    async def _extract_text_with_ocr(
        self, 
        file_content: bytes, 
        filename: str
    ) -> Dict[str, Any]:
        """Extract text using OCR on PDF pages converted to images"""
        
        result = {
            "success": False,
            "text": "",
            "pages": 0,
            "confidence_score": 0.0
        }
        
        if not self.tesseract_available:
            result["error"] = "OCR dependencies not available"
            return result
        
        try:
            # Convert PDF to images
            images = convert_from_bytes(file_content, dpi=200, fmt='PNG')
            result["pages"] = len(images)
            
            text_parts = []
            total_confidence = 0.0
            
            for page_num, image in enumerate(images):
                try:
                    # Convert PIL image to OCR
                    page_text = await self._ocr_image(image)
                    
                    if page_text and page_text.strip():
                        text_parts.append(f"--- Page {page_num + 1} ---\n{page_text.strip()}")
                        
                        # Estimate confidence based on text characteristics
                        confidence = self._estimate_text_confidence(page_text)
                        total_confidence += confidence
                        
                except Exception as e:
                    logger.warning(f"OCR failed for page {page_num + 1}: {e}")
                    continue
            
            if text_parts:
                result.update({
                    "success": True,
                    "text": '\n\n'.join(text_parts),
                    "confidence_score": total_confidence / len(images) if images else 0.0
                })
            else:
                result["error"] = "OCR could not extract readable text"
                
        except Exception as e:
            logger.error(f"OCR processing failed for {filename}: {e}")
            result["error"] = str(e)
            
        return result
    
    async def _ocr_image(self, image: Image.Image) -> str:
        """Perform OCR on a single image"""
        try:
            # Run OCR in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            text = await loop.run_in_executor(
                None,
                lambda: pytesseract.image_to_string(
                    image,
                    config='--oem 3 --psm 6'  # Use LSTM OCR engine, assume uniform block of text
                )
            )
            return text
        except Exception as e:
            logger.error(f"Tesseract OCR failed: {e}")
            return ""
    
    def _estimate_text_confidence(self, text: str) -> float:
        """Estimate OCR confidence based on text characteristics"""
        if not text or not text.strip():
            return 0.0
        
        # Simple heuristics for text quality
        total_chars = len(text)
        alpha_chars = sum(c.isalpha() for c in text)
        digit_chars = sum(c.isdigit() for c in text)
        space_chars = sum(c.isspace() for c in text)
        
        if total_chars == 0:
            return 0.0
        
        # Calculate ratios
        alpha_ratio = alpha_chars / total_chars
        digit_ratio = digit_chars / total_chars
        space_ratio = space_chars / total_chars
        
        # Good text should have reasonable character distribution
        confidence = 0.0
        
        # Boost confidence for good alpha ratio (0.5-0.8 is good for mixed content)
        if 0.3 <= alpha_ratio <= 0.9:
            confidence += 0.4
        
        # Some digits are expected in question papers
        if 0.05 <= digit_ratio <= 0.3:
            confidence += 0.2
        
        # Reasonable spacing
        if 0.1 <= space_ratio <= 0.3:
            confidence += 0.2
        
        # Penalize too many special characters (usually OCR errors)
        special_chars = total_chars - alpha_chars - digit_chars - space_chars
        special_ratio = special_chars / total_chars
        if special_ratio > 0.2:
            confidence -= 0.2
        
        # Boost for longer text (more reliable)
        if total_chars > 500:
            confidence += 0.1
        elif total_chars > 1000:
            confidence += 0.2
        
        return max(0.0, min(1.0, confidence))
    
    async def extract_images_from_pdf(
        self, 
        file_content: bytes
    ) -> List[Dict[str, Any]]:
        """Extract images from PDF for separate processing"""
        
        images = []
        
        if not self.tesseract_available:
            return images
        
        try:
            # Convert PDF pages to images
            page_images = convert_from_bytes(file_content, dpi=150, fmt='PNG')
            
            for page_num, image in enumerate(page_images):
                # Save image to bytes
                img_bytes = BytesIO()
                image.save(img_bytes, format='PNG')
                img_bytes.seek(0)
                
                images.append({
                    "page": page_num + 1,
                    "format": "PNG",
                    "size": image.size,
                    "data": img_bytes.getvalue()
                })
                
        except Exception as e:
            logger.error(f"Error extracting images from PDF: {e}")
            
        return images
    
    async def process_image_file(
        self,
        file_content: bytes,
        filename: str
    ) -> Dict[str, Any]:
        """Process image files (JPEG, PNG, etc.) with OCR"""
        
        result = {
            "success": False,
            "text": "",
            "confidence_score": 0.0,
            "file_format": "unknown"
        }
        
        if not self.tesseract_available:
            result["error"] = "OCR dependencies not available"
            return result
        
        try:
            # Open image
            image = Image.open(BytesIO(file_content))
            result["file_format"] = image.format.lower() if image.format else "unknown"
            
            # Perform OCR
            text = await self._ocr_image(image)
            
            if text and text.strip():
                result.update({
                    "success": True,
                    "text": text.strip(),
                    "confidence_score": self._estimate_text_confidence(text)
                })
            else:
                result["error"] = "No readable text found in image"
                
        except Exception as e:
            logger.error(f"Error processing image file {filename}: {e}")
            result["error"] = str(e)
            
        return result


# Singleton instance
ocr_service = OCRService()