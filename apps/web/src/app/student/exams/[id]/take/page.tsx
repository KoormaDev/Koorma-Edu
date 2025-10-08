'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Clock, AlertCircle } from 'lucide-react';

interface Question {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
  options?: string[];
  marks: number;
}

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  instructions: string;
}

export default function TakeExamPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  // Fetch exam details and questions
  useEffect(() => {
    const fetchExamData = async () => {
      try {
        setIsLoading(true);
        setError(null); // Clear any previous errors
        
        console.log("Take exam page - Starting data fetch for exam:", params.id);
        
        // Check if exam has already been submitted with comprehensive status checking
        const submissions = await apiClient.getMySubmissions();
        console.log("Take exam page - All submissions:", submissions);
        
        const existingSubmission = submissions.find((sub: any) => sub.mock_exam_id === params.id);
        console.log("Take exam page - Existing submission for this exam:", existingSubmission);
        
        // Check for completed statuses - prevent retaking completed exams
        if (existingSubmission) {
          const completedStatuses = ['submitted', 'completed', 'evaluated', 'graded'];
          if (completedStatuses.includes(existingSubmission.status)) {
            console.log("Take exam page - Exam already completed with status:", existingSubmission.status);
            router.push(`/student/exams/${params.id}/results`);
            return;
          } else {
            console.log("Take exam page - Existing submission with status:", existingSubmission.status, "- allowing retake");
          }
        }
        
        // Fetch fresh exam data
        console.log("Take exam page - Fetching exam and questions data");
        const [examData, questionsData] = await Promise.all([
          apiClient.getMockExam(params.id),
          apiClient.getExamQuestions(params.id)
        ]);
        
        console.log("Take exam page - Fresh exam data:", {
          examId: examData.id,
          title: examData.title,
          duration: examData.duration_minutes,
          questions: questionsData.length
        });
        
        // Validate data before setting state
        if (!examData || !examData.id) {
          throw new Error("Invalid exam data received");
        }
        
        if (!questionsData || questionsData.length === 0) {
          throw new Error("No questions available for this exam");
        }
        
        // Set state with fresh data
        setExam(examData);
        setQuestions(questionsData);
        setTimeRemaining(examData.duration_minutes * 60); // Convert to seconds
        setAnswers({}); // Clear any previous answers
        setCurrentQuestionIndex(0); // Reset to first question
        
        console.log("Take exam page - State updated successfully");
        
      } catch (err: any) {
        console.error("Take exam page - Error:", err);
        setError(err.message || 'Failed to load exam');
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if we have an exam ID
    if (params.id) {
      fetchExamData();
    }
  }, [params.id, router]);

  // Cleanup effect to prevent stale data and memory leaks
  useEffect(() => {
    return () => {
      console.log("Take exam page - Component unmounting, clearing state");
      // This cleanup will run when the component unmounts
      // Help prevent stale data issues when navigating back to this page
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0) return;

    console.log("Take exam page - Starting timer with", timeRemaining, "seconds remaining");

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          console.log("Take exam page - Timer expired, auto-submitting");
          handleSubmit(); // Auto-submit when time runs out
          return 0;
        }
        if (prev === 300) { // 5 minutes warning
          console.log("Take exam page - 5 minutes warning triggered");
          setShowWarning(true);
          setTimeout(() => setShowWarning(false), 5000);
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      console.log("Take exam page - Clearing timer interval");
      clearInterval(timer);
    };
  }, [timeRemaining]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleQuestionNavigation = (index: number) => {
    setCurrentQuestionIndex(index);
  };

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      console.log("Take exam page - Submit already in progress, ignoring duplicate submission");
      return;
    }

    console.log("Take exam page - Starting exam submission");
    
    const unanswered = questions.filter(q => !answers[q.id]);
    console.log("Take exam page - Unanswered questions:", unanswered.length);
    
    if (unanswered.length > 0) {
      const confirm = window.confirm(
        `You have ${unanswered.length} unanswered questions. Do you want to submit anyway?`
      );
      if (!confirm) {
        console.log("Take exam page - User cancelled submission due to unanswered questions");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const submissionData = {
        exam_id: params.id,
        answers: Object.entries(answers).map(([question_id, answer]) => ({
          question_id,
          answer
        }))
      };

      console.log("Take exam page - Submitting exam with data:", {
        examId: params.id,
        totalAnswers: submissionData.answers.length,
        questionsCount: questions.length
      });

      await apiClient.submitExam(params.id, submissionData);
      
      console.log("Take exam page - Exam submitted successfully, redirecting to results");
      router.push(`/student/exams/${params.id}/results`);
    } catch (err: any) {
      console.error("Take exam page - Submission error:", err);
      setError(err.message || 'Failed to submit exam');
      setIsSubmitting(false);
    }
  }, [isSubmitting, questions, answers, params.id, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !exam || questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-xl text-gray-700">{error || 'No questions available'}</p>
        <Button
          onClick={() => router.push('/student/exams')}
          className="mt-4"
        >
          Back to Exams
        </Button>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers[currentQuestion.id] || '';

  return (
    <div key={params.id} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
              timeRemaining < 300 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              <Clock className="h-5 w-5" />
              <span className="font-semibold">{formatTime(timeRemaining)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      {showWarning && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
            <p className="text-yellow-700">
              Warning: Only 5 minutes remaining!
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm p-6">
              {/* Question */}
              <div className="mb-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Question {currentQuestionIndex + 1}
                  </h2>
                  <span className="text-sm text-gray-500">
                    {currentQuestion.marks} points
                  </span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {currentQuestion.question_text}
                </p>
              </div>

              {/* Answer Options */}
              <div className="space-y-3">
                {currentQuestion.question_type === 'multiple_choice' && currentQuestion.options && (
                  <div className="space-y-3">
                    {currentQuestion.options.map((option, index) => (
                      <label
                        key={index}
                        className="flex items-center p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          value={option}
                          checked={currentAnswer === option}
                          onChange={() => handleAnswerChange(currentQuestion.id, option)}
                          className="mr-3"
                        />
                        <span className="text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {currentQuestion.question_type === 'true_false' && (
                  <div className="space-y-3">
                    {['True', 'False'].map((option) => (
                      <label
                        key={option}
                        className="flex items-center p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          value={option}
                          checked={currentAnswer === option}
                          onChange={() => handleAnswerChange(currentQuestion.id, option)}
                          className="mr-3"
                        />
                        <span className="text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {(currentQuestion.question_type === 'short_answer' || 
                  currentQuestion.question_type === 'essay') && (
                  <textarea
                    value={currentAnswer}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    placeholder={
                      currentQuestion.question_type === 'short_answer'
                        ? 'Enter your answer (max 200 characters)'
                        : 'Enter your detailed answer'
                    }
                    className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={currentQuestion.question_type === 'essay' ? 8 : 3}
                    maxLength={currentQuestion.question_type === 'short_answer' ? 200 : undefined}
                  />
                )}
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8">
                <Button
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                  variant="outline"
                  className="flex items-center"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                {currentQuestionIndex === questions.length - 1 ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Exam'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleNext}
                    className="flex items-center"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Question Navigation Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-4 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Question Navigation</h3>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((question, index) => {
                  const isAnswered = !!answers[question.id];
                  const isCurrent = index === currentQuestionIndex;
                  
                  return (
                    <button
                      key={question.id}
                      onClick={() => handleQuestionNavigation(index)}
                      className={`
                        p-2 text-sm font-medium rounded-lg transition-colors
                        ${isCurrent 
                          ? 'bg-blue-600 text-white' 
                          : isAnswered 
                            ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }
                      `}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-6 space-y-2 text-sm">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-green-100 rounded mr-2"></div>
                  <span className="text-gray-600">Answered</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-gray-100 rounded mr-2"></div>
                  <span className="text-gray-600">Not Answered</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-blue-600 rounded mr-2"></div>
                  <span className="text-gray-600">Current</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-gray-600 mb-2">
                  Answered: {Object.keys(answers).length} / {questions.length}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${(Object.keys(answers).length / questions.length) * 100}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}