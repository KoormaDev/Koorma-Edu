'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft,
  Clock,
  FileText,
  MessageCircle,
  Play,
  Pause,
  RotateCcw,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  ArrowDown,
  Award,
  Target,
  Send,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';

interface Question {
  id: string;
  question_text: string;
  question_number?: number;
  question_type: string;
  difficulty: string;
  marks: number;
  options?: any;
  source_year?: string;
  content_title: string;
  extraction_confidence?: number;
}

interface StudentAnswer {
  id: string;
  question_id: string;
  answer_text: string;
  ai_answer?: string;
  ai_feedback?: string;
  submitted_at: string;
  feedback_generated_at?: string;
}

interface QuestionWithAnswer {
  question: Question;
  student_answer?: StudentAnswer;
}

interface PastPaper {
  id: string;
  title: string;
  description?: string;
  exam_year?: string;
  exam_stage?: string;
  course_name?: string;
  syllabus_item_title?: string;
}

export default function PastPaperPracticeSession({ params }: { params: { paperId: string } }) {
  const router = useRouter();
  const [paper, setPaper] = useState<PastPaper | null>(null);
  const [questions, setQuestions] = useState<QuestionWithAnswer[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [showAiAnswer, setShowAiAnswer] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'practice' | 'review'>('practice');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuestionsAndAnswers();
  }, [params.paperId]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isTimerActive) {
      interval = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerActive]);

  const fetchQuestionsAndAnswers = async () => {
    try {
      setIsLoading(true);
      
      // Fetch questions with existing answers
      const questionsData = await apiClient.getQuestionsWithAnswers(params.paperId);
      
      if (questionsData && questionsData.length > 0) {
        setQuestions(questionsData);
        setPaper({
          id: params.paperId,
          title: questionsData[0].question.content_title,
          exam_year: questionsData[0].question.source_year
        });
        
        // Set current answer if it exists
        const firstQuestion = questionsData[0];
        if (firstQuestion.student_answer) {
          setCurrentAnswer(firstQuestion.student_answer.answer_text);
          setPracticeMode('review');
        }
      } else {
        // No questions found - set empty state but don't redirect
        setQuestions([]);
        setPaper({
          id: params.paperId,
          title: 'Past Paper Practice',
          exam_year: ''
        });
        setError('No questions found for this past paper. Questions may still be processing or extraction might not have been enabled during upload.');
      }
      
    } catch (error: any) {
      console.error('Failed to fetch questions:', error);
      setError(error.message || 'Failed to load questions. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const startTimer = () => {
    setIsTimerActive(true);
    setQuestionStartTime(Date.now());
  };

  const pauseTimer = () => {
    setIsTimerActive(false);
  };

  const resetTimer = () => {
    setIsTimerActive(false);
    setTimeElapsed(0);
    setQuestionStartTime(Date.now());
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim()) {
      alert('Please provide an answer before submitting');
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setIsSubmitting(true);

    try {
      const timeSpentSeconds = Math.floor((Date.now() - questionStartTime) / 1000);

      const response = await apiClient.submitStudentAnswer({
        question_id: currentQuestion.question.id,
        answer_text: currentAnswer,
        time_spent_seconds: timeSpentSeconds
      });

      // Update the question with the new answer (including AI feedback)
      const updatedQuestions = [...questions];
      updatedQuestions[currentQuestionIndex] = {
        ...currentQuestion,
        student_answer: response
      };
      setQuestions(updatedQuestions);

      // Debug: Log the response to see what we're getting
      console.log('Submit response:', response);
      console.log('AI Answer:', response.ai_answer);
      console.log('AI Feedback:', response.ai_feedback);

      // Show AI feedback automatically
      setShowAiAnswer(true);

      if (response.ai_feedback || response.ai_answer) {
        alert('Answer submitted and AI feedback generated!');
      } else {
        alert('Answer submitted! AI feedback may take a moment to appear.');
      }

    } catch (error: any) {
      console.error('Failed to submit answer:', error);
      alert(error.message || 'Failed to submit answer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateAiFeedback = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    const studentAnswer = currentQuestion?.student_answer;
    
    if (!studentAnswer) {
      alert('Please submit an answer first');
      return;
    }

    setIsGeneratingFeedback(true);
    
    try {
      const response = await apiClient.generateAiFeedback(studentAnswer.id);
      
      // Update the question with AI feedback
      const updatedQuestions = [...questions];
      updatedQuestions[currentQuestionIndex] = {
        ...currentQuestion,
        student_answer: response
      };
      setQuestions(updatedQuestions);
      
    } catch (error: any) {
      console.error('Failed to generate AI feedback:', error);
      alert(error.message || 'Failed to generate AI feedback');
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const navigateToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      setCurrentQuestionIndex(index);
      setQuestionStartTime(Date.now());
      
      // Load existing answer if available
      const question = questions[index];
      if (question.student_answer) {
        setCurrentAnswer(question.student_answer.answer_text);
      } else {
        setCurrentAnswer('');
      }
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'hard': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'multiple_choice': return '📝';
      case 'essay': return '✍️';
      case 'short_answer': return '💬';
      default: return '❓';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading questions...</p>
        </div>
      </div>
    );
  }

  if (!questions.length || error) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold">Practice Questions</h1>
                <p className="text-sm text-gray-600">{paper?.title || 'Past Paper'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* No Questions Content */}
        <div className="flex items-center justify-center py-16">
          <div className="text-center max-w-md mx-4">
            <AlertCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Questions Found</h2>
            <p className="text-gray-600 mb-6">
              {error || "This past paper hasn't been processed for question extraction yet, or no questions were found."}
            </p>
            
            <div className="space-y-3">
              <Button 
                onClick={() => window.location.reload()}
                variant="outline"
                className="w-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Refresh Page
              </Button>
              <Button 
                onClick={() => router.back()}
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-left">
              <h3 className="font-medium text-blue-900 mb-2">Why might this happen?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Question extraction wasn't enabled during upload</li>
                <li>• The past paper is still being processed</li>
                <li>• No recognizable questions were found in the document</li>
                <li>• Technical issue during processing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="font-semibold text-gray-900">{paper?.title}</h1>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
                    {paper?.exam_year && <span>Year: {paper.exam_year}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Timer and Controls */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg px-4 py-2">
                <Clock className="h-4 w-4 text-gray-600" />
                <span className="font-mono text-lg">{formatTime(timeElapsed)}</span>
                <div className="flex items-center space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={isTimerActive ? pauseTimer : startTimer}
                  >
                    {isTimerActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetTimer}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Question Navigation Sidebar */}
          <div className="col-span-3">
            <div className="bg-white rounded-lg shadow-sm border p-4 sticky top-24">
              <h3 className="font-medium text-gray-900 mb-4">Questions</h3>
              <div className="space-y-2">
                {questions.map((q, index) => (
                  <button
                    key={q.question.id}
                    onClick={() => navigateToQuestion(index)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      index === currentQuestionIndex
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Q{index + 1}</span>
                      <span className="text-xs text-gray-500">
                        {getQuestionTypeIcon(q.question.question_type)} {q.question.marks}pt
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className={`text-xs px-2 py-1 rounded ${getDifficultyColor(q.question.difficulty)}`}>
                        {q.question.difficulty}
                      </span>
                      {q.student_answer && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Question Area */}
          <div className="col-span-9 space-y-6">
            {/* Question Card */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <h2 className="text-lg font-medium">
                      Question {currentQuestionIndex + 1}
                      {currentQuestion.question.question_number && (
                        <span className="text-gray-500 ml-2">(#{currentQuestion.question.question_number})</span>
                      )}
                    </h2>
                    <span className={`px-2 py-1 rounded text-sm ${getDifficultyColor(currentQuestion.question.difficulty)}`}>
                      {currentQuestion.question.difficulty}
                    </span>
                    <span className="text-sm text-gray-500">
                      {currentQuestion.question.marks} marks
                    </span>
                  </div>
                  
                  {currentQuestion.question.extraction_confidence && (
                    <span className="text-xs text-gray-400">
                      AI Confidence: {currentQuestion.question.extraction_confidence}%
                    </span>
                  )}
                </div>
                
                <div className="prose max-w-none">
                  <div className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                    {currentQuestion.question.question_text}
                  </div>
                </div>

                {/* Multiple Choice Options */}
                {currentQuestion.question.options && (
                  <div className="mt-4 space-y-2">
                    {Array.isArray(currentQuestion.question.options) ? 
                      currentQuestion.question.options.map((option: string, index: number) => (
                        <div key={index} className="flex items-start space-x-2">
                          <span className="text-sm font-medium text-gray-600 mt-1">
                            {String.fromCharCode(65 + index)})
                          </span>
                          <span className="text-gray-800">{option}</span>
                        </div>
                      )) : (
                        <div className="text-sm text-gray-600">
                          {JSON.stringify(currentQuestion.question.options)}
                        </div>
                      )
                    }
                  </div>
                )}
              </div>

              {/* Answer Section */}
              <div className="p-6">
                <h3 className="font-medium text-gray-900 mb-3">Your Answer</h3>
                <textarea
                  rows={6}
                  placeholder="Type your answer here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                />
                
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center space-x-2">
                    {currentQuestion.student_answer ? (
                      <span className="text-sm text-green-600 flex items-center">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Submitted on {new Date(currentQuestion.student_answer.submitted_at).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">Not submitted yet</span>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleSubmitAnswer}
                      disabled={isSubmitting || !currentAnswer.trim()}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Evaluating Answer...
                        </>
                      ) : currentQuestion.student_answer ? (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Update & Re-evaluate
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Submit & Get AI Feedback
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Feedback Section */}
            {(currentQuestion.student_answer?.ai_answer || currentQuestion.student_answer?.ai_feedback) && (
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-green-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Lightbulb className="h-5 w-5 text-blue-600" />
                      <h3 className="font-medium text-blue-900">AI Evaluation Results</h3>
                      {currentQuestion.student_answer.ai_feedback && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">Your Score:</span>
                          <span className="px-3 py-1 bg-white rounded-full text-lg font-bold text-blue-600 border-2 border-blue-200">
                            {currentQuestion.student_answer.ai_feedback.match(/Score: (\d+)\/100/)
                              ? `${currentQuestion.student_answer.ai_feedback.match(/Score: (\d+)\/100/)?.[1]}%`
                              : 'Evaluated'
                            }
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAiAnswer(!showAiAnswer)}
                    >
                      {showAiAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {showAiAnswer && (
                  <div className="p-6 space-y-6">
                    {/* Score Breakdown */}
                    {currentQuestion.student_answer.ai_feedback && (
                      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 border-l-4 border-blue-500">
                        <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                          <Target className="h-5 w-5 mr-2 text-blue-600" />
                          Your Performance Score
                        </h4>
                        <div className="text-2xl font-bold text-blue-600 mb-2">
                          {currentQuestion.student_answer.ai_feedback.match(/Score: (\d+)\/100/)
                            ? `${currentQuestion.student_answer.ai_feedback.match(/Score: (\d+)\/100/)?.[1]}%`
                            : 'Evaluated'
                          }
                        </div>
                        <div className="text-sm text-gray-600">
                          Based on accuracy, completeness, and understanding
                        </div>
                      </div>
                    )}

                    {/* Expected Answer */}
                    {currentQuestion.student_answer.ai_answer && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                          <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                          Expected Answer:
                        </h4>
                        <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
                          <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                            {currentQuestion.student_answer.ai_answer}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Detailed Feedback */}
                    {currentQuestion.student_answer.ai_feedback && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                          <MessageCircle className="h-5 w-5 mr-2 text-blue-600" />
                          Detailed Analysis:
                        </h4>
                        <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                          <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                            {currentQuestion.student_answer.ai_feedback.replace(/Score: \d+\/100\n\n/, '')}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-gray-500 border-t pt-3">
                      AI evaluation completed on {new Date(currentQuestion.student_answer.feedback_generated_at || '').toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => navigateToQuestion(currentQuestionIndex - 1)}
                disabled={currentQuestionIndex === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous Question
              </Button>
              
              <span className="text-sm text-gray-500">
                {currentQuestionIndex + 1} of {questions.length}
              </span>
              
              <Button
                variant="outline"
                onClick={() => navigateToQuestion(currentQuestionIndex + 1)}
                disabled={currentQuestionIndex === questions.length - 1}
              >
                Next Question
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}