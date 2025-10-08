'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  BookOpen, 
  Clock, 
  Users, 
  CheckCircle, 
  Plus,
  Search,
  Filter,
  Star,
  TrendingUp
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  creator_id: string;
}

interface Enrollment {
  id: string;
  course_id: string;
  student_id: string;
  enrollment_status: string;
  enrolled_at: string;
}

export default function BrowseCourses() {
  const router = useRouter();
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [enrollingCourse, setEnrollingCourse] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [coursesData, enrollmentsData] = await Promise.all([
        apiClient.getCourses(),
        apiClient.getMyEnrollments().catch(() => []) // Handle case where student has no enrollments
      ]);
      
      setAllCourses(coursesData.filter((course: Course) => course.status === 'active'));
      setMyEnrollments(enrollmentsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnrollInCourse = async (courseId: string) => {
    try {
      setEnrollingCourse(courseId);
      await apiClient.enrollInCourse(courseId);
      await fetchData(); // Refresh data
      alert('Successfully enrolled in course!');
    } catch (error: any) {
      console.error('Failed to enroll:', error);
      if (error.status === 400) {
        alert('You are already enrolled in this course.');
      } else {
        alert('Failed to enroll in course. Please try again.');
      }
    } finally {
      setEnrollingCourse(null);
    }
  };

  const isEnrolled = (courseId: string) => {
    return myEnrollments.some(enrollment => enrollment.course_id === courseId);
  };

  const filteredCourses = allCourses.filter(course => {
    const matchesSearch = course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedFilter === 'enrolled') {
      return matchesSearch && isEnrolled(course.id);
    } else if (selectedFilter === 'available') {
      return matchesSearch && !isEnrolled(course.id);
    }
    
    return matchesSearch;
  });

  const getExamTypeColor = (examType: string) => {
    switch (examType) {
      case 'competitive': return 'bg-red-100 text-red-800';
      case 'academic': return 'bg-blue-100 text-blue-800';
      case 'professional': return 'bg-green-100 text-green-800';
      case 'certification': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
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
                onClick={() => router.push('/student/courses')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Courses
              </Button>
              <div className="flex items-center space-x-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Browse Courses</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Courses</option>
                <option value="available">Available to Enroll</option>
                <option value="enrolled">My Enrolled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-gray-600">Total Available</p>
            </div>
            <p className="text-2xl font-semibold">{allCourses.length}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm text-gray-600">My Enrolled</p>
            </div>
            <p className="text-2xl font-semibold text-green-600">{myEnrollments.length}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <p className="text-sm text-gray-600">Available to Join</p>
            </div>
            <p className="text-2xl font-semibold text-purple-600">
              {allCourses.length - myEnrollments.length}
            </p>
          </div>
        </div>

        {/* Courses Grid */}
        {filteredCourses.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Courses Found</h3>
            <p className="text-gray-600">
              {searchTerm || selectedFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria.'
                : 'No courses are available at this time.'
              }
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const enrolled = isEnrolled(course.id);
              const isEnrolling = enrollingCourse === course.id;
              
              return (
                <div key={course.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <BookOpen className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getExamTypeColor(course.exam_type)}`}>
                          {course.exam_type}
                        </span>
                        {enrolled && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Enrolled
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {course.name}
                    </h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                      {course.description || 'No description available.'}
                    </p>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        Created {new Date(course.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {enrolled ? (
                        <>
                          <Button 
                            className="w-full" 
                            size="sm"
                            onClick={() => router.push(`/student/courses/${course.id}`)}
                          >
                            <BookOpen className="h-4 w-4 mr-2" />
                            Continue Learning
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="w-full"
                            onClick={() => router.push(`/student/courses/${course.id}`)}
                          >
                            View Course
                          </Button>
                        </>
                      ) : (
                        <Button 
                          className="w-full" 
                          size="sm"
                          onClick={() => handleEnrollInCourse(course.id)}
                          disabled={isEnrolling}
                        >
                          {isEnrolling ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Enrolling...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Enroll Now
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}