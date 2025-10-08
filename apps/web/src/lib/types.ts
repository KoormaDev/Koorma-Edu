// API Response Types
export interface ApiError {
  message: string;
  status: number;
  errors: string[];
}

// User Types
export interface User {
  id: string;
  email?: string;
  phone_number?: string;
  full_name?: string;
  role: 'student' | 'admin' | 'super_admin' | 'institution';
  institution_id?: string;
  is_active: string;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Course Types
export interface Course {
  id: string;
  name: string;
  description?: string;
  exam_type: 'competitive' | 'academic' | 'professional' | 'certification';
  default_language: string;
  status: 'draft' | 'active' | 'archived';
  creator_id: string;
  created_at: string;
  updated_at: string;
}

export interface CourseEnrollment {
  id: string;
  course_id: string;
  student_id: string;
  enrollment_status: string;
  enrolled_at: string;
}

// Syllabus Types
export interface Syllabus {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  created_at: string;
  updated_at: string;
  items: SyllabusItem[];
}

export interface SyllabusItem {
  id: string;
  title: string;
  description?: string;
  item_type: 'subject' | 'topic' | 'subtopic';
  parent_id?: string;
  syllabus_id: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// Content Types
export interface Content {
  id: string;
  title: string;
  description?: string;
  content_type: 'document' | 'video' | 'text' | 'past_paper' | 'question_bank';
  status: 'draft' | 'active' | 'archived';
  language: 'english' | 'tamil' | 'sinhala';
  syllabus_item_id?: string;
  file_path?: string;
  external_url?: string;
  content_text?: string;
  file_size?: number;
  created_at: string;
  updated_at: string;
}

// Assessment Types
export interface MockExam {
  id: string;
  title: string;
  description?: string;
  course_id: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  instructions?: string;
  is_active: boolean;
  start_time?: string;
  end_time?: string;
  created_at: string;
  total_questions?: number;
}

export interface Question {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | 'multi_select';
  options?: string[];
  difficulty_level: 'easy' | 'medium' | 'hard';
  points: number;
  created_at: string;
}

export interface Submission {
  id: string;
  exam_id: string;
  student_id: string;
  score?: number;
  total_marks: number;
  percentage?: number;
  time_taken?: number;
  submitted_at: string;
  is_passed?: boolean;
}

// Chat Types
export interface Conversation {
  id: string;
  title: string;
  course_id?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatResponse {
  message: Message;
  ai_response: Message;
}

// Form Types
export interface LoginForm {
  username: string;
  password: string;
}

export interface RegisterForm {
  email?: string;
  phone_number?: string;
  password: string;
  full_name?: string;
  role?: string;
}

export interface CourseForm {
  name: string;
  description?: string;
  exam_type: string;
  default_language?: string;
}

export interface SyllabusForm {
  title: string;
  description?: string;
}

export interface SyllabusItemForm {
  title: string;
  description?: string;
  item_type: string;
  parent_id?: string;
  order_index?: number;
}

export interface ContentForm {
  title: string;
  description?: string;
  content_type: string;
  language?: string;
  syllabus_item_id?: string;
  file_path?: string;
  external_url?: string;
  content_text?: string;
}

export interface ExamForm {
  title: string;
  description?: string;
  course_id: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  instructions?: string;
  start_time?: string;
  end_time?: string;
}

export interface QuestionForm {
  question_text: string;
  question_type: string;
  options?: string[];
  correct_answer: string;
  explanation?: string;
  difficulty_level?: string;
  points?: number;
}

// UI State Types
export interface LoadingState {
  isLoading: boolean;
  error?: string;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

export interface FilterState {
  [key: string]: any;
}