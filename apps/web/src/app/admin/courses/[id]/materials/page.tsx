'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { handleContentView } from '../../../../../lib/content-viewer';
import { Button } from "@/components/ui/button";
import { contentSummaryService } from '../../../../../lib/contentSummaryService';
import { textExtractor } from '../../../../../lib/textExtractor';
import { 
  ArrowLeft, 
  Plus, 
  BookOpen, 
  Upload, 
  Edit2, 
  Trash2,
  FileText,
  Video,
  Link,
  Download,
  Eye
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
}

interface Content {
  id: string;
  title: string;
  description: string;
  content_type: 'text' | 'video' | 'document' | 'website' | 'pdf' | 'youtube';
  language: string;
  processing_status?: 'uploading' | 'extracting' | 'translating' | 'embedding' | 'ready' | 'failed';
  syllabus_item_id: string;
  file_path?: string;
  external_url?: string;
  source_url?: string;
  content_text?: string;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  syllabus_item?: {
    title: string;
    item_type: string;
  };
}

interface SyllabusItem {
  id: string;
  title: string;
  item_type: string;
}

export default function MaterialsManagement({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Content[]>([]);
  const [syllabusItems, setSyllabusItems] = useState<SyllabusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Content | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const [materialForm, setMaterialForm] = useState({
    title: '',
    description: '',
    content_type: 'pdf' as 'pdf' | 'youtube' | 'website' | 'docx' | 'video_link' | 'text',
    language: 'en',
    syllabus_item_id: '',
    external_url: '',
    content_text: ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useOcr, setUseOcr] = useState(false);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  // Auto-refresh when there are materials being processed
  useEffect(() => {
    const hasProcessingMaterials = materials.some(
      material => material.processing_status &&
      ['uploading', 'extracting', 'translating', 'embedding'].includes(material.processing_status)
    );

    if (hasProcessingMaterials) {
      const interval = setInterval(() => {
        fetchData();
      }, 3000); // Refresh every 3 seconds

      return () => clearInterval(interval);
    }
  }, [materials]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [courseData, materialsData] = await Promise.all([
        apiClient.getCourse(params.id),
        apiClient.getContent({ course_id: params.id })
      ]);
      
      setCourse(courseData);
      setMaterials(materialsData);

      // Fetch syllabus items for the dropdown
      try {
        console.log('Fetching syllabus for course:', params.id);
        const syllabusData = await apiClient.getCourseSyllabus(params.id);
        console.log('Syllabus data:', syllabusData);
        if (syllabusData) {
          const itemsData = await apiClient.getSyllabusItems(syllabusData.id);
          console.log('Syllabus items:', itemsData);
          setSyllabusItems(itemsData);
        }
      } catch (error) {
        console.log('No syllabus found - materials can be added without syllabus linking');
        console.error('Syllabus fetch error:', error);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMaterialSummary = async (contentResult: any, contentData: any) => {
    try {
      setIsGeneratingSummary(true);
      setSummaryProgress('Extracting content for analysis...');

      // Extract text content based on type
      const textContent = await textExtractor.getContentPreview(
        contentData.content_type,
        contentData.title,
        contentData.description,
        selectedFile,
        contentData.external_url,
        contentData.content_text
      );

      setSummaryProgress('Generating AI summary...');

      // Generate summary using AI
      const summary = await contentSummaryService.generateMaterialSummary(
        textContent,
        contentData.content_type,
        contentData.title,
        contentData.description
      );

      setSummaryProgress('Saving summary to database...');

      // Save summary to database
      await apiClient.createContentSummary({
        content_id: contentResult.id,
        summary_text: summary.summary_text,
        key_topics: summary.key_topics,
        content_type: summary.content_type,
        difficulty_level: summary.difficulty_level,
        estimated_reading_time: summary.estimated_reading_time,
        learning_objectives: summary.learning_objectives
      });

      setSummaryProgress('Summary generated successfully!');
      console.log('Material summary generated and saved:', summary);

    } catch (error) {
      console.error('Failed to generate material summary:', error);
      setSummaryProgress('Summary generation failed, but material was uploaded successfully');
    } finally {
      setTimeout(() => {
        setIsGeneratingSummary(false);
        setSummaryProgress('');
      }, 2000);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    console.log('Starting to add material:', materialForm);
    
    try {
      let contentData: any = {
        title: materialForm.title,
        description: materialForm.description,
        content_type: materialForm.content_type,
        language: materialForm.language,
        course_id: params.id, // Add the course ID from URL params
        syllabus_item_id: materialForm.syllabus_item_id || null,
      };

      console.log('Initial content data:', contentData);

      // Handle different content types
      if (materialForm.content_type === 'text') {
        contentData.content_text = materialForm.content_text;
      } else if (materialForm.content_type === 'website') {
        contentData.external_url = materialForm.external_url;
      } else if (materialForm.content_type === 'video_link') {
        contentData.external_url = materialForm.external_url;
        
        // Auto-detect YouTube URLs and set correct content type
        if (materialForm.external_url && 
            (materialForm.external_url.includes('youtube.com') || 
             materialForm.external_url.includes('youtu.be'))) {
          contentData.content_type = 'youtube';
          console.log('Auto-detected YouTube URL, setting content_type to youtube');
        }
      } else if (materialForm.content_type === 'youtube') {
        contentData.external_url = materialForm.external_url;
      } else if (selectedFile && (materialForm.content_type === 'pdf' || materialForm.content_type === 'docx')) {
        console.log('Uploading file:', selectedFile.name, selectedFile.size, 'bytes, type:', selectedFile.type);
        console.log('File details:', {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
          lastModified: selectedFile.lastModified
        });
        
        try {
          if (useOcr) {
            setIsProcessingOcr(true);
          }

          // Upload file with shorter timeout for immediate response
          const uploadPromise = apiClient.uploadContentFile(selectedFile, useOcr, materialForm.language);

          // Set a timeout of 5 seconds for the upload response
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Upload started in background')), 5000)
          );

          let uploadResponse;
          try {
            uploadResponse = await Promise.race([uploadPromise, timeoutPromise]);
            console.log('Upload response received:', uploadResponse);
          } catch (timeoutError) {
            // If timeout, assume upload is processing in background
            console.log('Upload is processing in background...');
            // Create a partial response to continue
            uploadResponse = {
              message: 'File uploaded, processing in background',
              file_path: `uploads/content/${selectedFile.name}`,
              processing_status: 'uploading'
            };
          }

          contentData.file_path = uploadResponse.file_path;

          // If translation was successful (for Tamil documents), use translated text
          if (uploadResponse.translation_result?.success && uploadResponse.translation_result.translated_text) {
            console.log('Tamil document translation successful, using translated text');
            contentData.content_text = uploadResponse.translation_result.translated_text;
          }
          // Otherwise, if extracted_text is available (from PDF/DOCX), use it
          else if (uploadResponse.extracted_text) {
            console.log('Using extracted text from document');
            contentData.content_text = uploadResponse.extracted_text;
          }
          // If OCR was successful, add the extracted text to content_text
          else if (uploadResponse.ocr_result?.success && uploadResponse.ocr_result.text) {
            console.log('OCR extraction successful, adding text to content');
            contentData.content_text = uploadResponse.ocr_result.text;
          } else if (useOcr && !uploadResponse.ocr_result?.success) {
            console.warn('OCR processing failed:', uploadResponse.ocr_result?.error);
          }

          setIsProcessingOcr(false);
        } catch (uploadError: any) {
          setIsProcessingOcr(false);
          console.error('File upload failed:', uploadError);
          console.error('Upload error details:', {
            message: uploadError.message,
            status: uploadError.status,
            errors: uploadError.errors
          });
          throw new Error(`File upload failed: ${uploadError.message}`);
        }
      }

      // Remove any undefined or null values to clean the payload
      Object.keys(contentData).forEach(key => {
        if (contentData[key] === undefined || contentData[key] === null || contentData[key] === '') {
          delete contentData[key];
        }
      });

      console.log('Final content data before API call:', contentData);

      // Try setting syllabus_item_id to null instead of the UUID if it's causing issues
      if (contentData.syllabus_item_id === 'e222730f-b233-4632-82a6-82832babfb95') {
        console.log('Removing potentially problematic syllabus_item_id for testing');
        delete contentData.syllabus_item_id;
      }

      // Validate required fields
      if (!contentData.title || !contentData.content_type || !contentData.course_id) {
        throw new Error('Missing required fields: title, content_type, or course_id');
      }
      
      // For YouTube content, show progress simulation
      if (materialForm.content_type === 'youtube') {
        setUploadProgress(10); // Initial progress
        
        // Simulate progress for YouTube processing
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 80) {
              clearInterval(progressInterval);
              return 80; // Keep at 80% until actual completion
            }
            return prev + 10;
          });
        }, 300);
        
        // Create the content
        const result = await apiClient.createContent(contentData);
        console.log('Create content result:', result);
        
        // Complete the progress
        setUploadProgress(100);
        
        // Clear interval if still running
        clearInterval(progressInterval);
        
        // Generate summary for YouTube content
        await generateMaterialSummary(result, contentData);

        // Show success message for YouTube
        setTimeout(() => {
          alert('YouTube video added successfully! The video is being processed in the background and will be available for AI chat in a few moments.');
        }, 500);
      } else {
        // For other content types, normal flow
        const result = await apiClient.createContent(contentData);
        console.log('Create content result:', result);

        // Generate summary for non-YouTube content types
        await generateMaterialSummary(result, contentData);

        // Show special message for Tamil documents
        if (materialForm.language === 'ta') {
          setTimeout(() => {
            alert('Tamil document uploaded successfully! Translation to English and AI processing is happening in the background. This may take 10-15 minutes. The document will appear with status indicators in the materials list.');
          }, 500);
        } else if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
          setTimeout(() => {
            alert('Large document uploaded successfully! Text extraction and AI processing is happening in the background. This may take 5-10 minutes.');
          }, 500);
        }
      }

      setShowAddMaterial(false);
      resetForm();
      await fetchData();
      console.log('Material added successfully!');
    } catch (error: any) {
      console.error('Failed to add material:', error);
      console.error('Error details:', error.message, error.status);

      // Handle specific timeout/gateway errors
      if (error.status === 504 || error.status === 502 || error.message?.includes('Gateway Time-out')) {
        if (materialForm.language === 'ta' || (selectedFile && selectedFile.size > 10 * 1024 * 1024)) {
          // For Tamil or large files, timeout is expected
          alert('Upload started successfully! The file is being processed in the background. Translation and AI processing may take 10-15 minutes. Please check the materials list in a few minutes to see the processing status.');

          // Still close the modal and refresh since upload likely started
          setShowAddMaterial(false);
          resetForm();
          await fetchData();
          return;
        }
      }

      alert(`Failed to add material: ${error.message || 'Please try again.'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Note: Summary generation state is handled within generateMaterialSummary function
    }
  };

  const resetForm = () => {
    setMaterialForm({
      title: '',
      description: '',
      content_type: 'pdf',
      language: 'en',
      syllabus_item_id: '',
      external_url: '',
      content_text: ''
    });
    setSelectedFile(null);
    setUseOcr(false);
    setIsProcessingOcr(false);
  };

  // Auto-refresh materials if any are being processed
  useEffect(() => {
    if (materials.length > 0) {
      const processingMaterials = materials.filter((material: Content) =>
        material.processing_status &&
        ['uploading', 'extracting', 'translating', 'embedding'].includes(material.processing_status)
      );

      if (processingMaterials.length > 0) {
        console.log(`Found ${processingMaterials.length} materials being processed, starting auto-refresh`);

        // Clear any existing interval first
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }

        const interval = setInterval(() => {
          console.log('Auto-refreshing materials for processing status...');
          fetchData();
        }, 30000); // Refresh every 30 seconds

        setPollingInterval(interval);

        return () => {
          clearInterval(interval);
        };
      } else {
        // No materials being processed, clear any existing interval
        if (pollingInterval) {
          console.log('No materials being processed, stopping auto-refresh');
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    }
  }, [materials]); // Remove pollingInterval from dependencies to prevent infinite loops

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleDeleteMaterial = async (materialId: string) => {
    if (confirm('Are you sure you want to delete this material?')) {
      try {
        await apiClient.deleteContent(materialId);
        fetchData();
      } catch (error) {
        console.error('Failed to delete material:', error);
        alert('Failed to delete material. Please try again.');
      }
    }
  };

  const handleDownloadMaterial = async (material: Content) => {
    if (!material.file_path) {
      alert('No file available for download');
      return;
    }

    try {
      const response = await apiClient.downloadContent(material.file_path);
      
      // Create blob and download
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from Content-Disposition header or use material title
      const contentDisposition = response.headers['content-disposition'];
      let filename = material.title;
      
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (matches && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      } else if (material.file_path) {
        // Fallback: extract original filename from file_path
        const pathParts = material.file_path.split('_');
        if (pathParts.length > 1) {
          filename = pathParts.slice(1).join('_');
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download material:', error);
      alert('Failed to download material. Please try again.');
    }
  };

  const handleEditMaterial = (material: Content) => {
    setEditingMaterial(material);
    setMaterialForm({
      title: material.title,
      description: material.description || '',
      content_type: material.content_type,
      language: material.language,
      syllabus_item_id: material.syllabus_item_id || '',
      external_url: material.external_url || '',
      content_text: material.content_text || ''
    });
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    try {
      await apiClient.updateContent(editingMaterial.id, {
        title: materialForm.title,
        description: materialForm.description,
        content_text: materialForm.content_type === 'text' ? materialForm.content_text : undefined,
        external_url: materialForm.content_type === 'website' || materialForm.content_type === 'video_link' || materialForm.content_type === 'youtube' ? materialForm.external_url : undefined
      });
      
      setEditingMaterial(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to update material:', error);
      alert('Failed to update material. Please try again.');
    }
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="h-5 w-5" />;
      case 'docx': return <FileText className="h-5 w-5" />;
      case 'video_link':
      case 'youtube': return <Video className="h-5 w-5" />;
      case 'website': return <Link className="h-5 w-5" />;
      case 'text': return <BookOpen className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getProcessingStatusColor = (processingStatus: string) => {
    switch (processingStatus) {
      case 'ready': return 'bg-green-100 text-green-800';
      case 'uploading': return 'bg-blue-100 text-blue-800';
      case 'extracting': return 'bg-blue-100 text-blue-800';
      case 'translating': return 'bg-purple-100 text-purple-800';
      case 'embedding': return 'bg-orange-100 text-orange-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getProcessingStatusText = (processingStatus: string) => {
    switch (processingStatus) {
      case 'uploading': return 'Uploading...';
      case 'extracting': return 'Extracting text...';
      case 'translating': return 'Translating...';
      case 'embedding': return 'Processing embeddings...';
      case 'ready': return 'Ready';
      case 'failed': return 'Processing failed';
      default: return 'Ready';
    }
  };

  // Test function to isolate backend content creation issue
  const testContentCreation = async () => {
    console.log('[TEST] Starting simple content creation test without file...');
    try {
      const testData = {
        title: 'Test Content - Simple Text',
        description: 'This is a test content to isolate backend issues',
        content_type: 'text',
        language: 'en',
        course_id: params.id,
        content_text: 'This is test text content to verify the backend endpoint works.'
      };
      
      console.log('[TEST] Test data:', testData);
      
      const result = await apiClient.createContent(testData);
      console.log('[TEST] Success! Content created:', result);
      alert('Test successful! Content creation endpoint is working.');
      
      // Refresh the data to see the new content
      await fetchData();
    } catch (error: any) {
      console.error('[TEST] Content creation failed:', error);
      alert(`Test failed: ${error.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/admin/courses')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Courses
              </Button>
              <div className="flex items-center space-x-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Study Materials</h1>
                  <p className="text-gray-600">{course?.name}</p>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button 
                onClick={testContentCreation}
                variant="outline"
                className="bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
              >
                <FileText className="h-4 w-4 mr-2" />
                Test Backend
              </Button>
              <Button onClick={() => setShowAddMaterial(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Total Materials</p>
            <p className="text-2xl font-semibold">{materials.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Documents</p>
            <p className="text-2xl font-semibold">
              {materials.filter(m => m.content_type === 'document').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Videos</p>
            <p className="text-2xl font-semibold">
              {materials.filter(m => m.content_type === 'video').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Published</p>
            <p className="text-2xl font-semibold">
              {materials.filter(m => m.status === 'published').length}
            </p>
          </div>
        </div>

        {/* Materials List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">All Materials</h2>
          </div>
          
          {materials.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">No study materials uploaded yet.</p>
              <Button onClick={() => setShowAddMaterial(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Material
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {materials.map((material) => (
                <div key={material.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        {getContentIcon(material.content_type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium truncate">{material.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(material.status)}`}>
                            {material.status}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getProcessingStatusColor(material.processing_status || 'ready')}`}>
                            {getProcessingStatusText(material.processing_status || 'ready')}
                          </span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {material.content_type}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                            {material.language.toUpperCase()}
                          </span>
                        </div>
                        
                        <p className="text-gray-600 mb-2">{material.description}</p>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          {material.syllabus_item && (
                            <span>
                              Linked to: {material.syllabus_item.title}
                            </span>
                          )}
                          <span>Added: {new Date(material.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleContentView(material)}
                        title="View Content"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDownloadMaterial(material)}
                        title="Download Material"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEditMaterial(material)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteMaterial(material.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Material Modal */}
        {showAddMaterial && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Add Study Material</h3>
              
              <form onSubmit={handleAddMaterial} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Title *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={materialForm.title}
                      onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
                      placeholder="e.g., Indian Constitution PDF"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Content Type *</label>
                    <select
                      required
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={materialForm.content_type}
                      onChange={(e) => setMaterialForm({...materialForm, content_type: e.target.value as any})}
                    >
                      <option value="pdf">PDF Document</option>
                      <option value="docx">Word Document (DOCX)</option>
                      <option value="youtube">YouTube Video</option>
                      <option value="video_link">Video Link</option>
                      <option value="website">Website/External URL</option>
                      <option value="text">Text Content</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={materialForm.description}
                    onChange={(e) => setMaterialForm({...materialForm, description: e.target.value})}
                    placeholder="Brief description of the material"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Language</label>
                    <select
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={materialForm.language}
                      onChange={(e) => setMaterialForm({...materialForm, language: e.target.value})}
                    >
                      <option value="en">English</option>
                      <option value="ta">Tamil</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Link to Syllabus (Optional)</label>
                    <select
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={materialForm.syllabus_item_id}
                      onChange={(e) => setMaterialForm({...materialForm, syllabus_item_id: e.target.value})}
                    >
                      <option value="">Not linked to any topic</option>
                      {syllabusItems.length === 0 ? (
                        <option disabled>No syllabus items available</option>
                      ) : (
                        syllabusItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({item.item_type})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {syllabusItems.length === 0 
                        ? 'Create a syllabus first to link materials to specific topics'
                        : `${syllabusItems.length} syllabus items available`
                      }
                    </p>
                  </div>
                </div>

                {/* Content specific fields */}
                {(materialForm.content_type === 'pdf' || materialForm.content_type === 'docx') && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Upload File *</label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.docx,.pptx,.doc"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Supported formats: PDF, DOCX, PPTX (Max 50MB)
                    </p>

                    {/* OCR Option */}
                    {(materialForm.content_type === 'pdf' || selectedFile?.type.includes('image')) && (
                      <div className="mt-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={useOcr}
                            onChange={(e) => setUseOcr(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="text-sm text-gray-700">
                            Extract text using OCR (Optical Character Recognition)
                          </span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          OCR will extract text from PDFs and images to make content searchable and enable AI features
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {(materialForm.content_type === 'video_link' || materialForm.content_type === 'website' || materialForm.content_type === 'youtube') && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {materialForm.content_type === 'video_link' || materialForm.content_type === 'youtube' ? 'Video URL *' : 'External URL *'}
                    </label>
                    <input
                      type="url"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={materialForm.external_url}
                      onChange={(e) => setMaterialForm({...materialForm, external_url: e.target.value})}
                      placeholder={materialForm.content_type === 'video_link' || materialForm.content_type === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://example.com'}
                    />
                  </div>
                )}

                {materialForm.content_type === 'text' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Text Content *</label>
                    <textarea
                      rows={6}
                      required
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={materialForm.content_text}
                      onChange={(e) => setMaterialForm({...materialForm, content_text: e.target.value})}
                      placeholder="Enter the text content here..."
                    />
                  </div>
                )}

                {isUploading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {isProcessingOcr ? 'Processing OCR...' : 'Uploading...'}
                      </span>
                      <span className="text-sm">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    {isProcessingOcr && (
                      <p className="text-xs text-blue-600 mt-2">
                        Extracting text from document using OCR technology...
                      </p>
                    )}
                  </div>
                )}

                {isGeneratingSummary && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      <span className="text-sm font-medium text-green-800">Generating AI Summary...</span>
                    </div>
                    <p className="text-sm text-green-700">{summaryProgress}</p>
                    <div className="w-full bg-green-200 rounded-full h-2 mt-2">
                      <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                  </div>
                )}

                <div className="flex space-x-2 pt-4">
                  <Button type="submit" disabled={isUploading || isGeneratingSummary}>
                    {isUploading ? 'Uploading...' : isGeneratingSummary ? 'Generating Summary...' : 'Add Material'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowAddMaterial(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Material Modal */}
        {editingMaterial && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Edit Material</h3>
              <form onSubmit={handleUpdateMaterial} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Title *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={materialForm.title}
                      onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Language</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={materialForm.language}
                      onChange={(e) => setMaterialForm({...materialForm, language: e.target.value})}
                    >
                      <option value="en">English</option>
                      <option value="ta">Tamil</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={materialForm.description}
                    onChange={(e) => setMaterialForm({...materialForm, description: e.target.value})}
                  />
                </div>

                {materialForm.content_type === 'text' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Content Text</label>
                    <textarea
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={materialForm.content_text}
                      onChange={(e) => setMaterialForm({...materialForm, content_text: e.target.value})}
                      placeholder="Enter the text content..."
                    />
                  </div>
                )}

                {(materialForm.content_type === 'website' || materialForm.content_type === 'video_link' || materialForm.content_type === 'youtube') && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {materialForm.content_type === 'video_link' || materialForm.content_type === 'youtube' ? 'Video URL' : 'URL'}
                    </label>
                    <input
                      type="url"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={materialForm.external_url}
                      onChange={(e) => setMaterialForm({...materialForm, external_url: e.target.value})}
                      placeholder={materialForm.content_type === 'video_link' || materialForm.content_type === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://example.com'}
                    />
                  </div>
                )}

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> File uploads cannot be changed during editing. To update a document file, delete this material and create a new one.
                  </p>
                </div>

                <div className="flex space-x-2 pt-4">
                  <Button type="submit">Update Material</Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setEditingMaterial(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}