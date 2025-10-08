'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Save, 
  BookOpen,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
  default_language: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export default function EditCourse({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    exam_type: 'competitive',
    default_language: 'en',
    status: 'draft' as 'draft' | 'active' | 'archived'
  });

  useEffect(() => {
    fetchCourse();
  }, [params.id]);

  const fetchCourse = async () => {
    try {
      setIsLoading(true);
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData as any);
      setFormData({
        name: (courseData as any).name,
        description: (courseData as any).description || '',
        exam_type: (courseData as any).exam_type,
        default_language: (courseData as any).default_language,
        status: (courseData as any).status
      });
    } catch (error) {
      console.error('Failed to fetch course:', error);
      alert('Failed to load course details');
      router.push('/admin/courses');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await apiClient.updateCourse(params.id, formData);
      alert('Course updated successfully!');
      router.push('/admin/courses');
    } catch (error) {
      console.error('Failed to update course:', error);
      alert('Failed to update course. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'draft':
        return {
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          icon: <AlertCircle className="h-4 w-4" />,
          description: 'Course is in draft mode. Students cannot see or enroll in this course.'
        };
      case 'active':
        return {
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: <CheckCircle className="h-4 w-4" />,
          description: 'Course is active and visible to students. They can browse and enroll.'
        };
      case 'archived':
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: <BookOpen className="h-4 w-4" />,
          description: 'Course is archived. No new enrollments allowed but existing students can continue.'
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: <BookOpen className="h-4 w-4" />,
          description: ''
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Course Not Found</h2>
          <p className="text-gray-600 mb-4">The requested course could not be found.</p>
          <Button onClick={() => router.push('/admin/courses')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Courses
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(formData.status);

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
                  <h1 className="text-2xl font-bold">Edit Course</h1>
                  <p className="text-gray-600 text-sm">{course.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Course Details</h2>
              <p className="text-gray-600 text-sm mt-1">
                Update course information and status
              </p>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              {/* Course Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Course Name *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              {/* Course Description */}
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Enter course description..."
                />
              </div>

              {/* Exam Type and Language */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Exam Type *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.exam_type}
                    onChange={(e) => setFormData({...formData, exam_type: e.target.value})}
                  >
                    <option value="competitive">Competitive Exam</option>
                    <option value="academic">Academic</option>
                    <option value="professional">Professional Certification</option>
                    <option value="certification">Government Certification</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Default Language *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.default_language}
                    onChange={(e) => setFormData({...formData, default_language: e.target.value})}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Course Status - This is the key field */}
              <div>
                <label className="block text-sm font-medium mb-2">Course Status *</label>
                <select
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as 'draft' | 'active' | 'archived'})}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                
                {/* Status Information */}
                <div className={`mt-3 p-4 border rounded-md ${statusInfo.color}`}>
                  <div className="flex items-start space-x-2">
                    {statusInfo.icon}
                    <div>
                      <h4 className="font-medium text-sm">
                        Status: {formData.status.charAt(0).toUpperCase() + formData.status.slice(1)}
                      </h4>
                      <p className="text-sm mt-1 opacity-90">
                        {statusInfo.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-gray-500">
                  Last updated: {new Date(course.updated_at).toLocaleString()}
                </div>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}