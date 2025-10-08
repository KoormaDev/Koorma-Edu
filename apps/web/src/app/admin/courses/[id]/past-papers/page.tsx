'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Plus, 
  Upload, 
  FileText, 
  Trash2,
  Download,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Settings
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
}

interface PastPaper {
  id: string;
  title: string;
  description?: string;
  exam_year?: string;
  exam_stage?: string;
  status: string;
  file_path?: string;
  file_size?: number;
  syllabus_item_id?: string;
  course_name?: string;
  syllabus_item_title?: string;
  created_at: string;
  updated_at: string;
}

interface SyllabusItem {
  id: string;
  title: string;
  item_type: string;
}

export default function PastPapersManagement({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [pastPapers, setPastPapers] = useState<PastPaper[]>([]);
  const [syllabusItems, setSyllabusItems] = useState<SyllabusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    exam_year: '',
    exam_stage: '',
    syllabus_item_id: '',
    difficulty_level: '',
    question_type: '',
    use_ocr: true,
    extract_questions: false
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch course details
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);

      // Fetch past papers for this course
      const pastPapersData = await apiClient.getPastPapers({ 
        course_id: params.id 
      });
      setPastPapers(pastPapersData);

      // Fetch syllabus items
      try {
        const syllabusData = await apiClient.getCourseSyllabus(params.id);
        if (syllabusData.items) {
          setSyllabusItems(syllabusData.items);
        }
      } catch (error) {
        console.error('Failed to fetch syllabus:', error);
        setSyllabusItems([]);
      }

    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      alert('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadData = {
        file: selectedFile,
        title: uploadForm.title,
        description: uploadForm.description || undefined,
        exam_year: uploadForm.exam_year || undefined,
        exam_stage: uploadForm.exam_stage || undefined,
        course_id: params.id,
        syllabus_item_id: uploadForm.syllabus_item_id || undefined,
        difficulty_level: uploadForm.difficulty_level || undefined,
        question_type: uploadForm.question_type || undefined,
        use_ocr: uploadForm.use_ocr,
        extract_questions: uploadForm.extract_questions
      };

      // Simulate progress for user feedback
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 10;
        });
      }, 500);

      const result = await apiClient.uploadPastPaper(uploadData);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        setShowUploadModal(false);
        resetForm();
        fetchData();
        alert('Past paper uploaded successfully! Processing will continue in the background.');
      }, 1000);

    } catch (error: any) {
      console.error('Upload failed:', error);
      alert(error.message || 'Failed to upload past paper. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeletePaper = async (paperId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      await apiClient.deletePastPaper(paperId);
      fetchData();
      alert('Past paper deleted successfully');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete past paper');
    }
  };

  const handleDownloadPaper = async (paper: PastPaper) => {
    if (!paper.file_path) {
      alert('No file available for download');
      return;
    }

    try {
      // Add uploads/ prefix if not already present for backend compatibility
      const filePath = paper.file_path.startsWith('uploads/') 
        ? paper.file_path 
        : `uploads/${paper.file_path}`;
        
      const blob = await apiClient.downloadContentFile(filePath);
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Use paper title and year for filename
      const filename = `${paper.title}${paper.exam_year ? '_' + paper.exam_year : ''}.pdf`;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download past paper:', error);
      alert('Failed to download past paper. Please try again.');
    }
  };

  const resetForm = () => {
    setUploadForm({
      title: '',
      description: '',
      exam_year: '',
      exam_stage: '',
      syllabus_item_id: '',
      difficulty_level: '',
      question_type: '',
      use_ocr: true,
      extract_questions: false
    });
    setSelectedFile(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredPapers = pastPapers.filter(paper => {
    const matchesSearch = paper.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (paper.description && paper.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || paper.status === statusFilter;
    
    const matchesYear = yearFilter === 'all' || paper.exam_year === yearFilter;

    return matchesSearch && matchesStatus && matchesYear;
  });

  const uniqueYears = [...new Set(pastPapers.map(p => p.exam_year).filter(Boolean))].sort();
  const uniqueStatuses = [...new Set(pastPapers.map(p => p.status))];

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
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Past Question Papers</h1>
                  <p className="text-gray-600">{course?.name}</p>
                </div>
              </div>
            </div>
            
            <Button onClick={() => setShowUploadModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Upload Past Paper
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Total Papers</p>
            <p className="text-2xl font-semibold">{pastPapers.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Completed</p>
            <p className="text-2xl font-semibold text-green-600">
              {pastPapers.filter(p => p.status === 'completed').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Processing</p>
            <p className="text-2xl font-semibold text-yellow-600">
              {pastPapers.filter(p => p.status === 'processing').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Failed</p>
            <p className="text-2xl font-semibold text-red-600">
              {pastPapers.filter(p => p.status === 'failed').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search papers..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Years</option>
              {uniqueYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Past Papers List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Past Papers ({filteredPapers.length})</h2>
          </div>
          
          {filteredPapers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">
                {searchTerm || statusFilter !== 'all' || yearFilter !== 'all' 
                  ? 'No past papers found matching your filters.' 
                  : 'No past papers uploaded yet.'}
              </p>
              {!searchTerm && statusFilter === 'all' && yearFilter === 'all' && (
                <Button onClick={() => setShowUploadModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload First Past Paper
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredPapers.map((paper) => (
                <div key={paper.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FileText className="h-6 w-6 text-blue-600" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium truncate">{paper.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center ${getStatusColor(paper.status)}`}>
                            {getStatusIcon(paper.status)}
                            <span className="ml-1">{paper.status}</span>
                          </span>
                        </div>
                        
                        {paper.description && (
                          <p className="text-gray-600 mb-2 line-clamp-2">{paper.description}</p>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          {paper.exam_year && (
                            <span className="bg-gray-100 px-2 py-1 rounded">
                              Year: {paper.exam_year}
                            </span>
                          )}
                          {paper.exam_stage && (
                            <span className="bg-gray-100 px-2 py-1 rounded">
                              Stage: {paper.exam_stage}
                            </span>
                          )}
                          {paper.syllabus_item_title && (
                            <span className="bg-blue-100 px-2 py-1 rounded text-blue-700">
                              {paper.syllabus_item_title}
                            </span>
                          )}
                          {paper.file_size && (
                            <span>{(paper.file_size / 1024 / 1024).toFixed(1)} MB</span>
                          )}
                          <span>
                            Uploaded: {new Date(paper.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push(`/admin/courses/${params.id}/past-papers/${paper.id}/questions`)}
                        title="Manage Questions"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      {paper.file_path && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          title="Download"
                          onClick={() => handleDownloadPaper(paper)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDeletePaper(paper.id, paper.title)}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        title="Delete"
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

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-6">Upload Past Question Paper</h3>
              
              <form onSubmit={handleUploadPaper} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Paper Title *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={uploadForm.title}
                      onChange={(e) => setUploadForm({...uploadForm, title: e.target.value})}
                      placeholder="e.g., Grade 5 Scholarship Exam 2023"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Exam Year</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={uploadForm.exam_year}
                      onChange={(e) => setUploadForm({...uploadForm, exam_year: e.target.value})}
                      placeholder="e.g., 2023"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Exam Stage</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={uploadForm.exam_stage}
                      onChange={(e) => setUploadForm({...uploadForm, exam_stage: e.target.value})}
                      placeholder="e.g., Final, Mock, Practice"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Syllabus Item</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={uploadForm.syllabus_item_id}
                      onChange={(e) => setUploadForm({...uploadForm, syllabus_item_id: e.target.value})}
                    >
                      <option value="">Select syllabus item (optional)</option>
                      {syllabusItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Difficulty Level</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={uploadForm.difficulty_level}
                      onChange={(e) => setUploadForm({...uploadForm, difficulty_level: e.target.value})}
                    >
                      <option value="">Select difficulty level (optional)</option>
                      <option value="beginner">Beginner</option>
                      <option value="moderate">Moderate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Question Type</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={uploadForm.question_type}
                      onChange={(e) => setUploadForm({...uploadForm, question_type: e.target.value})}
                    >
                      <option value="">Select question type (optional)</option>
                      <option value="mcq">Multiple Choice (MCQ)</option>
                      <option value="descriptive">Descriptive</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={uploadForm.description}
                    onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})}
                    placeholder="Optional description or notes about this past paper..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Upload File *</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported formats: PDF, PNG, JPG, JPEG, TIFF, BMP (Max: 50MB)
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="use_ocr"
                      checked={uploadForm.use_ocr}
                      onChange={(e) => setUploadForm({...uploadForm, use_ocr: e.target.checked})}
                      className="rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                    />
                    <label htmlFor="use_ocr" className="text-sm text-gray-700">
                      Use OCR (Optical Character Recognition) for image-based content
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="extract_questions"
                      checked={uploadForm.extract_questions}
                      onChange={(e) => setUploadForm({...uploadForm, extract_questions: e.target.checked})}
                      className="rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                    />
                    <label htmlFor="extract_questions" className="text-sm text-gray-700">
                      <span className="font-medium text-blue-600">Extract questions using AI</span>
                      <br />
                      <span className="text-xs text-gray-500">
                        Automatically identify and extract individual questions from the paper for student practice
                      </span>
                    </label>
                  </div>
                </div>

                {isUploading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">Uploading...</span>
                      <span className="text-sm text-blue-600">{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      Processing will continue in the background after upload completes.
                    </p>
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button type="submit" disabled={isUploading}>
                    {isUploading ? (
                      <>
                        <Upload className="h-4 w-4 mr-2 animate-pulse" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Past Paper
                      </>
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowUploadModal(false);
                      resetForm();
                    }}
                    disabled={isUploading}
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