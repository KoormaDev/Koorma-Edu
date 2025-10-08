import { ApiError } from './types';

// Force HTTPS URL to bypass any environment variable issues
const API_BASE_URL = 'https://13.53.207.48/api/v1';

// Debug logging
if (typeof window !== 'undefined') {
  console.log('API_BASE_URL (forced):', API_BASE_URL);
  console.log('NEXT_PUBLIC_API_URL env:', process.env.NEXT_PUBLIC_API_URL);
  
  // Monkey patch fetch to catch all HTTP requests
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('content') && url.includes('http://')) {
      console.error('[FETCH INTERCEPTED] HTTP content request detected!', url);
      console.trace('[FETCH INTERCEPTED] Stack trace');
    }
    return originalFetch.call(this, input, init);
  };
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Try to get token from auth store first
      const authStore = localStorage.getItem('auth-store');
      if (authStore) {
        try {
          const parsed = JSON.parse(authStore);
          this.token = parsed.state?.token || null;
        } catch (e) {
          this.token = null;
        }
      }
    }
  }

  setToken(token: string) {
    this.token = token;
    // No need to manually store - zustand persists it
  }

  removeToken() {
    this.token = null;
    // No need to manually remove - zustand handles it
  }

  getToken(): string | null {
    if (this.token) {
      console.log('Using cached token');
      return this.token;
    }
    
    // Try to get token from cookie storage (where Zustand stores it)
    const getCookie = (name: string): string | null => {
      if (typeof document === 'undefined') return null;
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
      return null;
    };
    
    const authStoreCookie = getCookie('auth-store');
    console.log('Auth store cookie:', authStoreCookie ? 'Present' : 'Missing');
    
    if (authStoreCookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(authStoreCookie));
        console.log('Parsed auth store:', parsed);
        this.token = parsed.state?.token || null;
        console.log('Retrieved token from cookie store:', this.token ? 'Present' : 'Missing');
        return this.token;
      } catch (e) {
        console.error('Error parsing auth store cookie:', e);
        return null;
      }
    }
    
    // Fallback: Try localStorage as backup
    const authStore = localStorage.getItem('auth-store');
    console.log('Auth store localStorage fallback:', authStore ? 'Present' : 'Missing');
    if (authStore) {
      try {
        const parsed = JSON.parse(authStore);
        console.log('Parsed auth store from localStorage:', parsed);
        this.token = parsed.state?.token || null;
        console.log('Retrieved token from localStorage:', this.token ? 'Present' : 'Missing');
        return this.token;
      } catch (e) {
        console.error('Error parsing auth store from localStorage:', e);
        return null;
      }
    }
    
    console.log('No auth store found in cookies or localStorage');
    return null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    console.log('[REQUEST DEBUG] Input endpoint:', endpoint);
    console.log('[REQUEST DEBUG] API_BASE_URL:', API_BASE_URL);
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('[REQUEST DEBUG] Final URL:', url);
    
    // Debug logging
    console.log('Making request to:', url);
    console.log('Request options:', options);
    
    // CRITICAL DEBUG: Check if this is the problematic HTTP request
    if (url.includes('http://') || url.includes('content/')) {
      console.error('[CRITICAL DEBUG] Potential HTTP request detected!');
      console.error('[CRITICAL DEBUG] URL:', url);
      console.error('[CRITICAL DEBUG] API_BASE_URL:', API_BASE_URL);
      console.error('[CRITICAL DEBUG] endpoint:', endpoint);
      console.trace('[CRITICAL DEBUG] Stack trace for HTTP request');
    }
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    // Always get fresh token
    const token = this.getToken();
    console.log('Token status:', token ? `Present (${token.substring(0, 20)}...)` : 'Missing');
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    } else {
      console.warn('No authentication token found!');
    }

    const response = await fetch(url, config);
    console.log('Response status:', response.status);

    if (!response.ok) {
      // Get both text and JSON error responses
      const errorText = await response.text();
      console.error('[ERROR DEBUG] Response status:', response.status);
      console.error('[ERROR DEBUG] Response text:', errorText);
      console.error('[ERROR DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));
      
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
        console.error('[ERROR DEBUG] Parsed error JSON:', errorData);
      } catch (e) {
        console.error('[ERROR DEBUG] Could not parse as JSON, raw text:', errorText);
        errorData = { detail: errorText || response.statusText };
      }
      
      const error: ApiError = {
        message: errorData.detail || errorText || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
        errors: errorData.errors || [],
      };
      
      console.error('[ERROR DEBUG] Final error object:', error);
      
      // Handle token expiration
      if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed - clearing token and redirecting to login');
        console.error('API ERROR DETAILS:', {
          url,
          endpoint,
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorText
        });
        
        // Clear invalid token
        this.removeToken();
        
        // Redirect to login only if we're not already on the login page
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
      
      throw error;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    console.log('[DEBUG] GET method called with endpoint:', endpoint);
    console.log('[DEBUG] Current API_BASE_URL:', API_BASE_URL);
    if (endpoint.includes('/content')) {
      console.trace('[DEBUG] Content GET call stack');
    }
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    console.log('[POST DEBUG] Original endpoint:', endpoint);
    console.log('[POST DEBUG] Data:', data);
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async postFormData<T>(endpoint: string, data: FormData): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Debug FormData contents
    console.log('[UPLOAD DEBUG] Endpoint:', endpoint);
    console.log('[UPLOAD DEBUG] URL:', url);
    for (const [key, value] of data.entries()) {
      if (value instanceof File) {
        console.log(`[UPLOAD DEBUG] ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
      } else {
        console.log(`[UPLOAD DEBUG] ${key}:`, value);
      }
    }
    
    const config: RequestInit = {
      method: 'POST',
      body: data,
      headers: {},
    };

    // Always get fresh token
    const token = this.getToken();
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    console.log('[UPLOAD DEBUG] Request config:', {
      url,
      method: config.method,
      hasAuth: !!token,
      bodyType: data.constructor.name
    });

    const response = await fetch(url, config);
    console.log('[UPLOAD DEBUG] Response status:', response.status);
    console.log('[UPLOAD DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[UPLOAD DEBUG] Error response text:', errorText);
      
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        console.error('[UPLOAD DEBUG] Could not parse error as JSON');
        errorData = { detail: errorText };
      }
      
      const error: ApiError = {
        message: errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
        errors: errorData.errors || [],
      };
      
      console.error('[UPLOAD DEBUG] Final error object:', error);
      throw error;
    }

    return response.json();
  }

  // Auth endpoints
  async login(credentials: { username: string; password: string }) {
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    return this.request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
  }

  async register(data: {
    email?: string;
    phone_number?: string;
    password: string;
    full_name?: string;
    role?: string;
  }) {
    return this.post('/auth/register', data);
  }

  async getCurrentUser() {
    return this.get('/auth/me');
  }

  async updateCurrentUser(data: any) {
    return this.put('/auth/me', data);
  }

  async changePassword(data: { old_password: string; new_password: string }) {
    return this.post('/auth/change-password', data);
  }

  async activateUser(userId: string) {
    return this.post(`/auth/admin/activate-user/${userId}`);
  }

  async deactivateUser(userId: string) {
    return this.post(`/auth/admin/deactivate-user/${userId}`);
  }

  async getPendingUsers() {
    return this.get('/auth/admin/pending-users');
  }

  async getUsers(role?: string) {
    const query = role ? `?role=${role}` : '';
    return this.get(`/auth/users${query}`);
  }

  async createAdmin(data: {
    email?: string;
    phone_number?: string;
    password: string;
    full_name: string;
  }) {
    return this.post('/auth/super-admin/create-admin', data);
  }

  // Course endpoints
  async getCourses(params?: {
    status?: string;
    exam_type?: string;
  }) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get(`/courses${query}`);
  }

  async getCourse(courseId: string) {
    return this.get(`/courses/${courseId}`);
  }

  async createCourse(data: {
    name: string;
    description?: string;
    exam_type: string;
    default_language?: string;
  }) {
    return this.post('/courses', data);
  }

  async updateCourse(courseId: string, data: any) {
    return this.put(`/courses/${courseId}`, data);
  }

  async deleteCourse(courseId: string) {
    return this.delete(`/courses/${courseId}`);
  }

  async enrollInCourse(courseId: string) {
    return this.post(`/courses/${courseId}/enroll`, {});
  }

  async getMyEnrollments() {
    return this.get('/courses/my-enrollments');
  }

  async getCourseEnrollments(courseId: string) {
    return this.get(`/courses/${courseId}/enrollments`);
  }

  // Syllabus endpoints
  async getCourseSyllabus(courseId: string) {
    return this.get(`/syllabus/course/${courseId}`);
  }

  async createSyllabus(data: {
    course_id: string;
    title: string;
    description?: string;
  }) {
    return this.post('/syllabus', data);
  }

  async createSyllabusWithDocument(data: {
    course_id: string;
    title: string;
    description?: string;
    version?: string;
    document?: File;
  }) {
    const formData = new FormData();
    formData.append('course_id', data.course_id);
    formData.append('title', data.title);
    
    if (data.description) formData.append('description', data.description);
    if (data.version) formData.append('version', data.version);
    if (data.document) formData.append('document', data.document);
    
    return this.postFormData('/syllabus/create-with-document', formData);
  }

  async createSyllabusItem(syllabusId: string, data: {
    title: string;
    description?: string;
    item_type: string;
    parent_id?: string;
    order_index?: number;
  }) {
    return this.post(`/syllabus/${syllabusId}/items`, data);
  }

  async getSyllabusItems(syllabusId: string, params?: {
    item_type?: string;
    parent_id?: string;
  }) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get(`/syllabus/${syllabusId}/items${query}`);
  }

  async updateSyllabusItem(itemId: string, data: {
    title?: string;
    description?: string;
    order_index?: number;
  }) {
    return this.put(`/syllabus/items/${itemId}`, data);
  }

  async deleteSyllabusItem(itemId: string) {
    return this.delete(`/syllabus/items/${itemId}`);
  }
  async updateSyllabus(syllabusId: string, data: {
    title?: string;
    description?: string;
    version?: string;
  }) {
    return this.put(`/syllabus/${syllabusId}`, data);
  }

  async deleteSyllabus(syllabusId: string) {
    return this.delete(`/syllabus/${syllabusId}`);
  }

  // Content endpoints
  async getContent(params?: {
    content_type?: string;
    status?: string;
    language?: string;
    syllabus_item_id?: string;
    course_id?: string;
  }) {
    console.log('[DEBUG] getContent called with params:', params);
    console.trace('[DEBUG] Call stack for getContent');
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    const endpoint = `/content${query}`;
    console.log('[DEBUG] getContent endpoint:', endpoint);
    console.log('[DEBUG] Full URL will be:', `${API_BASE_URL}${endpoint}`);
    return this.get(endpoint);
  }

  async getContentById(contentId: string) {
    return this.get(`/content/${contentId}`);
  }

  async createContent(data: {
    title: string;
    description?: string;
    content_type: string;
    language?: string;
    course_id?: string;
    syllabus_item_id?: string;
    file_path?: string;
    external_url?: string;
    content_text?: string;
  }) {
    // Add additional debugging for content creation
    console.log('[CREATE CONTENT] About to create content with data:', JSON.stringify(data, null, 2));
    
    // Ensure required fields are present
    if (!data.title || !data.content_type) {
      throw new Error('Missing required fields: title or content_type');
    }
    
    // Clean up the data object
    const cleanData = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined || cleanData[key] === null || cleanData[key] === '') {
        delete cleanData[key];
      }
    });
    
    console.log('[CREATE CONTENT] Cleaned data:', JSON.stringify(cleanData, null, 2));
    
    try {
      return await this.post('/content', cleanData);
    } catch (error: any) {
      console.error('[CREATE CONTENT] Failed to create content:', error);
      throw error;
    }
  }

  async uploadContentFile(file: File, useOcr: boolean = false, language: string = "en") {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('use_ocr', useOcr.toString());
    formData.append('language', language);
    return this.postFormData('/content/upload', formData);
  }

  async updateContent(contentId: string, data: {
    title?: string;
    description?: string;
    content_text?: string;
    external_url?: string;
  }) {
    return this.put(`/content/${contentId}`, data);
  }

  async deleteContent(contentId: string) {
    return this.delete(`/content/${contentId}`);
  }

  async downloadContentFile(filePath: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/content/download/${filePath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return response.blob();
  }

  async downloadContent(filePath: string): Promise<{ data: ArrayBuffer; headers: Record<string, string> }> {
    const response = await fetch(`${API_BASE_URL}/content/download/${filePath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return { data, headers };
  }

  async getContentBySyllabusItem(syllabusItemId: string) {
    return this.get(`/content/syllabus/${syllabusItemId}`);
  }

  // Assessment endpoints
  async getMockExams(params?: {
    course_id?: string;
    is_active?: boolean;
  }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.get(`/assessments/exams${query}`);
  }

  async getMockExam(examId: string) {
    return this.get(`/assessments/exams/${examId}`);
  }

  async createMockExam(data: {
    title: string;
    description?: string;
    course_id: string;
    duration_minutes: number;
    total_marks: number;
    passing_marks: number;
    max_retakes: number;
    instructions?: string;
    start_time?: string;
    end_time?: string;
  }) {
    return this.post('/assessments/exams', data);
  }

  async updateMockExam(examId: string, data: {
    title?: string;
    description?: string;
    duration_minutes?: number;
    total_marks?: number;
    passing_marks?: number;
    max_retakes?: number;
    instructions?: string;
    start_time?: string;
    end_time?: string;
    is_active?: boolean;
  }) {
    return this.put(`/assessments/exams/${examId}`, data);
  }

  async getExamQuestions(examId: string) {
    return this.get(`/assessments/exams/${examId}/questions`);
  }

  async createExamQuestion(examId: string, data: {
    question_text: string;
    question_type: string;
    options?: string[];
    correct_answer: string;
    explanation?: string;
    difficulty?: string;
    marks?: number;
  }) {
    return this.post(`/assessments/exams/${examId}/questions`, data);
  }

  async updateExamQuestion(questionId: string, data: {
    question_text: string;
    question_type: string;
    options?: string[];
    correct_answer: string;
    explanation?: string;
    difficulty?: string;
    marks?: number;
  }) {
    return this.put(`/assessments/questions/${questionId}`, data);
  }

  async deleteExamQuestion(questionId: string) {
    return this.delete(`/assessments/questions/${questionId}`);
  }

  async submitExam(examId: string, data: {
    exam_id: string;
    answers: Array<{ question_id: string; answer: string }>;
  }) {
    return this.post(`/assessments/exams/${examId}/submit`, data);
  }

  async getMySubmissions(params?: { course_id?: string }) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get(`/assessments/submissions${query}`);
  }

  async getExamResults(examId: string) {
    return this.get(`/assessments/exams/${examId}/results`);
  }
  
  // Detailed evaluation endpoints
  async getDetailedSubmissionResults(submissionId: string) {
    return this.get(`/assessments/submissions/${submissionId}/detailed-results`);
  }
  
  async reEvaluateSubmission(submissionId: string) {
    return this.post(`/assessments/submissions/${submissionId}/re-evaluate`, {});
  }
  
  async getStudentPerformanceReport(studentId: string, courseId?: string) {
    const query = courseId ? `?course_id=${courseId}` : '';
    return this.get(`/assessments/students/${studentId}/performance-report${query}`);
  }

  // Chat endpoints
  async getConversations(params?: { course_id?: string }) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get(`/chat/conversations${query}`);
  }

  async createConversation(data: {
    title?: string;
    course_id?: string;
  }) {
    return this.post('/chat/conversations', data);
  }

  async getConversationMessages(conversationId: string, params?: {
    limit?: number;
    offset?: number;
  }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.get(`/chat/conversations/${conversationId}/messages${query}`);
  }

  async sendMessage(conversationId: string, data: {
    content: string;
    course_id?: string;
  }) {
    return this.post(`/chat/conversations/${conversationId}/messages`, data);
  }

  async quickChat(data: {
    content: string;
    course_id?: string;
  }) {
    return this.post('/chat/quick-chat', data);
  }

  async getConversation(conversationId: string) {
    return this.get(`/chat/conversations/${conversationId}`);
  }

  async deleteConversation(conversationId: string) {
    return this.delete(`/chat/conversations/${conversationId}`);
  }

  async updateConversationTitle(conversationId: string, data: { title: string }) {
    return this.put(`/chat/conversations/${conversationId}/title`, data);
  }

  // Content Summaries API
  async createContentSummary(data: {
    content_id: string;
    summary_text: string;
    key_topics: string[];
    content_type: string;
    difficulty_level?: string;
    estimated_reading_time?: number;
    learning_objectives?: string[];
  }) {
    return this.post('/content/summaries', data);
  }

  async getContentSummaries(courseId: string) {
    return this.get(`/content/summaries?course_id=${courseId}`);
  }

  async getContentSummary(contentId: string) {
    return this.get(`/content/summaries/${contentId}`);
  }

  // Progress Tracking endpoints
  async getMaterialProgress(contentId: string) {
    return this.get(`/content/progress/material/${contentId}`);
  }

  async updateMaterialProgress(contentId: string, data: {
    is_completed?: boolean;
    completion_percentage?: number;
  }) {
    return this.put(`/content/progress/material/${contentId}`, data);
  }

  async getCourseProgress(courseId: string) {
    return this.get(`/content/progress/course/${courseId}`);
  }

  async startStudySession(data: {
    content_id?: string;
    course_id?: string;
    session_type?: string;
  }) {
    return this.post('/content/sessions/start', data);
  }

  async endStudySession(sessionId: string) {
    return this.post('/content/sessions/end', { session_id: sessionId });
  }

  async getActiveSessions() {
    return this.get('/content/sessions/active');
  }

  // Invitation endpoints
  async inviteStudent(courseId: string, data: {
    email: string;
    full_name?: string;
    personal_message?: string;
  }) {
    return this.post(`/invitations/courses/${courseId}/invite`, data);
  }

  async bulkInviteStudents(courseId: string, data: {
    emails: string[];
    personal_message?: string;
  }) {
    return this.post(`/invitations/courses/${courseId}/bulk-invite`, data);
  }

  async getCourseInvitations(courseId: string, status?: string) {
    const query = status ? `?status=${status}` : '';
    return this.get(`/invitations/courses/${courseId}/invitations${query}`);
  }

  async getInvitationDetails(invitationToken: string) {
    return this.get(`/invitations/token/${invitationToken}`);
  }

  async acceptInvitation(invitationToken: string, data: {
    full_name: string;
    password: string;
  }) {
    return this.post(`/invitations/accept/${invitationToken}`, data);
  }

  async getMyInvitations() {
    return this.get('/invitations/my-invitations');
  }

  async cancelInvitation(courseId: string, invitationId: string) {
    return this.delete(`/invitations/courses/${courseId}/invitations/${invitationId}`);
  }

  // Past Papers endpoints
  async uploadPastPaper(data: {
    file: File;
    title: string;
    exam_year?: string;
    exam_stage?: string;
    description?: string;
    course_id?: string;
    syllabus_item_id?: string;
    difficulty_level?: string;
    question_type?: string;
    use_ocr?: boolean;
    extract_questions?: boolean;
  }) {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('title', data.title);
    
    if (data.exam_year) formData.append('exam_year', data.exam_year);
    if (data.exam_stage) formData.append('exam_stage', data.exam_stage);
    if (data.description) formData.append('description', data.description);
    if (data.course_id) formData.append('course_id', data.course_id);
    if (data.syllabus_item_id) formData.append('syllabus_item_id', data.syllabus_item_id);
    if (data.difficulty_level) formData.append('difficulty_level', data.difficulty_level);
    if (data.question_type) formData.append('question_type', data.question_type);
    if (data.use_ocr !== undefined) formData.append('use_ocr', data.use_ocr.toString());
    if (data.extract_questions !== undefined) formData.append('extract_questions', data.extract_questions.toString());
    
    return this.postFormData('/past-papers/upload', formData);
  }

  async getPastPapers(params?: {
    course_id?: string;
    exam_year?: string;
    exam_stage?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.get(`/past-papers${query}`);
  }

  async getPastPaper(paperId: string) {
    return this.get(`/past-papers/${paperId}`);
  }

  async deletePastPaper(paperId: string) {
    return this.delete(`/past-papers/${paperId}`);
  }

  // Questions endpoints for past paper question practice
  async getQuestionsByPastPaper(contentId: string) {
    return this.get(`/questions/past-paper/${contentId}`);
  }

  async getQuestionsWithAnswers(contentId: string) {
    return this.get(`/questions/past-paper/${contentId}/with-answers`);
  }

  async submitStudentAnswer(data: {
    question_id: string;
    answer_text: string;
    time_spent_seconds?: number;
  }) {
    return this.post('/questions/answer', data);
  }

  async generateAiFeedback(answerId: string) {
    return this.post(`/questions/answer/${answerId}/generate-feedback`, {});
  }

  async getMyAnswers(questionId?: string) {
    const params = questionId ? `?question_id=${questionId}` : '';
    return this.get(`/questions/my-answers${params}`);
  }

  // Admin Question Management endpoints
  async getAdminQuestionsByPastPaper(contentId: string) {
    return this.get(`/questions/admin/past-paper/${contentId}`);
  }

  async updateQuestion(questionId: string, data: {
    question_text?: string;
    question_type?: string;
    difficulty?: string;
    marks?: number;
    question_number?: number;
    options?: Record<string, string>;
    correct_answer?: string;
    explanation?: string;
  }) {
    return this.put(`/questions/admin/${questionId}`, data);
  }

  async deleteQuestion(questionId: string) {
    return this.delete(`/questions/admin/${questionId}`);
  }

  async createQuestion(contentId: string, data: {
    question_text: string;
    question_type: string;
    difficulty: string;
    marks: number;
    question_number?: number;
    options?: Record<string, string>;
    correct_answer?: string;
    explanation?: string;
  }) {
    return this.post(`/questions/admin/past-paper/${contentId}`, data);
  }

  // Exam Submissions endpoints (for admin results page)
  async getExamSubmissions(examId: string) {
    return this.get(`/assessments/exams/${examId}/submissions`);
  }

  // Analytics endpoints
  async getAnalyticsOverview() {
    return this.get('/assessments/analytics/overview');
  }

  async getRecentActivity(limit: number = 20) {
    return this.get(`/assessments/analytics/recent-activity?limit=${limit}`);
  }

  // Student management endpoints for admin
  async getStudentSubmissions(studentId: string) {
    return this.get(`/assessments/submissions/student/${studentId}`);
  }

  async getStudentEnrollments(studentId: string) {
    return this.get(`/courses/enrollments/student/${studentId}`);
  }

  // Login Session Tracking endpoints
  async startLoginSession() {
    return this.post('/content/login-session/start', {});
  }

  async updateLoginSessionHeartbeat() {
    return this.post('/content/login-session/heartbeat', {});
  }

  async endLoginSession() {
    return this.post('/content/login-session/end', {});
  }

  async getTotalLoginTime() {
    return this.get('/content/login-session/total-time');
  }

  // Course Progress endpoints
  async getAllCoursesProgress() {
    return this.get('/content/progress/all-courses');
  }

  // Page Time Tracking endpoints
  async startPageTracking(pageData: {
    page_type: 'material' | 'ai_tutor' | 'past_paper' | 'exam' | 'other';
    page_url?: string;
    content_id?: string;
    exam_id?: string;
  }) {
    return this.post('/content/page-tracking/start', pageData);
  }

  async endPageTracking(trackingId: string) {
    return this.post(`/content/page-tracking/end/${trackingId}`, {});
  }

  async updatePageTracking(trackingId: string, activityData: {
    interactions_count?: number;
    scroll_depth?: number;
  }) {
    return this.post(`/content/page-tracking/heartbeat/${trackingId}`, activityData);
  }

  async getPageTrackingSummary() {
    return this.get('/content/page-tracking/summary');
  }

  async getStudentPageTrackingSummary(studentId: string) {
    return this.get(`/content/page-tracking/summary/student/${studentId}`);
  }

  // Chat persistence methods
  async getChatConversation(courseId: string) {
    return this.get(`/content/chat/conversations/${courseId}`);
  }

  async addChatMessage(courseId: string, messageData: {
    content: string;
    sender: 'user' | 'assistant';
    sources?: string[];
    response_time_ms?: number;
    tokens_used?: number;
    model_used?: string;
    context_used?: string;
  }) {
    return this.post(`/content/chat/conversations/${courseId}/messages`, messageData);
  }

  async clearChatConversation(courseId: string) {
    return this.delete(`/content/chat/conversations/${courseId}`);
  }

  async getAllChatConversations() {
    return this.get('/content/chat/conversations');
  }
}

export const apiClient = new ApiClient();