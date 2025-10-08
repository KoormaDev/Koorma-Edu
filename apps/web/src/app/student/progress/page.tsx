'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
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
  Activity
} from 'lucide-react';

interface ProgressData {
  totalExams: number;
  completedExams: number;
  averageScore: number;
  passRate: number;
  totalStudyTime: number;
  totalLoginTime: number;
  pageTimeBreakdown?: {
    material_time_minutes: number;
    ai_tutor_time_minutes: number;
    past_paper_time_minutes: number;
    exam_time_minutes: number;
  };
  pageTimePercentages?: {
    material: number;
    ai_tutor: number;
    past_paper: number;
    exam: number;
  };
  streak: number;
  recentExams: Array<{
    id: string;
    title: string;
    score: number;
    percentage: number;
    passed: boolean;
    completedAt: string;
  }>;
  subjectProgress: Array<{
    subject: string;
    totalExams: number;
    completedExams: number;
    averageScore: number;
  }>;
  courseProgress: Array<{
    course_id: string;
    course_name: string;
    exam_type: string;
    total_materials: number;
    completed_materials: number;
    completion_percentage: number;
    time_spent_minutes: number;
  }>;
}

export default function StudentProgressPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      setIsLoading(true);

      console.log("Progress page - Starting data fetch");

      // Get student's submissions, exams data, page tracking summary, and course progress
      const [submissions, exams, pageTracking, coursesProgress] = await Promise.all([
        apiClient.getMySubmissions().catch(() => []),
        apiClient.getMockExams().catch(() => []),
        apiClient.getPageTrackingSummary().catch(() => ({
          total_learning_time_minutes: 0,
          breakdown: {
            material_time_minutes: 0,
            ai_tutor_time_minutes: 0,
            past_paper_time_minutes: 0,
            exam_time_minutes: 0
          },
          percentages: {}
        })),
        apiClient.getAllCoursesProgress().catch(() => ({ courses: [], overall: {} }))
      ]);
      
      console.log("Progress page - Initial data:", {
        submissions: submissions?.length || 0,
        exams: exams?.length || 0
      });
      
      // Handle different possible submission statuses
      const completedSubmissions = submissions.filter((sub: any) => 
        sub.status === 'submitted' || sub.status === 'completed' || sub.status === 'evaluated'
      );
      
      console.log("Progress page - Processing", completedSubmissions.length, "completed submissions");
      
      // Enhance submissions with detailed results and proper exam names
      const enhancedSubmissions = [];
      for (const sub of completedSubmissions.slice(0, 5)) {
        console.log(`Progress page - Processing submission ${sub.id}`);
        
        // Find the exam details by matching mock_exam_id
        const exam = exams.find((e: any) => e.id === sub.mock_exam_id);
        const examTitle = exam?.title || 'Unknown Exam';
        
        try {
          // Get detailed results for accurate scoring
          const detailedResults = await apiClient.getDetailedSubmissionResults(sub.id);
          console.log(`Progress page - Got detailed results for ${sub.id}:`, detailedResults);
          
          // Use detailed results with proper null checking for 0 values
          const finalScore = detailedResults.total_score !== undefined && detailedResults.total_score !== null ? detailedResults.total_score : sub.total_score;
          const finalPercentage = detailedResults.percentage_score !== undefined && detailedResults.percentage_score !== null ? detailedResults.percentage_score : sub.percentage_score;
          const finalPassed = detailedResults.passed !== undefined ? detailedResults.passed : sub.passed;
          
          console.log(`Progress page - Final data for ${examTitle}:`, {
            originalScore: sub.percentage_score,
            detailedScore: detailedResults.percentage_score,
            finalScore: finalScore,
            finalPercentage: finalPercentage,
            passed: finalPassed
          });
          
          enhancedSubmissions.push({
            id: sub.id,
            title: examTitle,
            score: finalScore !== undefined && finalScore !== null ? finalScore : 0,
            percentage: finalPercentage !== undefined && finalPercentage !== null ? finalPercentage : 0,
            passed: finalPassed !== undefined ? finalPassed : false,
            completedAt: sub.submitted_at
          });
          
        } catch (detailError) {
          console.warn(`Progress page - Could not get detailed results for ${sub.id}:`, detailError);
          // Fall back to basic submission data with proper null checking
          enhancedSubmissions.push({
            id: sub.id,
            title: examTitle,
            score: sub.total_score !== undefined && sub.total_score !== null ? sub.total_score : 0,
            percentage: sub.percentage_score !== undefined && sub.percentage_score !== null ? sub.percentage_score : 0,
            passed: sub.passed !== undefined ? sub.passed : false,
            completedAt: sub.submitted_at
          });
        }
      }
      
      // Calculate statistics using enhanced submissions for accuracy
      const enhancedCompletedSubmissions = [];
      for (const sub of completedSubmissions) {
        try {
          const detailedResults = await apiClient.getDetailedSubmissionResults(sub.id);
          enhancedCompletedSubmissions.push({
            ...sub,
            percentage_score: detailedResults.percentage_score !== undefined && detailedResults.percentage_score !== null ? detailedResults.percentage_score : sub.percentage_score,
            passed: detailedResults.passed !== undefined ? detailedResults.passed : sub.passed
          });
        } catch {
          enhancedCompletedSubmissions.push(sub);
        }
      }
      
      const passedSubmissions = enhancedCompletedSubmissions.filter((sub: any) => sub.passed);
      
      const progressData: ProgressData = {
        totalExams: exams.length,
        completedExams: completedSubmissions.length,
        averageScore: enhancedCompletedSubmissions.length > 0
          ? enhancedCompletedSubmissions.reduce((acc: number, sub: any) => {
            const score = sub.percentage_score !== undefined && sub.percentage_score !== null ? sub.percentage_score : 0;
            return acc + score;
          }, 0) / enhancedCompletedSubmissions.length
          : 0,
        passRate: enhancedCompletedSubmissions.length > 0 ? (passedSubmissions.length / enhancedCompletedSubmissions.length) * 100 : 0,
        totalStudyTime: completedSubmissions.reduce((acc: number, sub: any) => acc + (sub.time_spent_minutes || 0), 0),
        totalLoginTime: pageTracking.total_learning_time_minutes || 0,
        pageTimeBreakdown: pageTracking.breakdown || {},
        pageTimePercentages: pageTracking.percentages || {},
        streak: 7, // Default streak
        recentExams: enhancedSubmissions,
        subjectProgress: [], // To be implemented based on course data
        courseProgress: coursesProgress.courses || []
      };
      
      console.log("Progress page - Final progress data:", progressData);
      setProgress(progressData);
      
    } catch (err: any) {
      console.error("Progress page - Error:", err);
      setError(err.message || 'Failed to load progress data');
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

  if (error || !progress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl text-red-600 mb-4">{error || 'Failed to load progress'}</p>
        <Button onClick={() => router.push('/student')}>
          Back to Dashboard
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
            onClick={() => router.push('/student')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">My Progress</h1>
          <p className="text-gray-600 mt-2">Track your learning journey and achievements</p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <Target className="h-10 w-10 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Exams Completed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {progress.completedExams}/{progress.totalExams}
                </p>
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
                <p className="text-sm font-medium text-gray-600">Total Learning Time</p>
                <p className="text-2xl font-bold text-gray-900">{formatTime(progress.totalLoginTime)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance Overview</h3>
          
          <div className="space-y-6">
            {/* Completion Rate */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Exam Completion</span>
                <span className="text-sm text-gray-500">
                  {progress.completedExams} of {progress.totalExams} completed
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-500 h-3 rounded-full" 
                  style={{ width: `${(progress.completedExams / Math.max(progress.totalExams, 1)) * 100}%` }}
                />
              </div>
            </div>

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
          </div>
        </div>

        {/* Page Time Breakdown */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Learning Time Breakdown</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-3xl mb-2">📚</div>
              <p className="text-sm text-gray-600">Study Materials</p>
              <p className="text-xl font-bold">{formatTime(progress.pageTimeBreakdown?.material_time_minutes || 0)}</p>
              <p className="text-xs text-gray-500">{progress.pageTimePercentages?.material || 0}%</p>
            </div>

            <div className="text-center">
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm text-gray-600">AI Tutor</p>
              <p className="text-xl font-bold">{formatTime(progress.pageTimeBreakdown?.ai_tutor_time_minutes || 0)}</p>
              <p className="text-xs text-gray-500">{progress.pageTimePercentages?.ai_tutor || 0}%</p>
            </div>

            <div className="text-center">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-sm text-gray-600">Past Papers</p>
              <p className="text-xl font-bold">{formatTime(progress.pageTimeBreakdown?.past_paper_time_minutes || 0)}</p>
              <p className="text-xs text-gray-500">{progress.pageTimePercentages?.past_paper || 0}%</p>
            </div>

            <div className="text-center">
              <div className="text-3xl mb-2">✍️</div>
              <p className="text-sm text-gray-600">Exams</p>
              <p className="text-xl font-bold">{formatTime(progress.pageTimeBreakdown?.exam_time_minutes || 0)}</p>
              <p className="text-xs text-gray-500">{progress.pageTimePercentages?.exam || 0}%</p>
            </div>
          </div>

          {/* Visual Progress Bars */}
          <div className="space-y-3">
            {progress.pageTimeBreakdown?.material_time_minutes > 0 && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">Study Materials</span>
                  <span className="text-sm text-gray-500">{formatTime(progress.pageTimeBreakdown.material_time_minutes)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${progress.pageTimePercentages?.material || 0}%` }} />
                </div>
              </div>
            )}

            {progress.pageTimeBreakdown?.ai_tutor_time_minutes > 0 && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">AI Tutor</span>
                  <span className="text-sm text-gray-500">{formatTime(progress.pageTimeBreakdown.ai_tutor_time_minutes)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${progress.pageTimePercentages?.ai_tutor || 0}%` }} />
                </div>
              </div>
            )}

            {progress.pageTimeBreakdown?.past_paper_time_minutes > 0 && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">Past Papers</span>
                  <span className="text-sm text-gray-500">{formatTime(progress.pageTimeBreakdown.past_paper_time_minutes)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${progress.pageTimePercentages?.past_paper || 0}%` }} />
                </div>
              </div>
            )}

            {progress.pageTimeBreakdown?.exam_time_minutes > 0 && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">Exams</span>
                  <span className="text-sm text-gray-500">{formatTime(progress.pageTimeBreakdown.exam_time_minutes)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${progress.pageTimePercentages?.exam || 0}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Course Progress */}
        {progress.courseProgress && progress.courseProgress.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Course Progress</h3>

            <div className="space-y-4">
              {progress.courseProgress.map((course) => (
                <div key={course.course_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">{course.course_name}</h4>
                      <p className="text-sm text-gray-500">
                        {course.exam_type} • {course.completed_materials} of {course.total_materials} materials completed
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-blue-600">
                        {course.completion_percentage.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTime(course.time_spent_minutes)}
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${course.completion_percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Exams */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Exam Results</h3>
          
          {progress.recentExams.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No exams completed yet</p>
              <p className="text-sm">Start taking exams to see your progress here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {progress.recentExams.map((exam) => (
                <div key={exam.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {exam.passed ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-500" />
                      )}
                      <div>
                        <h4 className="font-medium text-gray-900">{exam.title}</h4>
                        <p className="text-sm text-gray-500">
                          Completed on {formatDate(exam.completedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${
                        exam.passed ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {exam.percentage.toFixed(1)}%
                      </p>
                      <p className="text-sm text-gray-500">
                        {exam.score} marks
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
            onClick={() => router.push('/student/exams')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Target className="h-4 w-4 mr-2" />
            Take More Exams
          </Button>
          <Button
            onClick={() => router.push('/student/courses')}
            variant="outline"
          >
            <Award className="h-4 w-4 mr-2" />
            View Courses
          </Button>
        </div>
      </div>
    </div>
  );
}