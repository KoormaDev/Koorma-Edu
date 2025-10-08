'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, AlertCircle, Trophy, TrendingUp, Clock, Target } from 'lucide-react';

interface ExamResult {
  id: string;
  exam_id: string;
  exam_title: string;
  student_name: string;
  total_questions: number;
  attempted_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  score: number;
  total_marks: number;
  percentage: number;
  passing_marks: number;
  status: 'passed' | 'failed';
  time_taken: number;
  submitted_at: string;
  answers: Array<{
    question_id: string;
    question_text: string;
    given_answer: string;
    correct_answer: string;
    is_correct: boolean;
    points_earned: number;
    max_points: number;
    explanation?: string;
  }>;
}

export default function ExamResultsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetailedResults, setShowDetailedResults] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setIsLoading(true);
        // First get the most recent submission for this exam
        const submissions = await apiClient.getMySubmissions();
        const examSubmission = submissions.find((sub: any) => sub.mock_exam_id === params.id);
        
        if (!examSubmission) {
          throw new Error('No submission found for this exam');
        }

        // Get detailed results using the new evaluation endpoint
        const detailedResults = await apiClient.getDetailedSubmissionResults(examSubmission.id);
        
        console.log("Exam submission data:", examSubmission);
        console.log("Detailed results data:", detailedResults);
        
        // Map to the expected result format
        setResult({
          id: detailedResults.submission_id,
          exam_id: params.id,
          exam_title: detailedResults.exam_title,
          student_name: detailedResults.student_name,
          total_questions: detailedResults.detailed_answers.length,
          attempted_questions: detailedResults.detailed_answers.length,
          correct_answers: detailedResults.detailed_answers.filter((a: any) => a.is_correct).length,
          incorrect_answers: detailedResults.detailed_answers.filter((a: any) => !a.is_correct).length,
          score: detailedResults.total_score,
          total_marks: detailedResults.total_marks,
          percentage: detailedResults.percentage_score,
          passing_marks: (detailedResults.total_marks * 0.6), // Default 60% passing
          status: detailedResults.passed ? 'passed' : 'failed',
          time_taken: detailedResults.time_spent_minutes || 0,
          submitted_at: detailedResults.submitted_at,
          answers: detailedResults.detailed_answers.map((answer: any) => ({
            question_id: answer.question_id,
            question_text: answer.question_text,
            given_answer: answer.student_answer || 'Not answered',
            correct_answer: answer.correct_answer,
            is_correct: answer.is_correct,
            points_earned: answer.marks_awarded,
            max_points: answer.max_marks,
            explanation: answer.explanation || answer.ai_feedback
          }))
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load detailed results');
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-xl text-gray-700">{error || 'Results not available'}</p>
        <Button
          onClick={() => router.push('/student/exams')}
          className="mt-4"
        >
          Back to Exams
        </Button>
      </div>
    );
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins} minutes`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={() => router.push('/student/exams')}
            variant="outline"
            className="mb-4"
          >
            ← Back to Exams
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Exam Results</h1>
          <p className="text-gray-600 mt-2">{result.exam_title}</p>
        </div>

        {/* Result Summary Card */}
        <div className={`bg-white rounded-xl shadow-lg overflow-hidden mb-8 ${
          result.status === 'passed' ? 'border-t-4 border-green-500' : 'border-t-4 border-red-500'
        }`}>
          <div className="p-8">
            {/* Pass/Fail Status */}
            <div className="text-center mb-8">
              {result.status === 'passed' ? (
                <div className="inline-flex flex-col items-center">
                  <Trophy className="h-16 w-16 text-yellow-500 mb-4" />
                  <h2 className="text-3xl font-bold text-green-600">Congratulations!</h2>
                  <p className="text-gray-600 mt-2">You have passed the exam</p>
                </div>
              ) : (
                <div className="inline-flex flex-col items-center">
                  <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                  <h2 className="text-3xl font-bold text-red-600">Keep Trying!</h2>
                  <p className="text-gray-600 mt-2">You need more practice</p>
                </div>
              )}
            </div>

            {/* Score Display */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-8 border-blue-100">
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">{result.percentage}%</p>
                  <p className="text-sm text-gray-500">Score</p>
                </div>
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Target className="h-5 w-5 text-blue-500 mr-2" />
                  <span className="text-sm text-gray-600">Total Questions</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{result.total_questions}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-600">Correct Answers</span>
                </div>
                <p className="text-2xl font-semibold text-green-600">{result.correct_answers}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <XCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span className="text-sm text-gray-600">Incorrect Answers</span>
                </div>
                <p className="text-2xl font-semibold text-red-600">{result.incorrect_answers}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Clock className="h-5 w-5 text-purple-500 mr-2" />
                  <span className="text-sm text-gray-600">Time Taken</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{formatTime(result.time_taken)}</p>
              </div>
            </div>

            {/* Marks Information */}
            <div className="bg-blue-50 rounded-lg p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Your Score</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {result.score} / {result.total_marks}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Passing Marks</p>
                  <p className="text-2xl font-bold text-gray-900">{result.passing_marks}</p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-3 relative">
                  <div
                    className={`h-3 rounded-full ${
                      result.status === 'passed' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${result.percentage}%` }}
                  />
                  <div
                    className="absolute top-0 h-3 w-1 bg-gray-700"
                    style={{ left: `${(result.passing_marks / result.total_marks) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>0</span>
                  <span>Passing Mark ({result.passing_marks})</span>
                  <span>{result.total_marks}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">AI Performance Analysis</h3>
          
          {/* Recommendations */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-800 mb-3">📚 Study Recommendations</h4>
            <div className="bg-blue-50 rounded-lg p-4">
              <ul className="space-y-2">
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span className="text-gray-700">Based on your performance, focus on understanding fundamental concepts</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span className="text-gray-700">Practice more questions to improve accuracy</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span className="text-gray-700">Review incorrect answers to understand concepts better</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Performance Insights */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <h4 className="text-lg font-medium text-gray-800 mb-3">💪 Strengths</h4>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-gray-700">
                  {result.percentage >= 80 ? 'Excellent overall performance' :
                   result.percentage >= 60 ? 'Good grasp of basic concepts' :
                   'Shows understanding of some key topics'}
                </p>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-medium text-gray-800 mb-3">🎯 Areas for Improvement</h4>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-gray-700">
                  {result.percentage < 50 ? 'Focus on fundamental concepts and basic understanding' :
                   result.percentage < 70 ? 'Work on accuracy and detailed understanding' :
                   'Maintain current level and focus on advanced topics'}
                </p>
              </div>
            </div>
          </div>

          {/* Study Time Suggestion */}
          <div className="bg-purple-50 rounded-lg p-4">
            <h4 className="text-lg font-medium text-purple-800 mb-2">⏰ Study Plan Suggestion</h4>
            <p className="text-purple-700">
              {result.percentage >= 80 ? 'Maintain current study routine. Focus on advanced topics.' :
               result.percentage >= 60 ? 'Increase study time by 20-30%. Review weak areas daily.' :
               'Significantly increase study time. Consider structured revision plan.'}
            </p>
          </div>
        </div>

        {/* Detailed Results */}
        {result.answers && result.answers.length > 0 && (
          <div id="detailed-results" className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Question-by-Question Analysis</h3>
              <Button
                onClick={() => setShowDetailedResults(!showDetailedResults)}
                variant="outline"
              >
                {showDetailedResults ? 'Hide Details' : 'Show Details'}
              </Button>
            </div>

            {showDetailedResults && (
              <div className="space-y-4">
                {result.answers.map((answer, index) => (
                  <div
                    key={answer.question_id}
                    className={`border rounded-lg p-4 ${
                      answer.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-start">
                        <span className="font-semibold mr-2">Q{index + 1}.</span>
                        <p className="text-gray-700">{answer.question_text}</p>
                      </div>
                      <div className="flex items-center">
                        {answer.is_correct ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <span className="ml-2 text-sm font-semibold">
                          {answer.points_earned}/{answer.max_points}
                        </span>
                      </div>
                    </div>
                    
                    <div className="ml-6 space-y-2">
                      <div>
                        <span className="text-sm text-gray-600">Your Answer: </span>
                        <span className={`text-sm font-medium ${
                          answer.is_correct ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {answer.given_answer || 'Not answered'}
                        </span>
                      </div>
                      
                      {!answer.is_correct && (
                        <div>
                          <span className="text-sm text-gray-600">Correct Answer: </span>
                          <span className="text-sm font-medium text-green-700">
                            {answer.correct_answer}
                          </span>
                        </div>
                      )}
                      
                      {answer.explanation && (
                        <div className="mt-2 p-3 bg-blue-50 rounded-md">
                          <p className="text-sm text-blue-800">
                            <strong>Explanation:</strong> {answer.explanation}
                          </p>
                        </div>
                      )}
                      
                      {/* AI Feedback if available */}
                      {!answer.is_correct && (
                        <div className="mt-2 p-3 bg-purple-50 rounded-md">
                          <p className="text-sm text-purple-800">
                            <strong>💡 AI Tip:</strong> {
                              answer.explanation ? 
                              "Review the explanation above and practice similar questions to improve understanding." :
                              "Focus on this concept area and try similar practice questions."
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex justify-center space-x-4">
          <Button
            onClick={() => router.push('/student/exams')}
            variant="outline"
          >
            Back to Exams
          </Button>
          {result.status === 'failed' && (
            <Button
              onClick={() => router.push(`/student/exams/${params.id}/take`)}
              className="bg-green-600 hover:bg-green-700"
            >
              Retake Exam
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}