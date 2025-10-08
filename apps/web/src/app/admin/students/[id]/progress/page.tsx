'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  User, 
  TrendingUp, 
  Trophy, 
  Target, 
  Clock, 
  BarChart3,
  Calendar,
  CheckCircle,
  XCircle,
  Award,
  Star,
  Activity,
  Mail,
  GraduationCap
} from 'lucide-react';

interface StudentDetails {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: string;
  created_at: string;
}

interface StudentProgress {
  totalExams: number;
  completedExams: number;
  averageScore: number;
  passRate: number;
  totalStudyTime: number;
  enrolledCourses: number;
  submissions: Array<{
    id: string;
    exam_title: string;
    course_name: string;
    score: number;
    percentage: number;
    passed: boolean;
    submitted_at: string;
    time_spent_minutes: number;
  }>;
}

export default function StudentProgressPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudentData();
  }, [params.id]);

  const fetchStudentData = async () => {
    try {
      setIsLoading(true);
      
      // Get student details
      const studentData = await apiClient.get(`/auth/users/${params.id}`);
      setStudent(studentData);
      
      // Get student's submissions, enrollments, and learning time data
      const submissions = await apiClient.getStudentSubmissions(params.id);
      const enrollments = await apiClient.getStudentEnrollments(params.id);
      const pageTracking = await apiClient.getStudentPageTrackingSummary(params.id).catch(() => ({
        total_learning_time_minutes: 0,
        breakdown: {},
        percentages: {}
      }));
      
      const completedSubmissions = submissions.filter((sub: any) => sub.status === 'submitted');
      const passedSubmissions = completedSubmissions.filter((sub: any) => sub.passed);
      
      const progressData: StudentProgress = {
        totalExams: submissions.length,
        completedExams: completedSubmissions.length,
        averageScore: completedSubmissions.length > 0 
          ? completedSubmissions.reduce((acc: number, sub: any) => acc + (sub.percentage_score || 0), 0) / completedSubmissions.length 
          : 0,
        passRate: completedSubmissions.length > 0 ? (passedSubmissions.length / completedSubmissions.length) * 100 : 0,
        totalStudyTime: pageTracking.total_learning_time_minutes || 0,
        enrolledCourses: enrollments.length,
        submissions: completedSubmissions.slice(0, 10).map((sub: any) => ({
          id: sub.id,
          exam_title: sub.exam_title || 'Unknown Exam',
          course_name: sub.course_name || 'Unknown Course',
          score: sub.total_score || 0,
          percentage: sub.percentage_score || 0,
          passed: sub.passed || false,
          submitted_at: sub.submitted_at,
          time_spent_minutes: sub.time_spent_minutes || 0
        }))
      };
      
      setProgress(progressData);
    } catch (err: any) {
      setError(err.message || 'Failed to load student data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !student || !progress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl text-red-600 mb-4">{error || 'Failed to load student data'}</p>
        <Button onClick={() => router.push('/admin/students')}>
          Back to Students
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={() => router.push('/admin/students')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Students
          </Button>
          
          {/* Student Info */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{student.full_name}</h1>
                <div className="flex items-center space-x-4 mt-2 text-gray-600">
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 mr-1" />
                    <span>{student.email}</span>
                  </div>
                  <div className="flex items-center">
                    <GraduationCap className="h-4 w-4 mr-1" />
                    <span className="capitalize">{student.role}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    <span>Joined {formatDate(student.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <Target className="h-10 w-10 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Exams Completed</p>
                <p className="text-2xl font-bold text-gray-900">{progress.completedExams}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <Trophy className="h-10 w-10 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Score</p>
                <p className="text-2xl font-bold text-gray-900">{progress.averageScore.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pass Rate</p>
                <p className="text-2xl font-bold text-gray-900">{progress.passRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <Clock className="h-10 w-10 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Study Time</p>
                <p className="text-2xl font-bold text-gray-900">{formatTime(progress.totalStudyTime)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance Overview</h3>
          
          <div className="space-y-6">
            {/* Average Score */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Average Score</span>
                <span className="text-sm text-gray-500">{progress.averageScore.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-500 h-3 rounded-full" 
                  style={{ width: `${progress.averageScore}%` }}
                />
              </div>
            </div>

            {/* Pass Rate */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Pass Rate</span>
                <span className="text-sm text-gray-500">{progress.passRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-yellow-500 h-3 rounded-full" 
                  style={{ width: `${progress.passRate}%` }}
                />
              </div>
            </div>

            {/* Activity Level */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Activity Level</span>
                <span className="text-sm text-gray-500">{progress.completedExams} exams completed</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-500 h-3 rounded-full" 
                  style={{ width: `${Math.min((progress.completedExams / 10) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Submissions */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Exam Results</h3>
          
          {progress.submissions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No exam submissions yet</p>
              <p className="text-sm">Student hasn't completed any exams</p>
            </div>
          ) : (
            <div className="space-y-4">
              {progress.submissions.map((submission) => (
                <div key={submission.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {submission.passed ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-500" />
                      )}
                      <div>
                        <h4 className="font-medium text-gray-900">{submission.exam_title}</h4>
                        <p className="text-sm text-gray-500">
                          {submission.course_name} • Completed on {formatDate(submission.submitted_at)}
                        </p>
                        <p className="text-xs text-gray-400">
                          Time spent: {formatTime(submission.time_spent_minutes)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${
                        submission.passed ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {submission.percentage.toFixed(1)}%
                      </p>
                      <p className="text-sm text-gray-500">
                        {submission.score} marks
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-center space-x-4">
          <Button
            onClick={() => router.push('/admin/students')}
            variant="outline"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Students
          </Button>
          <Button
            onClick={() => window.open(`mailto:${student.email}`, '_blank')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Mail className="h-4 w-4 mr-2" />
            Send Email
          </Button>
        </div>
      </div>
    </div>
  );
}