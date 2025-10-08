"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiClient } from "../../../lib/api";
import { 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft,
  BookOpen,
  Users,
  FileText,
  CheckCircle,
  FileStack
} from "lucide-react";

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
  default_language: string;
  status: string;
  creator_id: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export default function CourseManagement() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourse, setNewCourse] = useState({
    name: "",
    description: "",
    exam_type: "competitive",
    default_language: "en",
    start_date: "",
    end_date: ""
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const data = await apiClient.getCourses();
      setCourses(data);
    } catch (error) {
      console.error("Failed to fetch courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.createCourse(newCourse);
      setShowCreateForm(false);
      setNewCourse({
        name: "",
        description: "",
        exam_type: "competitive",
        default_language: "en",
        start_date: "",
        end_date: ""
      });
      fetchCourses();
    } catch (error) {
      console.error("Failed to create course:", error);
      alert("Failed to create course. Please try again.");
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (confirm("Are you sure you want to delete this course? This will also delete all associated syllabus, materials, and exams.")) {
      try {
        await apiClient.deleteCourse(courseId);
        fetchCourses();
      } catch (error) {
        console.error("Failed to delete course:", error);
        alert("Failed to delete course. Please try again.");
      }
    }
  };

  const handleActivateCourse = async (courseId: string) => {
    try {
      await apiClient.updateCourse(courseId, { status: 'active' });
      alert('Course activated successfully! Students can now see and enroll in this course.');
      fetchCourses();
    } catch (error) {
      console.error("Failed to activate course:", error);
      alert("Failed to activate course. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading courses...</p>
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
                onClick={() => router.push("/admin")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Course Management</h1>
              </div>
            </div>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Course
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Course</h2>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Course Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., UPSC Preparation 2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse({...newCourse, name: e.target.value})}
                />
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Exam Type *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCourse.exam_type}
                    onChange={(e) => setNewCourse({...newCourse, exam_type: e.target.value})}
                  >
                    <option value="competitive">Competitive Exam</option>
                    <option value="academic">Academic</option>
                    <option value="professional">Professional Certification</option>
                    <option value="certification">Government Certification</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Default Language *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCourse.default_language}
                    onChange={(e) => setNewCourse({...newCourse, default_language: e.target.value})}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCourse.start_date}
                    onChange={(e) => setNewCourse({...newCourse, start_date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCourse.end_date}
                    onChange={(e) => setNewCourse({...newCourse, end_date: e.target.value})}
                    min={newCourse.start_date || undefined}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief description of the course and exam preparation focus..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCourse.description}
                  onChange={(e) => setNewCourse({...newCourse, description: e.target.value})}
                />
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Next Steps</h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>After creating the course, you'll be able to:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Upload and structure the official syllabus</li>
                        <li>Add study materials and resources</li>
                        <li>Upload past question papers</li>
                        <li>Invite students to enroll</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button type="submit">Create Course</Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Courses List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">All Courses ({courses.length})</h2>
          </div>
          
          {courses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No courses found. Create your first course to get started.</p>
            </div>
          ) : (
            <div className="divide-y">
              {courses.map((course) => (
                <div key={course.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium">{course.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          course.status === 'active'
                            ? 'bg-green-100 text-green-800' 
                            : course.status === 'draft'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {course.status === 'active' ? 'Active' : 
                           course.status === 'draft' ? 'Draft' : 'Archived'}
                        </span>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                          {course.exam_type}
                        </span>
                      </div>
                      <p className="text-gray-600 mt-1">{course.description}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>Language: {course.default_language.toUpperCase()}</span>
                        <span>Created: {new Date(course.created_at).toLocaleDateString()}</span>
                        <span>Updated: {new Date(course.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {course.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => handleActivateCourse(course.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/courses/${course.id}/syllabus`)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Syllabus
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/courses/${course.id}/materials`)}
                      >
                        <BookOpen className="h-4 w-4 mr-1" />
                        Materials
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/courses/${course.id}/students`)}
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Students
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/courses/${course.id}/past-papers`)}
                      >
                        <FileStack className="h-4 w-4 mr-1" />
                        Past Papers
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/courses/${course.id}/edit`)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteCourse(course.id)}
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
      </main>
    </div>
  );
}