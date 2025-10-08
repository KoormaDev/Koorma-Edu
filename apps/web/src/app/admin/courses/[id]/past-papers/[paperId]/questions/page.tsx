'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Trash2, Edit, Plus, ArrowLeft, Eye } from 'lucide-react';
import { apiClient as api } from '@/lib/api';

interface Question {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'essay' | 'short_answer' | 'true_false' | 'fill_blank';
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  question_number?: number;
  extraction_confidence?: number;
  options?: Record<string, string>;
  correct_answer?: string;
  explanation?: string;
}

interface PastPaper {
  id: string;
  title: string;
  exam_year?: string;
  exam_stage?: string;
}

export default function QuestionsManagementPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const paperId = params.paperId as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [pastPaper, setPastPaper] = useState<PastPaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state for editing/creating
  const [formData, setFormData] = useState<Partial<Question>>({
    question_text: '',
    question_type: 'essay',
    difficulty: 'medium',
    marks: 1,
    question_number: 1,
    options: {},
    correct_answer: '',
    explanation: ''
  });

  useEffect(() => {
    fetchQuestions();
    fetchPastPaperInfo();
  }, [paperId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const response = await api.getAdminQuestionsByPastPaper(paperId);
      setQuestions(response);
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPastPaperInfo = async () => {
    try {
      const response = await api.getContentById(paperId);
      setPastPaper(response);
    } catch (error) {
      console.error('Error fetching past paper info:', error);
    }
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
    setFormData({
      question_text: question.question_text,
      question_type: question.question_type,
      difficulty: question.difficulty,
      marks: question.marks,
      question_number: question.question_number,
      options: question.options || {},
      correct_answer: question.correct_answer || '',
      explanation: question.explanation || ''
    });
  };

  const handleSave = async () => {
    // Basic validation
    if (!formData.question_text?.trim()) {
      alert('Please enter the question text.');
      return;
    }

    if (!formData.question_type) {
      alert('Please select a question type.');
      return;
    }

    if (!formData.difficulty) {
      alert('Please select a difficulty level.');
      return;
    }

    if (!formData.marks || formData.marks < 1) {
      alert('Please enter a valid number of marks (minimum 1).');
      return;
    }

    try {
      if (editingQuestion) {
        // Update existing question
        const response = await api.updateQuestion(editingQuestion.id, formData);
        setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? response : q));
        setEditingQuestion(null);
      } else {
        // Create new question
        const response = await api.createQuestion(paperId, formData);
        setQuestions(prev => [...prev, response]);
        setIsCreateModalOpen(false);
      }
      
      // Reset form
      setFormData({
        question_text: '',
        question_type: 'essay',
        difficulty: 'medium',
        marks: 1,
        question_number: 1,
        options: {},
        correct_answer: '',
        explanation: ''
      });
    } catch (error) {
      console.error('Error saving question:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error occurred';
      alert(`Error saving question: ${errorMessage}`);
    }
  };

  const handleDelete = async (questionId: string) => {
    try {
      await api.deleteQuestion(questionId);
      setQuestions(prev => prev.filter(q => q.id !== questionId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('Error deleting question. Please try again.');
    }
  };

  const handleOptionChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      options: {
        ...prev.options,
        [key]: value
      }
    }));
  };

  const addOption = () => {
    const currentOptions = formData.options || {};
    const nextKey = String.fromCharCode(65 + Object.keys(currentOptions).length);
    handleOptionChange(nextKey, '');
  };

  const removeOption = (key: string) => {
    const newOptions = { ...formData.options };
    delete newOptions[key];
    setFormData(prev => ({
      ...prev,
      options: newOptions
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg">Loading questions...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => router.push(`/admin/courses/${courseId}/past-papers`)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Past Papers
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Questions Management</h1>
              <p className="text-gray-600">
                {pastPaper?.title} {pastPaper?.exam_year && `(${pastPaper.exam_year})`}
              </p>
            </div>
          </div>
          
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </div>

        {/* Questions List */}
        {questions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500 mb-4">No questions found for this past paper.</p>
              <p className="text-sm text-gray-400 mb-4">
                Questions are automatically extracted when you upload a past paper with "Extract Questions" enabled.
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Question
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <Card key={question.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        Q{question.question_number || index + 1}
                      </Badge>
                      <Badge variant={
                        question.question_type === 'multiple_choice' ? 'default' : 
                        question.question_type === 'essay' ? 'secondary' : 'outline'
                      }>
                        {question.question_type.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <Badge variant={
                        question.difficulty === 'easy' ? 'outline' :
                        question.difficulty === 'medium' ? 'secondary' : 'destructive'
                      }>
                        {question.difficulty.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {question.marks} mark{question.marks !== 1 ? 's' : ''}
                      </span>
                      {question.extraction_confidence && (
                        <span className="text-xs text-gray-400">
                          Confidence: {question.extraction_confidence}%
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(question)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setDeleteConfirm(question.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Question:</p>
                      <p className="text-gray-900">{question.question_text}</p>
                    </div>
                    
                    {question.options && Object.keys(question.options).length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Options:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {Object.entries(question.options).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                              <Badge variant="outline">{key})</Badge>
                              <span className="text-gray-700">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {question.correct_answer && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Correct Answer:</p>
                        <p className="text-green-600">{question.correct_answer}</p>
                      </div>
                    )}
                    
                    {question.explanation && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Explanation:</p>
                        <p className="text-gray-600 text-sm">{question.explanation}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit/Create Dialog */}
        <Dialog 
          open={!!editingQuestion || isCreateModalOpen} 
          onOpenChange={() => {
            setEditingQuestion(null);
            setIsCreateModalOpen(false);
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingQuestion ? 'Edit Question' : 'Create New Question'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="question_number">Question Number</Label>
                  <Input
                    id="question_number"
                    type="number"
                    value={formData.question_number || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      question_number: parseInt(e.target.value) || 1
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="marks">Marks</Label>
                  <Input
                    id="marks"
                    type="number"
                    value={formData.marks || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      marks: parseInt(e.target.value) || 1
                    }))}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="question_type">Question Type</Label>
                  <Select 
                    value={formData.question_type} 
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      question_type: value as Question['question_type']
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="essay">Essay</SelectItem>
                      <SelectItem value="short_answer">Short Answer</SelectItem>
                      <SelectItem value="true_false">True/False</SelectItem>
                      <SelectItem value="fill_blank">Fill in the Blank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select 
                    value={formData.difficulty} 
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      difficulty: value as Question['difficulty']
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="question_text">Question Text</Label>
                <Textarea
                  id="question_text"
                  rows={4}
                  value={formData.question_text || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    question_text: e.target.value
                  }))}
                  placeholder="Enter the question text..."
                />
              </div>
              
              {formData.question_type === 'multiple_choice' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Options</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      Add Option
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(formData.options || {}).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="outline">{key})</Badge>
                        <Input
                          value={value}
                          onChange={(e) => handleOptionChange(key, e.target.value)}
                          placeholder={`Option ${key}`}
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => removeOption(key)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <Label htmlFor="correct_answer">Correct Answer</Label>
                <Input
                  id="correct_answer"
                  value={formData.correct_answer || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    correct_answer: e.target.value
                  }))}
                  placeholder="Enter the correct answer..."
                />
              </div>
              
              <div>
                <Label htmlFor="explanation">Explanation (Optional)</Label>
                <Textarea
                  id="explanation"
                  rows={3}
                  value={formData.explanation || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    explanation: e.target.value
                  }))}
                  placeholder="Enter explanation for the answer..."
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setEditingQuestion(null);
                    setIsCreateModalOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  {editingQuestion ? 'Update Question' : 'Create Question'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Question</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>Are you sure you want to delete this question? This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
                >
                  Delete Question
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}