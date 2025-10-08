import logging
import asyncio
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Try to import Google Translator from deep-translator
try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
except ImportError:
    TRANSLATOR_AVAILABLE = False
    logger.warning("deep-translator not installed")

class TranslationService:
    """Service for translating Tamil documents to English using Google Translate"""

    def __init__(self):
        if TRANSLATOR_AVAILABLE:
            try:
                # Initialize Google Translator
                self.translator = GoogleTranslator(source='ta', target='en')
                self.translation_enabled = True
                logger.info("Translation service initialized with Google Translate (deep-translator)")
            except Exception as e:
                self.translator = None
                self.translation_enabled = False
                logger.error(f"Failed to initialize Google Translate: {str(e)}")
        else:
            self.translator = None
            self.translation_enabled = False
            logger.warning("Translation service disabled - deep-translator not available")

    async def translate_tamil_to_english(
        self,
        text: str,
        preserve_format: bool = True
    ) -> Dict[str, Any]:
        """
        Translate Tamil text to English using Google Translate

        Args:
            text: Tamil text to translate
            preserve_format: Whether to preserve formatting and structure

        Returns:
            Dictionary with translation result and metadata
        """

        result = {
            "success": False,
            "original_text": text,
            "translated_text": "",
            "source_language": "ta",
            "target_language": "en",
            "char_count": len(text),
            "error": None
        }

        if not self.translation_enabled:
            result["error"] = "Translation service not available."
            result["translated_text"] = text  # Return original text as fallback
            return result

        if not text or not text.strip():
            result["error"] = "No text provided for translation"
            return result

        try:
            # Google Translate via deep-translator has URL length limits
            # Must use small chunks to avoid request errors
            max_chars = 800  # Small chunks to avoid URL length limits

            if len(text) <= max_chars:
                # Translate in one go
                translated = await self._translate_chunk(text)
                result.update({
                    "success": True,
                    "translated_text": translated
                })
            else:
                # Split and translate in chunks
                chunks = self._split_text_into_chunks(text, max_chars)
                translated_chunks = []

                logger.info(f"Translating large text in {len(chunks)} chunks")
                for i, chunk in enumerate(chunks):
                    if i % 20 == 0:  # Log every 20 chunks
                        logger.info(f"Translating chunk {i+1}/{len(chunks)}")
                    translated_chunk = await self._translate_chunk(chunk)
                    translated_chunks.append(translated_chunk)
                    # Small delay to avoid rate limiting
                    await asyncio.sleep(0.2)

                result.update({
                    "success": True,
                    "translated_text": "\n\n".join(translated_chunks)
                })

            logger.info(f"Successfully translated {len(text)} characters from Tamil to English")

        except Exception as e:
            logger.error(f"Translation failed: {str(e)}")
            result["error"] = f"Translation error: {str(e)}"
            result["translated_text"] = text  # Return original text as fallback

        return result

    async def _translate_chunk(self, text: str) -> str:
        """Translate a single chunk of text using Google Translate"""

        try:
            # Clean text
            clean_text = text.replace('\x00', '').strip()
            if not clean_text:
                return ""

            # Run the synchronous translation in a thread pool
            loop = asyncio.get_event_loop()
            translated = await loop.run_in_executor(
                None,
                lambda: self.translator.translate(clean_text)
            )
            return translated

        except Exception as e:
            logger.error(f"Google Translate API call failed: {str(e)}")
            # Try recreating translator and retry once
            try:
                self.translator = GoogleTranslator(source='ta', target='en')
                await asyncio.sleep(1)
                translated = await loop.run_in_executor(
                    None,
                    lambda: self.translator.translate(clean_text)
                )
                return translated
            except Exception as retry_error:
                logger.error(f"Retry failed: {str(retry_error)}")
                raise

    def _split_text_into_chunks(self, text: str, max_chars: int) -> list:
        """Split text into manageable chunks for translation"""

        chunks = []
        current_chunk = ""

        # Try to split by paragraphs first
        paragraphs = text.split('\n\n')

        for paragraph in paragraphs:
            if len(current_chunk) + len(paragraph) + 2 <= max_chars:
                if current_chunk:
                    current_chunk += "\n\n"
                current_chunk += paragraph
            else:
                if current_chunk:
                    chunks.append(current_chunk)

                # If paragraph itself is too long, split by sentences
                if len(paragraph) > max_chars:
                    sentences = paragraph.replace('. ', '.|').split('|')
                    temp_chunk = ""

                    for sentence in sentences:
                        if len(temp_chunk) + len(sentence) <= max_chars:
                            temp_chunk += sentence
                        else:
                            if temp_chunk:
                                chunks.append(temp_chunk)
                            temp_chunk = sentence

                    if temp_chunk:
                        current_chunk = temp_chunk
                else:
                    current_chunk = paragraph

        if current_chunk:
            chunks.append(current_chunk)

        return chunks

    async def detect_language(self, text: str) -> str:
        """
        Detect the language of the given text

        Returns:
            Language code ('ta' for Tamil, 'en' for English, etc.)
        """

        if not text:
            return "unknown"

        try:
            # Use a simple heuristic for Tamil detection
            # Tamil Unicode range: U+0B80 to U+0BFF
            tamil_char_count = sum(1 for char in text if '\u0B80' <= char <= '\u0BFF')

            if tamil_char_count > len(text) * 0.3:  # If more than 30% Tamil characters
                return "ta"
            else:
                return "en"  # Default to English

        except Exception as e:
            logger.error(f"Language detection failed: {str(e)}")
            return "unknown"


# Singleton instance
translation_service = TranslationService()
