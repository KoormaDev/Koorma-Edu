"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { useLanguage } from "../../../contexts/LanguageContext";
import { 
  ArrowLeft,
  BookOpen,
  Clock,
  FileText,
  MessageSquare,
  Play,
  Plus
} from "lucide-react";

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
  default_language: string;
  status: string;
  created_at: string;
}

export default function StudentCourses() {
  const router = useRouter();
  const { t } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      // Get student's enrollments first
      const enrollments = await apiClient.getMyEnrollments();
      
      // Get the enrolled course details
      const enrolledCourses = await Promise.all(
        enrollments.map(async (enrollment: any) => {
          try {
            return await apiClient.getCourse(enrollment.course_id);
          } catch (error) {
            console.error(`Failed to fetch course ${enrollment.course_id}:`, error);
            return null;
          }
        })
      );
      
      // Filter out null values and set courses
      setCourses(enrolledCourses.filter(course => course !== null));
    } catch (error) {
      console.error("Failed to fetch enrolled courses:", error);
      // If no enrollments, show empty state
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>{t('common.loading')}</p>
        </div>
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
                onClick={() => router.push("/student")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('courses.backToDashboard')}
              </Button>
              <div className="flex items-center space-x-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('courses.title')}</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {courses.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('courses.noCourses')}</h3>
            <p className="text-gray-600">
              {t('courses.noCoursesMessage')}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div key={course.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-blue-600" />
                    </div>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                      {t('courses.status')}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {course.name}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {course.description}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                    <span>{course.exam_type}</span>
                    <span>{t('courses.enrolledDate')}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => router.push(`/student/courses/${course.id}`)}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {t('courses.viewCourse')}
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full"
                      onClick={() => router.push(`/student/chat?course=${course.id}`)}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      {t('courseDetail.aiTutor')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}