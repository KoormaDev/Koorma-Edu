'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Users, 
  Trophy, 
  TrendingUp, 
  Clock, 
  Target,
  CheckCircle,
  XCircle,
  BarChart3,
  Download,
  RefreshCw
} from 'lucide-react';

interface Submission {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  started_at: string;
  submitted_at: string;
  total_score: number;
  percentage_score: number;
  passed: boolean;
  status: string;
  time_spent_minutes?: number;
}

interface ExamStats {
  total_submissions: number;
  completed_submissions: number;
  pass_rate: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  average_time: number;
}

export default function AdminExamResultsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [examStats, setExamStats] = useState<ExamStats | null>(null);
  const [examTitle, setExamTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchExamResults();
  }, [params.id]);

  const fetchExamResults = async () => {
    try {
      setIsLoading(true);
      
      // Get exam details
      const examData = await apiClient.getMockExam(params.id);
      setExamTitle(examData.title);
      
      // Get submissions for this exam
      const submissionsData = await apiClient.getExamSubmissions(params.id);
      setSubmissions(submissionsData);
      
      // Calculate stats
      const completedSubmissions = submissionsData.filter((s: Submission) => s.status === 'submitted');
      const passedSubmissions = completedSubmissions.filter((s: Submission) => s.passed);
      
      const stats: ExamStats = {
        total_submissions: submissionsData.length,
        completed_submissions: completedSubmissions.length,
        pass_rate: completedSubmissions.length > 0 ? (passedSubmissions.length / completedSubmissions.length) * 100 : 0,
        average_score: completedSubmissions.length > 0 
          ? completedSubmissions.reduce((acc, s) => acc + s.percentage_score, 0) / completedSubmissions.length 
          : 0,
        highest_score: completedSubmissions.length > 0 
          ? Math.max(...completedSubmissions.map(s => s.percentage_score)) 
          : 0,
        lowest_score: completedSubmissions.length > 0 
          ? Math.min(...completedSubmissions.map(s => s.percentage_score)) 
          : 0,
        average_time: completedSubmissions.length > 0
          ? completedSubmissions
              .filter(s => s.time_spent_minutes)
              .reduce((acc, s) => acc + (s.time_spent_minutes || 0), 0) / 
            completedSubmissions.filter(s => s.time_spent_minutes).length
          : 0
      };
      
      setExamStats(stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load exam results');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReEvaluate = async (submissionId: string) => {
    try {
      await apiClient.reEvaluateSubmission(submissionId);
      fetchExamResults(); // Refresh data
    } catch (err: any) {
      console.error('Failed to re-evaluate:', err);
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl text-red-600 mb-4">{error}</p>
        <Button onClick={() => router.push('/admin/exams')}>
          Back to Exams
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
            onClick={() => router.push('/admin/exams')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Exams
          </Button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Exam Results</h1>
              <p className="text-gray-600 mt-2">{examTitle}</p>
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={fetchExamResults}
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        {examStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center">
                <Users className="h-10 w-10 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Submissions</p>
                  <p className="text-2xl font-bold text-gray-900">{examStats.total_submissions}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center">
                <Trophy className="h-10 w-10 text-yellow-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pass Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{examStats.pass_rate.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center">
                <TrendingUp className="h-10 w-10 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Average Score</p>
                  <p className="text-2xl font-bold text-gray-900">{examStats.average_score.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center">
                <Clock className="h-10 w-10 text-purple-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg. Time</p>
                  <p className="text-2xl font-bold text-gray-900">{formatTime(examStats.average_time)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Score Distribution */}
        {examStats && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Highest Score</p>
                <p className="text-2xl font-bold text-green-600">{examStats.highest_score.toFixed(1)}%</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Average Score</p>
                <p className="text-2xl font-bold text-blue-600">{examStats.average_score.toFixed(1)}%</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-gray-600">Lowest Score</p>
                <p className="text-2xl font-bold text-red-600">{examStats.lowest_score.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Submissions Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Student Submissions ({submissions.length})
            </h3>
          </div>
          
          {submissions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No submissions found for this exam yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time Spent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {submissions.map((submission) => (
                    <tr key={submission.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {submission.student_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {submission.student_email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {submission.status === 'submitted' ? (
                            <>
                              {submission.passed ? (
                                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500 mr-2" />
                              )}
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                submission.passed 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {submission.passed ? 'Passed' : 'Failed'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Clock className="h-5 w-5 text-yellow-500 mr-2" />
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                In Progress
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {submission.status === 'submitted' ? (
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {submission.percentage_score?.toFixed(1)}%
                            </div>
                            <div className="text-gray-500">
                              {submission.total_score} marks
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {submission.time_spent_minutes ? formatTime(submission.time_spent_minutes) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {submission.submitted_at ? formatDate(submission.submitted_at) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        {submission.status === 'submitted' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/student/exams/${params.id}/results?submission_id=${submission.id}`)}
                            >
                              View Details
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReEvaluate(submission.id)}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Re-evaluate
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}