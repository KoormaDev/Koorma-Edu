"""
Web Scraping Service for extracting content from external URLs

This service handles:
- Fetching web pages
- Extracting text content from HTML
- Cleaning and formatting text
- Error handling for various website types
"""

import logging
import re
import requests
from bs4 import BeautifulSoup
from typing import Optional, Dict, Any
from urllib.parse import urljoin, urlparse
import time

logger = logging.getLogger(__name__)


class WebScrapingService:
    """Service for scraping web content"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.timeout = 10
        self.max_content_length = 50000  # Maximum characters to extract
        
    async def scrape_website(self, url: str) -> Dict[str, Any]:
        """
        Scrape content from a website URL
        
        Returns:
            Dict with 'title', 'content', 'url', 'success' keys
        """
        try:
            logger.info(f"Starting website scraping for: {url}")
            
            # Validate URL
            if not self._is_valid_url(url):
                raise ValueError(f"Invalid URL: {url}")
            
            # Fetch the webpage
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
            
            # Check content type
            content_type = response.headers.get('content-type', '').lower()
            if not any(ct in content_type for ct in ['text/html', 'application/xhtml']):
                raise ValueError(f"URL does not return HTML content: {content_type}")
            
            # Parse HTML
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract title
            title = self._extract_title(soup, url)
            
            # Extract main content
            content = self._extract_content(soup)
            
            # Clean and truncate content
            cleaned_content = self._clean_content(content)
            
            if len(cleaned_content) < 50:
                raise ValueError("Insufficient content extracted from website")
            
            logger.info(f"Successfully scraped {len(cleaned_content)} characters from {url}")
            
            return {
                'title': title,
                'content': cleaned_content,
                'url': url,
                'success': True,
                'content_length': len(cleaned_content)
            }
            
        except requests.RequestException as e:
            logger.error(f"Request failed for {url}: {e}")
            return {
                'title': f"Website: {url}",
                'content': '',
                'url': url,
                'success': False,
                'error': f"Failed to fetch website: {e}"
            }
        except Exception as e:
            logger.error(f"Scraping failed for {url}: {e}")
            return {
                'title': f"Website: {url}",
                'content': '',
                'url': url,
                'success': False,
                'error': f"Failed to extract content: {e}"
            }
    
    def _is_valid_url(self, url: str) -> bool:
        """Validate URL format"""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except:
            return False
    
    def _extract_title(self, soup: BeautifulSoup, url: str) -> str:
        """Extract page title"""
        # Try <title> tag first
        title_tag = soup.find('title')
        if title_tag and title_tag.string:
            title = title_tag.string.strip()
            if title:
                return title
        
        # Try h1 tag
        h1_tag = soup.find('h1')
        if h1_tag:
            title = h1_tag.get_text().strip()
            if title:
                return title
        
        # Try meta og:title
        og_title = soup.find('meta', {'property': 'og:title'})
        if og_title and og_title.get('content'):
            title = og_title.get('content').strip()
            if title:
                return title
        
        # Fallback to URL
        return f"Website: {urlparse(url).netloc}"
    
    def _extract_content(self, soup: BeautifulSoup) -> str:
        """Extract main content from webpage"""
        # Remove script, style, and other non-content tags
        for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript']):
            tag.decompose()
        
        # Try to find main content areas (in order of preference)
        content_selectors = [
            'main',
            'article',
            '.content',
            '.main-content',
            '#content',
            '.post-content',
            '.entry-content',
            'body'
        ]
        
        content_text = ""
        
        for selector in content_selectors:
            elements = soup.select(selector)
            if elements:
                # Get text from the first matching element
                element = elements[0]
                content_text = element.get_text(separator='\n', strip=True)
                if len(content_text) > 500:  # Good amount of content
                    break
        
        # If no specific content area found, get all text
        if len(content_text) < 500:
            content_text = soup.get_text(separator='\n', strip=True)
        
        return content_text
    
    def _clean_content(self, content: str) -> str:
        """Clean and format extracted content"""
        if not content:
            return ""
        
        # Split into lines and clean each line
        lines = content.split('\n')
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines and very short lines
            if len(line) < 3:
                continue
                
            # Skip lines that look like navigation or boilerplate
            if self._is_boilerplate(line):
                continue
                
            cleaned_lines.append(line)
        
        # Join lines and limit content length
        cleaned_content = '\n'.join(cleaned_lines)
        
        # Truncate if too long
        if len(cleaned_content) > self.max_content_length:
            cleaned_content = cleaned_content[:self.max_content_length] + "..."
        
        return cleaned_content
    
    def _is_boilerplate(self, text: str) -> bool:
        """Check if text line is likely boilerplate/navigation"""
        text_lower = text.lower()
        
        # Skip common boilerplate patterns
        boilerplate_patterns = [
            'cookie', 'privacy policy', 'terms of service', 'subscribe',
            'follow us', 'social media', 'newsletter', 'advertisement',
            'all rights reserved', 'copyright', '© 2024', '© 2023',
            'home', 'about', 'contact', 'login', 'register',
            'menu', 'navigation', 'search', 'skip to content'
        ]
        
        for pattern in boilerplate_patterns:
            if pattern in text_lower:
                return True
        
        # Skip if mostly punctuation or numbers
        alphanumeric_chars = sum(c.isalnum() for c in text)
        if alphanumeric_chars < len(text) * 0.5:
            return True
        
        return False


# Singleton instance
web_scraping_service = WebScrapingService()