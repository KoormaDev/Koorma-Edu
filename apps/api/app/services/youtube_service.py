"""
YouTube Video Processing Service

This service handles:
- YouTube URL validation and video ID extraction
- Transcript fetching using RapidAPI
- Video title fetching
- Content preprocessing for RAG

Adapted from oldProject implementation.
"""

import logging
import re
import requests
import httpx
from typing import Any, Dict, List, Optional, Tuple

from ..core.config import settings

logger = logging.getLogger(__name__)


def extract_video_id(url: str) -> Optional[str]:
    """Extracts the 11-character video ID from a YouTube URL."""
    patterns = [
        r"(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def fetch_youtube_video_title(video_url: str) -> str:
    """Fetches the title of a YouTube video using the oEmbed API."""
    try:
        async with httpx.AsyncClient() as client:
            oembed_url = f"https://www.youtube.com/oembed?url={video_url}&format=json"
            response = await client.get(oembed_url)
            response.raise_for_status()
            data = response.json()
            title = data.get("title")
            if not title:
                logger.warning(f"Could not find title in oEmbed response for {video_url}")
                return f"YouTube Video: {video_url}"
            logger.info(f"Fetched title for {video_url}: {title}")
            return title
    except Exception as e:
        logger.error(f"Failed to fetch YouTube title for {video_url}: {e}")
        return f"YouTube Video: {video_url}"  # Fallback title


def get_youtube_transcript(video_url: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Extracts a YouTube transcript using the RapidAPI youtube-transcriptor service.
    Returns a list of timed segments.
    """
    if not settings.RAPIDAPI_KEY:
        raise ValueError("RAPIDAPI_KEY is not configured in the environment.")

    sanitized_url = video_url.replace(" ", "")
    video_id = extract_video_id(sanitized_url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {sanitized_url}")

    api_url = "https://youtube-transcriptor.p.rapidapi.com/transcript"
    querystring = {"video_id": video_id, "lang": "en"}
    headers = {
        "x-rapidapi-key": settings.RAPIDAPI_KEY,
        "x-rapidapi-host": "youtube-transcriptor.p.rapidapi.com"
    }

    try:
        logger.info(f"Fetching transcript for video ID: {video_id} from RapidAPI...")
        response = requests.get(api_url, headers=headers, params=querystring, timeout=60)
        response.raise_for_status()

        data = response.json()

        if isinstance(data, list) and len(data) > 0 and "transcription" in data[0]:
            timed_segments = [
                {"text": t["subtitle"], "start": float(t["start"])}
                for t in data[0].get("transcription", []) if "subtitle" in t and "start" in t
            ]
            
            if not timed_segments:
                raise ValueError("No timed transcript segments found in the API response.")

            logger.info(f"SUCCESS: Extracted {len(timed_segments)} timed segments for video ID: {video_id}")
            
            # Get video title
            try:
                title_response = requests.get(f"https://www.youtube.com/oembed?url={sanitized_url}&format=json")
                video_title = title_response.json().get("title", f"YouTube Video: {video_id}")
            except:
                video_title = f"YouTube Video: {video_id}"
            
            metadata = {
                "video_id": video_id,
                "title": video_title,
                "source_type": "youtube",
                "video_url": sanitized_url,
                "method_used": "rapidapi-youtube-transcriptor"
            }
            return timed_segments, metadata
        else:
            raise ValueError(f"Unexpected response format from API: {data}")

    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error fetching transcript for {video_id}: {http_err} - Response: {response.text}")
        raise Exception(f"Failed to fetch transcript. API returned status {response.status_code}.") from http_err
    except Exception as e:
        logger.error(f"An error occurred during transcript extraction for {video_id}: {e}", exc_info=True)
        raise Exception("Failed to process the YouTube video via RapidAPI.") from e


class YouTubeService:
    """Service for processing YouTube videos"""
    
    def __init__(self):
        self.rapidapi_key = settings.RAPIDAPI_KEY
        
    async def process_youtube_video(self, video_url: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Process a YouTube video and extract transcript segments.
        
        Returns:
            Tuple of (timed_segments, metadata)
        """
        try:
            logger.info(f"Processing YouTube video: {video_url}")
            
            # Extract transcript
            segments, metadata = get_youtube_transcript(video_url)
            
            logger.info(f"Successfully processed YouTube video: {len(segments)} segments")
            return segments, metadata
            
        except Exception as e:
            logger.error(f"Failed to process YouTube video {video_url}: {e}")
            raise
    
    def is_youtube_url(self, url: str) -> bool:
        """Check if a URL is a valid YouTube URL"""
        return extract_video_id(url) is not None


# Create service instance
youtube_service = YouTubeService()