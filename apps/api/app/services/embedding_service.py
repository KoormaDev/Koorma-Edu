import logging
from typing import List, Optional
import openai
from openai import OpenAI

from ..core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
        self.model = "text-embedding-ada-002"  # OpenAI's embedding model
        
    async def create_embedding(self, text: str) -> Optional[List[float]]:
        """Create embedding for text"""
        if not self.client:
            logger.warning("OpenAI API key not configured")
            return None
            
        try:
            # Clean and prepare text
            cleaned_text = text.strip().replace('\n', ' ')[:8000]  # Limit text length
            
            if not cleaned_text:
                logger.warning("Empty text provided for embedding")
                return None
            
            response = self.client.embeddings.create(
                input=cleaned_text,
                model=self.model
            )
            
            embedding = response.data[0].embedding
            logger.debug(f"Created embedding for text of length {len(cleaned_text)}")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Error creating embedding: {e}")
            return None
    
    async def create_embeddings_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Create embeddings for multiple texts"""
        if not self.client:
            logger.warning("OpenAI API key not configured")
            return [None] * len(texts)
            
        try:
            # Clean texts
            cleaned_texts = []
            for text in texts:
                cleaned = text.strip().replace('\n', ' ')[:8000]
                cleaned_texts.append(cleaned if cleaned else "")
            
            # Filter out empty texts
            non_empty_texts = [(i, text) for i, text in enumerate(cleaned_texts) if text]
            
            if not non_empty_texts:
                return [None] * len(texts)
            
            # Create embeddings for non-empty texts
            response = self.client.embeddings.create(
                input=[text for _, text in non_empty_texts],
                model=self.model
            )
            
            # Map results back to original positions
            results = [None] * len(texts)
            for idx, (original_idx, _) in enumerate(non_empty_texts):
                results[original_idx] = response.data[idx].embedding
            
            logger.info(f"Created embeddings for {len(non_empty_texts)} texts")
            return results
            
        except Exception as e:
            logger.error(f"Error creating embeddings batch: {e}")
            return [None] * len(texts)
    
    def get_embedding_dimension(self) -> int:
        """Get the dimension of embeddings"""
        return 1536  # OpenAI ada-002 embedding dimension


# Singleton instance
embedding_service = EmbeddingService()