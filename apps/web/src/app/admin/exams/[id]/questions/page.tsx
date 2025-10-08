'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

interface Question {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
  options?: string[];
  correct_answer: string;
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  order_index?: number;
}

interface Exam {
  id: string;
  title: string;
  total_marks: number;
  duration_minutes: number;
}

export default function QuestionManagementPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state for new/edit question
  const [formData, setFormData] = useState<Partial<Question>>({
    question_text: '',
    question_type: 'multiple_choice',
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: '',
    difficulty: 'medium',
    marks: 1,
  });

  useEffect(() => {
    fetchExamAndQuestions();
  }, [params.id]);

  const fetchExamAndQuestions = async () => {
    try {
      setIsLoading(true);
      const [examData, questionsData] = await Promise.all([
        apiClient.getMockExam(params.id),
        apiClient.getExamQuestions(params.id)
      ]);
      
      setExam(examData);
      setQuestions(questionsData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load exam data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddQuestion = async () => {
    try {
      // Validate form
      if (!formData.question_text || !formData.correct_answer) {
        alert('Please fill in all required fields');
        return;
      }

      // For MCQ, ensure options are provided
      if (formData.question_type === 'multiple_choice' && (!formData.options || formData.options.filter(o => o).length < 2)) {
        alert('Please provide at least 2 options for multiple choice');
        return;
      }

      const questionData = {
        ...formData,
        options: formData.question_type === 'multiple_choice' ? formData.options?.filter(o => o) : undefined,
      };

      await apiClient.createExamQuestion(params.id, questionData);
      await fetchExamAndQuestions();
      setShowAddForm(false);
      resetForm();
    } catch (err: any) {
      alert(err.message || 'Failed to add question');
    }
  };

  const handleUpdateQuestion = async (questionId: string) => {
    try {
      if (!formData.question_text || !formData.correct_answer) {
        alert('Please fill in all required fields');
        return;
      }

      const questionData = {
        ...formData,
        options: formData.question_type === 'multiple_choice' ? formData.options?.filter(o => o) : undefined,
      };

      await apiClient.updateExamQuestion(questionId, questionData);
      await fetchExamAndQuestions();
      setEditingQuestion(null);
      resetForm();
    } catch (err: any) {
      alert(err.message || 'Failed to update question');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    
    try {
      await apiClient.deleteExamQuestion(questionId);
      await fetchExamAndQuestions();
    } catch (err: any) {
      alert(err.message || 'Failed to delete question');
    }
  };

  const resetForm = () => {
    setFormData({
      question_text: '',
      question_type: 'multiple_choice',
      options: ['', '', '', ''],
      correct_answer: '',
      explanation: '',
      difficulty: 'medium',
      marks: 1,
    });
  };

  const startEdit = (question: Question) => {
    setEditingQuestion(question.id);
    setFormData(question);
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingQuestion(null);
    resetForm();
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...(formData.options || [])];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const addOption = () => {
    setFormData({
      ...formData,
      options: [...(formData.options || []), '']
    });
  };

  const removeOption = (index: number) => {
    const newOptions = formData.options?.filter((_, i) => i !== index);
    setFormData({ ...formData, options: newOptions });
  };

  const calculateTotalPoints = () => {
    return questions.reduce((sum, q) => sum + q.marks, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl text-gray-700">{error || 'Exam not found'}</p>
        <Button
          onClick={() => router.push('/admin/exams')}
          className="mt-4"
        >
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
            ← Back to Exams
          </Button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Question Management</h1>
              <p className="text-gray-600 mt-2">{exam.title}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Points</p>
              <p className="text-2xl font-bold text-blue-600">
                {calculateTotalPoints()} / {exam.total_marks}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Total Questions</p>
            <p className="text-2xl font-semibold">{questions.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">MCQ</p>
            <p className="text-2xl font-semibold">
              {questions.filter(q => q.question_type === 'multiple_choice').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">True/False</p>
            <p className="text-2xl font-semibold">
              {questions.filter(q => q.question_type === 'true_false').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Subjective</p>
            <p className="text-2xl font-semibold">
              {questions.filter(q => ['short_answer', 'essay'].includes(q.question_type)).length}
            </p>
          </div>
        </div>

        {/* Add Question Button */}
        {!showAddForm && !editingQuestion && (
          <div className="mb-6">
            <Button
              onClick={() => setShowAddForm(true)}
              className="flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Question
            </Button>
          </div>
        )}

        {/* Add Question Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Add New Question</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Question Type
                </label>
                <select
                  value={formData.question_type}
                  onChange={(e) => setFormData({ ...formData, question_type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="essay">Essay</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Question Text
                </label>
                <textarea
                  value={formData.question_text}
                  onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your question..."
                />
              </div>

              {formData.question_type === 'multiple_choice' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Options
                  </label>
                  <div className="space-y-2">
                    {formData.options?.map((option, index) => (
                      <div key={index} className="flex space-x-2">
                        <Input
                          value={option}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                        />
                        {formData.options!.length > 2 && (
                          <Button
                            onClick={() => removeOption(index)}
                            variant="outline"
                            className="px-3"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      onClick={addOption}
                      variant="outline"
                      className="text-sm"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Option
                    </Button>
                  </div>
                </div>
              )}

              {formData.question_type === 'true_false' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correct Answer
                  </label>
                  <select
                    value={formData.correct_answer}
                    onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Answer</option>
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </select>
                </div>
              )}

              {formData.question_type === 'multiple_choice' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correct Answer
                  </label>
                  <select
                    value={formData.correct_answer}
                    onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Correct Option</option>
                    {formData.options?.map((option, index) => (
                      option.trim() && (
                        <option key={index} value={option}>
                          {String.fromCharCode(65 + index)}. {option}
                        </option>
                      )
                    ))}
                  </select>
                </div>
              )}

              {(formData.question_type === 'short_answer' || formData.question_type === 'essay') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correct Answer
                  </label>
                  <Input
                    value={formData.correct_answer}
                    onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                    placeholder="Enter the correct answer"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Explanation (Optional)
                </label>
                <textarea
                  value={formData.explanation}
                  onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain the correct answer..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Difficulty Level
                  </label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Points
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.marks}
                    onChange={(e) => setFormData({ ...formData, marks: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddQuestion}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Questions List */}
        <div className="space-y-4">
          {questions.map((question, index) => (
            <div key={question.id} className="bg-white rounded-lg shadow p-6">
              {editingQuestion === question.id ? (
                // Edit mode
                <div className="space-y-4">
                  <textarea
                    value={formData.question_text}
                    onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  
                  <div className="flex justify-end space-x-3">
                    <Button onClick={cancelEdit} variant="outline">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleUpdateQuestion(question.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-sm font-semibold text-gray-500">
                          Q{index + 1}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          question.question_type === 'multiple_choice' ? 'bg-blue-100 text-blue-700' :
                          question.question_type === 'true_false' ? 'bg-purple-100 text-purple-700' :
                          question.question_type === 'short_answer' ? 'bg-green-100 text-green-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {question.question_type === 'multiple_choice' ? 'MCQ' :
                           question.question_type === 'true_false' ? 'True/False' :
                           question.question_type === 'short_answer' ? 'Short Answer' :
                           'Essay'}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          question.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                          question.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {question.difficulty}
                        </span>
                        <span className="text-sm font-semibold text-blue-600">
                          {question.marks} points
                        </span>
                      </div>
                      <p className="text-gray-800 mb-3">{question.question_text}</p>
                      
                      {question.options && question.options.length > 0 && (
                        <div className="ml-4 space-y-1 mb-3">
                          {question.options.map((option, optIndex) => (
                            <div key={optIndex} className="flex items-center">
                              <span className="text-sm text-gray-600 mr-2">
                                {String.fromCharCode(65 + optIndex)}.
                              </span>
                              <span className={`text-sm ${
                                option === question.correct_answer ? 'text-green-600 font-semibold' : 'text-gray-700'
                              }`}>
                                {option}
                                {option === question.correct_answer && ' ✓'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {(question.question_type === 'true_false' || question.question_type === 'short_answer') && (
                        <div className="ml-4 mb-3">
                          <span className="text-sm text-gray-600">Correct Answer: </span>
                          <span className="text-sm text-green-600 font-semibold">
                            {question.correct_answer}
                          </span>
                        </div>
                      )}
                      
                      {question.explanation && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-md">
                          <p className="text-sm text-gray-700">
                            <strong>Explanation:</strong> {question.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-2 ml-4">
                      <Button
                        onClick={() => startEdit(question)}
                        variant="outline"
                        className="p-2"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteQuestion(question.id)}
                        variant="outline"
                        className="p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && !showAddForm && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 mb-4">No questions added yet</p>
            <Button
              onClick={() => setShowAddForm(true)}
              className="mx-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add First Question
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}