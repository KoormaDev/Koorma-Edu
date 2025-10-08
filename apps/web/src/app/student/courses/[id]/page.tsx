'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  BookOpen, 
  FileText, 
  Calendar, 
  Clock,
  Users,
  Star,
  ChevronRight,
  GraduationCap,
  Target,
  Award,
  MessageCircle
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

interface CourseStats {
  total_materials: number;
  total_exams: number;
  total_past_papers: number;
  progress_percentage: number;
}

export default function StudentCourse({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [stats, setStats] = useState<CourseStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch course details
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);
      
      // Fetch course statistics and progress
      const [materialsData, examsData, pastPapersData, progressData] = await Promise.all([
        apiClient.getContent({ course_id: params.id }).catch(() => []),
        apiClient.getMockExams({ course_id: params.id, is_active: true }).catch(() => []),
        apiClient.getPastPapers({ course_id: params.id }).catch(() => []),
        apiClient.getCourseProgress(params.id).catch(() => null)
      ]);

      setStats({
        total_materials: materialsData.length,
        total_exams: examsData.length,
        total_past_papers: pastPapersData.length,
        progress_percentage: progressData ? progressData.completion_percentage : 0
      });
      
    } catch (error) {
      console.error('Failed to fetch course data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatExamType = (examType: string) => {
    return examType.charAt(0).toUpperCase() + examType.slice(1).replace('_', ' ');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading course...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold mb-2">Course Not Found</h3>
          <p className="text-gray-600 mb-4">The course you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/student/courses')}>
            Back to Courses
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/student/courses')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Courses
          </Button>
        </div>

        {/* Course Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <GraduationCap className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
                  <div className="flex items-center space-x-4 mt-2">
                    <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      <Target className="h-3 w-3 mr-1" />
                      {formatExamType(course.exam_type)}
                    </span>
                    {course.is_active && (
                      <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {course.description && (
                <p className="text-gray-600 mb-4">{course.description}</p>
              )}
              
              {(course.start_date || course.end_date) && (
                <div className="flex items-center space-x-6 text-sm text-gray-500">
                  {course.start_date && (
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Started: {formatDate(course.start_date)}
                    </div>
                  )}
                  {course.end_date && (
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      Ends: {formatDate(course.end_date)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Course Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Study Materials</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_materials}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Award className="h-5 w-5 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Mock Exams</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_exams}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="h-5 w-5 text-purple-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Past Papers</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_past_papers}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Star className="h-5 w-5 text-yellow-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Progress</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.progress_percentage.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Course Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Study Materials */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold">Study Materials</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Access course content, documents, videos, and other learning materials.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                {stats?.total_materials} materials available
              </div>
            </div>
            <div className="px-6 pb-6">
              <Button 
                className="w-full"
                onClick={() => router.push(`/student/courses/${params.id}/study`)}
              >
                Start Learning
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Mock Exams */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Award className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold">Mock Exams</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Practice with timed exams to test your knowledge and exam readiness.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                {stats?.total_exams} exams available
              </div>
            </div>
            <div className="px-6 pb-6">
              <Button 
                className="w-full"
                onClick={() => router.push(`/student/courses/${params.id}/exams`)}
              >
                Take Practice Exam
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Past Papers */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold">Past Papers</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Practice with previous exam papers to understand exam patterns and difficulty.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                {stats?.total_past_papers} papers available
              </div>
            </div>
            <div className="px-6 pb-6">
              <Button 
                className="w-full"
                onClick={() => router.push(`/student/courses/${params.id}/past-papers`)}
              >
                Browse Past Papers
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* AI Tutor */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <MessageCircle className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold">AI Tutor</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Get personalized help from your AI tutor based on course materials and syllabus.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                Available 24/7 • Course-specific
              </div>
            </div>
            <div className="px-6 pb-6">
              <Button 
                className="w-full"
                onClick={() => router.push(`/student/chat?course=${params.id}`)}
              >
                Ask AI Tutor
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}