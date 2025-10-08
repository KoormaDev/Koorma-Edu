"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft,
  FileText,
  Plus,
  Edit,
  Trash2,
  Clock,
  Users,
  CheckCircle,
  Pause
} from "lucide-react";

interface MockExam {
  id: string;
  title: string;
  description: string;
  course_id: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  max_retakes: number;
  status: string;
  created_at: string;
  total_questions: number;
}

interface Course {
  id: string;
  name: string;
}

export default function ExamManagement() {
  const router = useRouter();
  const [exams, setExams] = useState<MockExam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newExam, setNewExam] = useState({
    title: "",
    description: "",
    course_id: "",
    duration_minutes: 60,
    total_marks: 100,
    passing_marks: 40,
    max_retakes: 3
  });

  useEffect(() => {
    fetchExams();
    fetchCourses();
  }, []);

  const fetchExams = async () => {
    try {
      const data = await apiClient.getMockExams();
      setExams(data);
    } catch (error) {
      console.error("Failed to fetch exams:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const data = await apiClient.getCourses();
      setCourses(data);
    } catch (error) {
      console.error("Failed to fetch courses:", error);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.createMockExam(newExam);
      setShowCreateForm(false);
      setNewExam({
        title: "",
        description: "",
        course_id: "",
        duration_minutes: 60,
        total_marks: 100,
        passing_marks: 40,
        max_retakes: 3
      });
      fetchExams();
    } catch (error) {
      console.error("Failed to create exam:", error);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (confirm("Are you sure you want to delete this exam?")) {
      try {
        await apiClient.delete(`/assessments/exams/${examId}`);
        fetchExams();
      } catch (error) {
        console.error("Failed to delete exam:", error);
      }
    }
  };

  const handlePublishExam = async (examId: string) => {
    try {
      await apiClient.put(`/assessments/exams/${examId}`, { status: 'published' });
      fetchExams();
    } catch (error) {
      console.error("Failed to publish exam:", error);
    }
  };

  const handleUnpublishExam = async (examId: string) => {
    try {
      await apiClient.put(`/assessments/exams/${examId}`, { status: 'draft' });
      fetchExams();
    } catch (error) {
      console.error("Failed to unpublish exam:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading exams...</p>
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
                <FileText className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Exam Management</h1>
              </div>
            </div>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Exam
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Exam</h2>
            <form onSubmit={handleCreateExam} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newExam.title}
                    onChange={(e) => setNewExam({...newExam, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Course</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newExam.course_id}
                    onChange={(e) => setNewExam({...newExam, course_id: e.target.value})}
                  >
                    <option value="">Select a course</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newExam.description}
                  onChange={(e) => setNewExam({...newExam, description: e.target.value})}
                />
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newExam.duration_minutes}
                    onChange={(e) => setNewExam({...newExam, duration_minutes: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Total Marks</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newExam.total_marks}
                    onChange={(e) => setNewExam({...newExam, total_marks: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Passing Marks</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newExam.passing_marks}
                    onChange={(e) => setNewExam({...newExam, passing_marks: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Retakes</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newExam.max_retakes}
                    onChange={(e) => setNewExam({...newExam, max_retakes: parseInt(e.target.value)})}
                    title="Maximum number of retakes allowed (0 = no retakes)"
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <Button type="submit">Create Exam</Button>
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

        {/* Exams List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">All Exams ({exams.length})</h2>
          </div>
          
          {exams.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No exams found. Create your first exam to get started.</p>
            </div>
          ) : (
            <div className="divide-y">
              {exams.map((exam) => {
                const course = courses.find(c => c.id === exam.course_id);
                return (
                  <div key={exam.id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-medium">{exam.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            exam.status === 'published'
                              ? 'bg-green-100 text-green-800' 
                              : exam.status === 'draft'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {exam.status === 'published' ? 'Published' : 
                             exam.status === 'draft' ? 'Draft' : 'Archived'}
                          </span>
                        </div>
                        <p className="text-gray-600 mt-1">{exam.description}</p>
                        <div className="flex items-center space-x-6 mt-2 text-sm text-gray-500">
                          <span className="font-medium text-blue-600">
                            {course?.name || 'Unknown Course'}
                          </span>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {exam.duration_minutes} min
                          </div>
                          <div className="flex items-center">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {exam.total_questions || 0} questions
                          </div>
                          <span>
                            {exam.total_marks} marks (Pass: {exam.passing_marks})
                          </span>
                          <span>
                            Max retakes: {exam.max_retakes}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/admin/exams/${exam.id}/questions`)}
                        >
                          Manage Questions
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/admin/exams/${exam.id}/results`)}
                        >
                          <Users className="h-4 w-4 mr-1" />
                          Results
                        </Button>
                        {exam.status === 'draft' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePublishExam(exam.id)}
                            className="text-green-600 border-green-600 hover:bg-green-50"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Publish
                          </Button>
                        ) : exam.status === 'published' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnpublishExam(exam.id)}
                            className="text-yellow-600 border-yellow-600 hover:bg-yellow-50"
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            Unpublish
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteExam(exam.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}