/**
 * Content viewer utility functions
 */

// Force HTTPS URL to bypass any environment variable issues
const API_BASE_URL = 'https://13.53.207.48/api/v1';

export interface ContentItem {
  id: string;
  title: string;
  content_type: 'text' | 'video' | 'document' | 'website' | 'pdf' | 'youtube';
  file_path?: string;
  source_url?: string;
  external_url?: string;
  content_text?: string;
}

/**
 * Handle viewing different types of content
 */
export const handleContentView = (content: ContentItem) => {
  const { content_type, file_path, source_url, external_url, content_text, id, title } = content;

  switch (content_type) {
    case 'pdf':
    case 'document':
      if (file_path) {
        // Handle authenticated PDF/document viewing
        handleAuthenticatedFileView(file_path);
      } else {
        alert('Document file not found');
      }
      break;

    case 'youtube':
    case 'video':
      const videoUrl = source_url || external_url;
      if (videoUrl) {
        window.open(videoUrl, '_blank');
      } else {
        alert('Video URL not found');
      }
      break;

    case 'website':
      const websiteUrl = source_url || external_url;
      if (websiteUrl) {
        window.open(websiteUrl, '_blank');
      } else {
        alert('Website URL not found');
      }
      break;

    case 'text':
      // For text content, we can either show in modal or new page
      if (content_text) {
        showTextContentModal(title, content_text);
      } else {
        alert('Text content not found');
      }
      break;

    default:
      // Try to determine best action based on available data
      if (source_url || external_url) {
        window.open(source_url || external_url!, '_blank');
      } else if (file_path) {
        handleAuthenticatedFileView(file_path);
      } else if (content_text) {
        showTextContentModal(title, content_text);
      } else {
        alert('Content cannot be viewed - no valid source found');
      }
  }
};

/**
 * Handle authenticated file viewing with proper auth token
 */
const handleAuthenticatedFileView = async (file_path: string) => {
  try {
    // Get auth token from cookie storage (same as API client)
    const getCookie = (name: string): string | null => {
      if (typeof document === 'undefined') return null;
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
      return null;
    };
    
    const authStoreCookie = getCookie('auth-store');
    let authToken = null;
    
    if (authStoreCookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(authStoreCookie));
        authToken = parsed.state?.token || null;
      } catch (e) {
        console.error('Error parsing auth store cookie:', e);
      }
    }
    
    // Fallback to localStorage if cookie method fails
    if (!authToken) {
      const token = localStorage.getItem('auth-store');
      authToken = token ? JSON.parse(token).state?.token : null;
    }
    
    if (!authToken) {
      alert('Please log in to view this document');
      return;
    }
    
    // Create authenticated download
    const response = await fetch(`${API_BASE_URL}/content/download/${file_path}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        alert('Authentication failed. Please log in again.');
      } else {
        alert('Failed to load document. Please try again.');
      }
      return;
    }
    
    // Get the file blob and create object URL
    const blob = await response.blob();
    const fileUrl = window.URL.createObjectURL(blob);
    
    // Open in new tab
    const newWindow = window.open(fileUrl, '_blank');
    
    // Clean up the object URL after a delay
    setTimeout(() => {
      window.URL.revokeObjectURL(fileUrl);
    }, 1000);
    
  } catch (error) {
    console.error('Error viewing document:', error);
    alert('Failed to load document. Please try again.');
  }
};

/**
 * Show text content in a modal
 */
const showTextContentModal = (title: string, content: string) => {
  // Create modal dynamically
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col';
  
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4 border-b pb-4';
  header.innerHTML = `
    <h3 class="text-lg font-semibold">${title}</h3>
    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
  `;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'flex-1 overflow-y-auto prose prose-sm max-w-none';
  contentDiv.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-sm">${content}</pre>`;
  
  modalContent.appendChild(header);
  modalContent.appendChild(contentDiv);
  modal.appendChild(modalContent);
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  document.body.appendChild(modal);
};

/**
 * Get icon for content type
 */
export const getContentTypeIcon = (contentType: string) => {
  switch (contentType) {
    case 'pdf':
    case 'document':
      return 'FileText';
    case 'youtube':
    case 'video':
      return 'Video';
    case 'website':
      return 'Link';
    case 'text':
      return 'BookOpen';
    default:
      return 'FileText';
  }
};

/**
 * Get human-readable content type label
 */
export const getContentTypeLabel = (contentType: string) => {
  switch (contentType) {
    case 'pdf':
      return 'PDF Document';
    case 'document':
      return 'Document';
    case 'youtube':
      return 'YouTube Video';
    case 'video':
      return 'Video';
    case 'website':
      return 'Website';
    case 'text':
      return 'Text Content';
    default:
      return contentType;
  }
};