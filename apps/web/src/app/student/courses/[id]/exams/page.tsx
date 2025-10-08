'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { usePageTimeTracking } from '../../../../../hooks/usePageTimeTracking';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Calendar,
  Trophy,
  Target,
  Play
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
}

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  passing_marks: number;
  passing_score?: number; // Calculated field
  max_retakes: number;    // Maximum retakes allowed from database
  is_active?: boolean;    // Optional since it might be undefined
  created_at: string;
  attempts_used?: number;
  best_score?: number;
  last_attempt_date?: string;
  status?: 'not_started' | 'in_progress' | 'completed' | 'passed' | 'failed';
}

export default function CourseExamsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);

  // Track time on exam page
  usePageTimeTracking({
    pageType: 'exam'
  });
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch course data
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);

      // Fetch exams for this course and actual submissions
      const [examsData, submissionsData] = await Promise.all([
        apiClient.getMockExams({ course_id: params.id, is_active: true }),
        apiClient.getMySubmissions({ course_id: params.id }).catch(() => [])
      ]);
      
      console.log("Course exams page - Data fetched:", {
        exams: examsData?.length || 0,
        submissions: submissionsData?.length || 0,
        firstExam: examsData?.[0] ? {
          title: examsData[0].title,
          total_marks: examsData[0].total_marks,
          passing_marks: examsData[0].passing_marks,
          passing_score: examsData[0].passing_score,
          keys: Object.keys(examsData[0])
        } : null
      });
      
      // Enhance exams with real submission data instead of mock data
      const enhancedExams = examsData.map((exam: Exam) => {
        // Find all submissions for this exam
        const examSubmissions = submissionsData.filter((sub: any) => sub.mock_exam_id === exam.id);
        
        // Calculate real data from actual submissions
        const attempts_used = examSubmissions.length;
        const completedSubmissions = examSubmissions.filter((sub: any) => 
          ['submitted', 'completed', 'evaluated', 'graded'].includes(sub.status)
        );
        
        let best_score = undefined;
        let last_attempt_date = undefined;
        let status = 'not_started';
        
        if (completedSubmissions.length > 0) {
          // Find best score from completed submissions
          best_score = Math.max(...completedSubmissions.map((sub: any) => sub.percentage_score || 0));
          
          // Get last attempt date
          const sortedSubmissions = completedSubmissions.sort((a: any, b: any) => 
            new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
          );
          last_attempt_date = sortedSubmissions[0].submitted_at;
          status = 'completed';
        } else if (attempts_used > 0) {
          status = 'in_progress';
        }
        
        // Calculate passing score percentage
        const passing_score = exam.total_marks && exam.passing_marks
          ? Math.round((exam.passing_marks / exam.total_marks) * 100)
          : 60; // Default to 60% if data is missing

        console.log(`Course exams page - Enhanced exam ${exam.id}:`, {
          title: exam.title,
          total_marks: exam.total_marks,
          passing_marks: exam.passing_marks,
          passing_score,
          attempts_used,
          best_score,
          last_attempt_date,
          status
        });

        return {
          ...exam,
          passing_score,
          attempts_used,
          best_score,
          last_attempt_date,
          status
        };
      });

      setExams(enhancedExams);

    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getExamStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'passed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'in_progress':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getExamStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'passed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canTakeExam = (exam: Exam) => {
    const isActive = exam.is_active !== false; // Default to true if undefined
    const attemptsUsed = exam.attempts_used || 0;
    const maxRetakes = exam.max_retakes || 0; // Use actual max_retakes from database
    const maxAttemptsAllowed = maxRetakes + 1; // +1 for the initial attempt

    console.log(`canTakeExam for ${exam.title}:`, {
      isActive,
      attemptsUsed,
      maxRetakes,
      maxAttemptsAllowed,
      result: isActive && attemptsUsed < maxAttemptsAllowed
    });

    return isActive && attemptsUsed < maxAttemptsAllowed;
  };

  const handleTakeExam = (examId: string) => {
    router.push(`/student/exams/${examId}/take`);
  };

  const handleViewResults = (examId: string) => {
    router.push(`/student/exams/${examId}/results`);
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
                Back to Courses
              </Button>
              <div className="flex items-center space-x-2">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Course Exams</h1>
                  <p className="text-gray-600">{course?.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-gray-600">Total Exams</p>
            </div>
            <p className="text-2xl font-semibold">{exams.length}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm text-gray-600">Completed</p>
            </div>
            <p className="text-2xl font-semibold text-green-600">
              {exams.filter(e => e.status === 'completed').length}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <Trophy className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-gray-600">Best Score</p>
            </div>
            <p className="text-2xl font-semibold text-yellow-600">
              {Math.max(...exams.map(e => e.best_score || 0))}%
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-purple-600" />
              <p className="text-sm text-gray-600">Pending</p>
            </div>
            <p className="text-2xl font-semibold text-purple-600">
              {exams.filter(e => e.status === 'not_started').length}
            </p>
          </div>
        </div>

        {/* Exams List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Available Exams</h2>
          </div>
          
          {exams.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Exams Available</h3>
              <p>There are no exams available for this course yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {exams.map((exam) => (
                <div key={exam.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold">{exam.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center ${getExamStatusColor(exam.status || 'not_started')}`}>
                          {getExamStatusIcon(exam.status || 'not_started')}
                          <span className="ml-1">
                            {exam.status === 'completed' ? 'Completed' :
                             exam.status === 'passed' ? 'Passed' :
                             exam.status === 'failed' ? 'Failed' :
                             exam.status === 'in_progress' ? 'In Progress' :
                             'Not Started'}
                          </span>
                        </span>
                      </div>
                      
                      <p className="text-gray-600 mb-3">{exam.description}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <span>{exam.duration_minutes} minutes</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span>{exam.total_questions} questions</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Target className="h-4 w-4 text-gray-500" />
                          <span>{exam.passing_score}% to pass</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <AlertCircle className="h-4 w-4 text-gray-500" />
                          <span>{exam.attempts_used || 0}/{(exam.max_retakes || 0) + 1} attempts</span>
                        </div>
                      </div>
                      
                      {exam.best_score !== undefined && (
                        <div className="mt-2">
                          <div className="flex items-center space-x-2 text-sm">
                            <Trophy className="h-4 w-4 text-yellow-600" />
                            <span>Best Score: <strong>{exam.best_score}%</strong></span>
                            {exam.last_attempt_date && (
                              <>
                                <Calendar className="h-4 w-4 text-gray-500 ml-4" />
                                <span>Last attempt: {new Date(exam.last_attempt_date).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      {exam.best_score !== undefined && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewResults(exam.id)}
                        >
                          View Results
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        disabled={!canTakeExam(exam)}
                        onClick={() => handleTakeExam(exam.id)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {!canTakeExam(exam) && (exam.attempts_used || 0) >= ((exam.max_retakes || 0) + 1)
                          ? 'Max retakes reached'
                          : exam.attempts_used
                          ? 'Retake Exam'
                          : 'Start Exam'
                        }
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