'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { usePageTimeTracking } from '../../../../../hooks/usePageTimeTracking';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Calendar, 
  Clock,
  Award,
  Search,
  Filter,
  Eye,
  BookOpen,
  Target
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
}

interface PastPaper {
  id: string;
  title: string;
  description: string;
  exam_year: string;
  exam_stage: string;
  status: string;
  file_path: string;
  file_size: number;
  syllabus_item_id?: string;
  course_name?: string;
  syllabus_item_title?: string;
  created_at: string;
}

export default function StudentPastPapers({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);

  // Track time on past papers page
  usePageTimeTracking({
    pageType: 'past_paper'
  });
  const [pastPapers, setPastPapers] = useState<PastPaper[]>([]);
  const [filteredPapers, setFilteredPapers] = useState<PastPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedStage, setSelectedStage] = useState('');

  useEffect(() => {
    fetchData();
  }, [params.id]);

  useEffect(() => {
    filterPapers();
  }, [pastPapers, searchTerm, selectedYear, selectedStage]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch course details
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);
      
      // Fetch past papers for this course
      const papersData = await apiClient.getPastPapers({ course_id: params.id });
      setPastPapers(papersData.filter((p: PastPaper) => p.status === 'completed' || p.status === 'active'));
      
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterPapers = () => {
    let filtered = pastPapers;

    if (searchTerm) {
      filtered = filtered.filter(paper => 
        paper.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        paper.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        paper.exam_year?.includes(searchTerm) ||
        paper.exam_stage?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedYear) {
      filtered = filtered.filter(paper => paper.exam_year === selectedYear);
    }

    if (selectedStage) {
      filtered = filtered.filter(paper => paper.exam_stage === selectedStage);
    }

    setFilteredPapers(filtered);
  };

  const handleDownload = async (paper: PastPaper) => {
    try {
      console.log('Starting download for paper:', paper.title);
      console.log('Original file path:', paper.file_path);

      // Try different path variations for backward compatibility
      const pathVariations = [
        // Try with uploads/ prefix (current backend expectation)
        paper.file_path.replace('past_papers/', 'uploads/'),
        // Try original path as stored
        paper.file_path,
        // Try adding uploads/ prefix if not present
        paper.file_path.startsWith('uploads/') ? paper.file_path : `uploads/${paper.file_path}`
      ];

      let blob = null;
      let successfulPath = null;

      // Try each path variation until one works
      for (const filePath of pathVariations) {
        try {
          console.log('Trying download path:', filePath);
          blob = await apiClient.downloadContentFile(filePath);
          successfulPath = filePath;
          break;
        } catch (error: any) {
          console.log(`Failed with path ${filePath}:`, error.message);
          // Continue to next path variation
        }
      }

      if (!blob) {
        throw new Error('File could not be downloaded with any path variation');
      }

      console.log('Successfully downloaded with path:', successfulPath);

      // Extract original filename from file path (after timestamp prefix)
      const pathParts = paper.file_path.split('/');
      const fileWithTimestamp = pathParts[pathParts.length - 1];
      const underscoreIndex = fileWithTimestamp.indexOf('_');
      let filename = paper.title + '.pdf';
      if (underscoreIndex > 0) {
        filename = fileWithTimestamp.substring(underscoreIndex + 1);
      }

      console.log('Downloading as filename:', filename);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('Download completed successfully');
    } catch (error: any) {
      console.error('Download failed:', error);

      // More detailed error message
      let errorMessage = 'Failed to download past paper. ';
      if (error.message) {
        if (error.message.includes('404') || error.message.includes('File not found')) {
          errorMessage += 'The file could not be found on the server.';
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          errorMessage += 'You do not have permission to download this file.';
        } else if (error.message.includes('401') || error.message.includes('Not authenticated')) {
          errorMessage += 'Please log in again and try downloading.';
        } else {
          errorMessage += `Error: ${error.message}`;
        }
      } else {
        errorMessage += 'Please check your connection and try again.';
      }

      alert(errorMessage);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUniqueYears = () => {
    return [...new Set(pastPapers.map(p => p.exam_year).filter(Boolean))].sort().reverse();
  };

  const getUniqueStages = () => {
    return [...new Set(pastPapers.map(p => p.exam_stage).filter(Boolean))];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading past papers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/student/courses/${params.id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Course
            </Button>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Past Papers</h1>
              {course && (
                <p className="text-gray-600">{course.name}</p>
              )}
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search papers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Year Filter */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Years</option>
              {getUniqueYears().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            {/* Stage Filter */}
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Stages</option>
              {getUniqueStages().map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>

            {/* Clear Filters */}
            {(searchTerm || selectedYear || selectedStage) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedYear('');
                  setSelectedStage('');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">
            Showing {filteredPapers.length} of {pastPapers.length} past papers
          </p>
        </div>

        {/* Past Papers Grid */}
        {filteredPapers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">
              {pastPapers.length === 0 ? 'No Past Papers Available' : 'No Papers Match Your Search'}
            </h3>
            <p className="text-gray-600 mb-4">
              {pastPapers.length === 0 
                ? 'Past papers for this course will be available soon.'
                : 'Try adjusting your search terms or filters.'}
            </p>
            {pastPapers.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedYear('');
                  setSelectedStage('');
                }}
              >
                Clear All Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPapers.map((paper) => (
              <div key={paper.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-start space-x-3 mb-4">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <FileText className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{paper.title}</h3>
                      {paper.description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{paper.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(paper.exam_year || paper.exam_stage) && (
                      <div className="flex flex-wrap gap-2">
                        {paper.exam_year && (
                          <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                            <Calendar className="h-3 w-3 mr-1" />
                            {paper.exam_year}
                          </span>
                        )}
                        {paper.exam_stage && (
                          <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                            <Award className="h-3 w-3 mr-1" />
                            {paper.exam_stage}
                          </span>
                        )}
                      </div>
                    )}

                    {paper.syllabus_item_title && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Target className="h-4 w-4 mr-1" />
                        <span className="truncate">{paper.syllabus_item_title}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        {formatDate(paper.created_at)}
                      </div>
                      {paper.file_size && (
                        <span>{formatFileSize(paper.file_size)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 space-y-2">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => router.push(`/student/practice/${paper.id}`)}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Practice Questions
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDownload(paper)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    Practice extracted questions with AI feedback
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}