import logging
from typing import List, Dict, Any, Optional
import uuid
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import PointStruct, Filter, FieldCondition, MatchValue

from ..core.config import settings

logger = logging.getLogger(__name__)


class QdrantService:
    def __init__(self):
        self.client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY
        )
        self.collection_name = "ksai_content"
        
    async def ensure_collection_exists(self):
        """Ensure the Qdrant collection exists"""
        try:
            collections = self.client.get_collections()
            collection_names = [col.name for col in collections.collections]
            
            if self.collection_name not in collection_names:
                logger.info(f"Creating collection: {self.collection_name}")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=1536,  # OpenAI embedding dimension
                        distance=models.Distance.COSINE
                    )
                )
                logger.info(f"Collection {self.collection_name} created successfully")
            else:
                logger.info(f"Collection {self.collection_name} already exists")
                
        except Exception as e:
            logger.error(f"Error ensuring collection exists: {e}")
            raise
    
    async def delete_collection(self):
        """Delete the Qdrant collection"""
        try:
            logger.info(f"Deleting collection: {self.collection_name}")
            self.client.delete_collection(collection_name=self.collection_name)
            logger.info(f"Successfully deleted collection: {self.collection_name}")
        except Exception as e:
            logger.error(f"Failed to delete collection: {e}")
            raise
    
    async def add_content(
        self,
        content_id: str,
        text: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """Add content to Qdrant"""
        try:
            await self.ensure_collection_exists()
            
            point = PointStruct(
                id=str(uuid.uuid4()),
                vector=embedding,
                payload={
                    "content_id": content_id,
                    "text": text,
                    **metadata
                }
            )
            
            self.client.upsert(
                collection_name=self.collection_name,
                points=[point]
            )
            
            logger.info(f"Added content to Qdrant: {content_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error adding content to Qdrant: {e}")
            return False
    
    async def search_similar_content(
        self,
        query_embedding: List[float],
        course_id: Optional[str] = None,
        content_type: Optional[str] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for similar content"""
        try:
            await self.ensure_collection_exists()
            
            # Build filter conditions
            filter_conditions = []
            if course_id:
                filter_conditions.append(
                    FieldCondition(
                        key="course_id",
                        match=MatchValue(value=course_id)
                    )
                )
            if content_type:
                filter_conditions.append(
                    FieldCondition(
                        key="content_type",
                        match=MatchValue(value=content_type)
                    )
                )
            
            # Create filter
            search_filter = None
            if filter_conditions:
                search_filter = Filter(must=filter_conditions)
            
            # Search
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=search_filter,
                limit=limit,
                with_payload=True
            )
            
            return [
                {
                    "id": result.id,
                    "score": result.score,
                    "content_id": result.payload.get("content_id"),
                    "text": result.payload.get("text"),
                    "metadata": result.payload
                }
                for result in results
            ]
            
        except Exception as e:
            logger.error(f"Error searching similar content: {e}")
            return []
    
    async def delete_content(self, content_id: str) -> bool:
        """Delete content from Qdrant"""
        try:
            logger.info(f"Attempting to delete content from Qdrant: {content_id}")
            
            # Search for points with this content_id
            filter_condition = Filter(
                must=[
                    FieldCondition(
                        key="content_id",
                        match=MatchValue(value=content_id)
                    )
                ]
            )
            
            # Get points to delete
            search_results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=filter_condition,
                with_payload=True,
                limit=1000  # Ensure we get all chunks
            )
            
            if search_results[0]:  # If points found
                point_ids = [point.id for point in search_results[0]]
                logger.info(f"Found {len(point_ids)} points to delete for content_id: {content_id}")
                
                # Delete in batches if needed
                batch_size = 100
                for i in range(0, len(point_ids), batch_size):
                    batch = point_ids[i:i+batch_size]
                    self.client.delete(
                        collection_name=self.collection_name,
                        points_selector=models.PointIdsList(points=batch)
                    )
                    logger.info(f"Deleted batch of {len(batch)} points")
                
                logger.info(f"Successfully deleted all points for content: {content_id}")
            else:
                logger.warning(f"No points found in Qdrant for content_id: {content_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error deleting content from Qdrant: {e}")
            return False
    
    async def update_content(
        self,
        content_id: str,
        text: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """Update content in Qdrant"""
        try:
            # Delete old content
            await self.delete_content(content_id)
            
            # Add new content
            return await self.add_content(content_id, text, embedding, metadata)
            
        except Exception as e:
            logger.error(f"Error updating content in Qdrant: {e}")
            return False
    
    async def get_collection_info(self) -> Dict[str, Any]:
        """Get collection information"""
        try:
            await self.ensure_collection_exists()
            
            info = self.client.get_collection(self.collection_name)
            return {
                "name": info.name,
                "status": info.status,
                "points_count": info.points_count,
                "vectors_count": info.vectors_count
            }
            
        except Exception as e:
            logger.error(f"Error getting collection info: {e}")
            return {}


# Singleton instance
qdrant_service = QdrantService()