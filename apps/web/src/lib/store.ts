'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from './api';
import { User, LoginResponse, Course, Conversation } from './types';

// Custom cookie storage for Zustand
const cookieStorage = {
  getItem: (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  },
  setItem: (name: string, value: string): void => {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${value}; path=/; max-age=2592000`; // 30 days
  },
  removeItem: (name: string): void => {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  },
};

// Auth Store
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  getCurrentUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response: LoginResponse = await apiClient.login(credentials);
          const { access_token, user } = response;
          
          apiClient.setToken(access_token);
          set({ user, token: access_token, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const user = await apiClient.register(data);
          set({ isLoading: false });
          // Note: Registration might not automatically log in
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      logout: () => {
        apiClient.removeToken();
        set({ user: null, token: null, error: null });
      },

      getCurrentUser: async () => {
        const { token } = get();
        if (!token) return;

        set({ isLoading: true });
        try {
          const user = await apiClient.getCurrentUser();
          set({ user, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
          // If token is invalid, logout
          if (error.status === 401) {
            get().logout();
          }
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => cookieStorage),
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token 
      }),
    }
  )
);

// Course Store
interface CourseState {
  courses: Course[];
  currentCourse: Course | null;
  enrollments: any[];
  isLoading: boolean;
  error: string | null;
  fetchCourses: (params?: any) => Promise<void>;
  fetchCourse: (courseId: string) => Promise<void>;
  createCourse: (data: any) => Promise<void>;
  updateCourse: (courseId: string, data: any) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  enrollInCourse: (courseId: string) => Promise<void>;
  fetchMyEnrollments: () => Promise<void>;
  clearError: () => void;
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],
  currentCourse: null,
  enrollments: [],
  isLoading: false,
  error: null,

  fetchCourses: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const courses = await apiClient.getCourses(params);
      set({ courses, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchCourse: async (courseId) => {
    set({ isLoading: true, error: null });
    try {
      const course = await apiClient.getCourse(courseId);
      set({ currentCourse: course, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createCourse: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const course = await apiClient.createCourse(data);
      set(state => ({ 
        courses: [...state.courses, course], 
        isLoading: false 
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateCourse: async (courseId, data) => {
    set({ isLoading: true, error: null });
    try {
      const updatedCourse = await apiClient.updateCourse(courseId, data);
      set(state => ({
        courses: state.courses.map(c => c.id === courseId ? updatedCourse : c),
        currentCourse: state.currentCourse?.id === courseId ? updatedCourse : state.currentCourse,
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteCourse: async (courseId) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.deleteCourse(courseId);
      set(state => ({
        courses: state.courses.filter(c => c.id !== courseId),
        currentCourse: state.currentCourse?.id === courseId ? null : state.currentCourse,
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  enrollInCourse: async (courseId) => {
    set({ isLoading: true, error: null });
    try {
      const enrollment = await apiClient.enrollInCourse(courseId);
      set(state => ({ 
        enrollments: [...state.enrollments, enrollment], 
        isLoading: false 
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  fetchMyEnrollments: async () => {
    set({ isLoading: true, error: null });
    try {
      const enrollments = await apiClient.getMyEnrollments();
      set({ enrollments, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// Chat Store
interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: any[];
  isLoading: boolean;
  error: string | null;
  fetchConversations: (params?: any) => Promise<void>;
  createConversation: (data: any) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, data: any) => Promise<void>;
  quickChat: (data: any) => Promise<any>;
  deleteConversation: (conversationId: string) => Promise<void>;
  setCurrentConversation: (conversation: Conversation | null) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  error: null,

  fetchConversations: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const conversations = await apiClient.getConversations(params);
      set({ conversations, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createConversation: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const conversation = await apiClient.createConversation(data);
      set(state => ({ 
        conversations: [conversation, ...state.conversations], 
        currentConversation: conversation,
        messages: [],
        isLoading: false 
      }));
      return conversation;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  fetchMessages: async (conversationId) => {
    set({ isLoading: true, error: null });
    try {
      const messages = await apiClient.getConversationMessages(conversationId);
      set({ messages, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  sendMessage: async (conversationId, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.sendMessage(conversationId, data);
      set(state => ({
        messages: [...state.messages, response.message, response.ai_response],
        isLoading: false
      }));
      return response;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  quickChat: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.quickChat(data);
      set({ isLoading: false });
      return response;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteConversation: async (conversationId) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.deleteConversation(conversationId);
      set(state => ({
        conversations: state.conversations.filter(c => c.id !== conversationId),
        currentConversation: state.currentConversation?.id === conversationId ? null : state.currentConversation,
        messages: state.currentConversation?.id === conversationId ? [] : state.messages,
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  setCurrentConversation: (conversation) => {
    set({ currentConversation: conversation, messages: [] });
  },

  clearError: () => set({ error: null }),
}));

// Initialize stores
if (typeof window !== 'undefined') {
  // Initialize auth store
  const authStore = useAuthStore.getState();
  if (authStore.token) {
    apiClient.setToken(authStore.token);
    authStore.getCurrentUser();
  }
}