"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { useLanguage } from "../../../contexts/LanguageContext";
import { translationService } from "../../../lib/translation";
import { contentSummaryService } from "../../../lib/contentSummaryService";
import { usePageTimeTracking } from "../../../hooks/usePageTimeTracking";
import {
  ArrowLeft,
  MessageSquare,
  Send,
  Bot,
  User,
  BookOpen,
  FileText,
  ExternalLink,
  Trash2
} from "lucide-react";

interface Source {
  title: string;
  content_type: string;
  chunk_text: string;
  score: number;
  content_id?: string;
  metadata?: {
    filename?: string;
    source_url?: string;
    chunk_index?: number;
    content_id?: string;
  };
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  sources?: Source[];
}

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
}

function ChatContent() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track time on AI tutor page
  usePageTimeTracking({
    pageType: 'ai_tutor'
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const initializeChat = async () => {
      // Fetch course information if course ID is provided
      if (courseId) {
        const courseData = await fetchCourse();
        // Load chat history for this course, passing the freshly fetched course data
        await loadChatHistory(courseData);
      } else {
        // Add appropriate welcome message for general chat
        setMessages([{
          id: '1',
          content: 'Hello! I\'m your AI tutor assistant. How can I help you today?',
          sender: 'assistant',
          timestamp: new Date().toISOString()
        }]);
      }
    };

    initializeChat();
  }, [courseId]);

  const fetchCourse = async () => {
    if (!courseId) return null;

    try {
      const courseData = await apiClient.getCourse(courseId);
      setCourse(courseData);
      return courseData;
    } catch (error) {
      console.error('Failed to fetch course:', error);
      return null;
    }
  };

  const loadChatHistory = async (courseDataParam?: any) => {
    if (!courseId) return;

    // Use passed course data or fall back to state
    const courseToUse = courseDataParam || course;

    try {
      console.log('Loading chat history for course:', courseId);
      const conversation = await apiClient.getChatConversation(courseId);

      // Convert stored messages to component format
      const loadedMessages: Message[] = conversation.messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.created_at,
        sources: msg.sources || []
      }));

      // If no messages exist, add course-specific welcome message
      if (loadedMessages.length === 0) {
        const welcomeMessage = await generateCourseWelcomeMessage(courseToUse);
        loadedMessages.push({
          id: '1',
          content: welcomeMessage,
          sender: 'assistant',
          timestamp: new Date().toISOString()
        });
      }

      setMessages(loadedMessages);
      console.log('Loaded chat history:', loadedMessages.length, 'messages');
    } catch (error) {
      console.error('Failed to load chat history:', error);
      // Fallback to default welcome message if loading fails
      const fallbackMessage = await generateCourseWelcomeMessage(courseToUse).catch(() =>
        'Hello! I\'m your AI tutor for this course. Ask me anything about the course materials!'
      );
      setMessages([{
        id: '1',
        content: fallbackMessage,
        sender: 'assistant',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const generateCourseWelcomeMessage = async (courseData?: Course | null): Promise<string> => {
    // Use passed course data or fall back to state
    const courseToUse = courseData || course;

    if (!courseId || !courseToUse) {
      return 'Hello! I\'m your AI tutor. Ask me anything about the course materials!';
    }

    try {
      // Fetch course content summaries to generate personalized welcome
      const contentSummaries = await apiClient.getContentSummaries(courseId);

      if (!contentSummaries || contentSummaries.length === 0) {
        // Create a rich welcome message even without content summaries
        let welcomeMessage = `Hello! Welcome to **${courseToUse.name}**! 🎓\n\n`;

        if (courseToUse.description) {
          welcomeMessage += `**About this course:** ${courseToUse.description}\n\n`;
        }

        welcomeMessage += `I'm your AI tutor for this course. I can help you with:\n\n`;
        welcomeMessage += `📚 **Understanding Concepts** - Ask me to explain any topic\n`;
        welcomeMessage += `💡 **Answering Questions** - Get help with specific doubts\n`;
        welcomeMessage += `📖 **Course Overview** - Ask "What's this course about?"\n`;
        welcomeMessage += `🔍 **Finding Information** - Search through course materials\n\n`;
        welcomeMessage += `Type "help" to see all available commands, or just ask me anything about the course!`;

        return welcomeMessage;
      }

      // Extract key topics and learning objectives
      const allTopics = contentSummaries.flatMap((summary: any) => summary.key_topics || []);
      const uniqueTopics = [...new Set(allTopics)].slice(0, 5); // Get top 5 unique topics

      const allObjectives = contentSummaries.flatMap((summary: any) => summary.learning_objectives || []);
      const uniqueObjectives = [...new Set(allObjectives)].slice(0, 3); // Get top 3 learning objectives

      // Get a brief course overview from the first content summary
      const firstSummary = contentSummaries[0]?.summary_text || '';
      const briefOverview = firstSummary.split('.').slice(0, 2).join('.').trim();

      // Determine content types available
      const contentTypes = [...new Set(contentSummaries.map((s: any) => s.content_type))];
      const hasVideos = contentTypes.includes('video') || contentTypes.includes('youtube');
      const hasPapers = contentTypes.includes('past_paper');
      const hasDocs = contentTypes.includes('pdf') || contentTypes.includes('document');

      // Generate personalized welcome message with course overview
      let welcomeMessage = `Hello! Welcome to **${courseToUse.name}**! 🎓\n\n`;

      // Add brief course description
      if (courseToUse.description) {
        welcomeMessage += `**About this course:** ${courseToUse.description}\n\n`;
      } else if (briefOverview) {
        welcomeMessage += `**Course Overview:** ${briefOverview}.\n\n`;
      }

      // Add key topics if available
      if (uniqueTopics.length > 0) {
        welcomeMessage += `**Key Topics:** ${uniqueTopics.slice(0, 3).join(', ')}`;
        if (uniqueTopics.length > 3) {
          welcomeMessage += `, and ${uniqueTopics.length - 3} more topics`;
        }
        welcomeMessage += `\n\n`;
      }

      // Add learning objectives if available
      if (uniqueObjectives.length > 0) {
        welcomeMessage += `**You will learn to:**\n`;
        uniqueObjectives.forEach(obj => {
          welcomeMessage += `• ${obj}\n`;
        });
        welcomeMessage += `\n`;
      }

      // Add available resources
      welcomeMessage += `**Available Resources:** `;
      const resources = [];
      if (hasDocs) resources.push('📄 Documents');
      if (hasVideos) resources.push('🎥 Videos');
      if (hasPapers) resources.push('📝 Past Papers');
      if (resources.length === 0) resources.push('📚 Study Materials');
      welcomeMessage += resources.join(' | ') + '\n\n';

      // Add call to action
      welcomeMessage += `I'm here to help you master this course! Ask me about specific topics, request explanations, or type "help" to see what I can do.`;

      return welcomeMessage;
    } catch (error) {
      console.error('Failed to generate course welcome message:', error);
      return `Hello! I'm your AI tutor for **${courseToUse.name}**. ${courseToUse.description || ''} Ask me anything about the course materials!`;
    }
  };

  const getContentTypeIcon = (contentType: string | undefined | null) => {
    if (!contentType) {
      return <BookOpen className="h-4 w-4" />;
    }

    switch (contentType.toLowerCase()) {
      case 'pdf':
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'video':
        return <ExternalLink className="h-4 w-4" />;
      default:
        return <BookOpen className="h-4 w-4" />;
    }
  };

  const handleHelpQuery = async (originalQuery: string): Promise<string | null> => {
    if (!courseId || !course) return null;

    // Check if this is a help query (English and Tamil)
    const helpKeywords = [
      // English
      'help me', 'how can you help', 'what can you do', 'how do you work',
      'what are your capabilities', 'how to use', 'guide me', 'assist me',
      'what can i ask', 'how to ask', 'instructions', 'commands',
      // Tamil
      'எனக்கு உதவு', 'நீங்கள் எப்படி உதவ முடியும்', 'நீங்கள் என்ன செய்ய முடியும்',
      'வழிகாட்டு', 'உதவி', 'எப்படி பயன்படுத்துவது', 'அறிவுரை'
    ];

    const isHelpQuery = helpKeywords.some(keyword =>
      originalQuery.toLowerCase().includes(keyword)
    );

    if (!isHelpQuery) return null;

    // Generate help response based on course content
    try {
      const contentSummaries = await apiClient.getContentSummaries(courseId);
      const hasContent = contentSummaries && contentSummaries.length > 0;

      // Check if query is in Tamil to provide Tamil response
      const isTamilQuery = /[\u0B80-\u0BFF]/.test(originalQuery);

      let helpResponse;

      if (isTamilQuery) {
        helpResponse = `வணக்கம்! நான் **${course.name}** பாடத்திற்கான உங்கள் AI ஆசிரியர். நான் உங்களுக்கு எப்படி உதவ முடியும்:\n\n`;
        helpResponse += `📚 **பாட உள்ளடக்கம்**: இந்த பாடத்தில் உள்ள எந்த தலைப்பையும் பற்றி கேளுங்கள்\n`;
        helpResponse += `💡 **விளக்கங்கள்**: கருத்துக்களின் விரிவான விளக்கங்களைப் பெறுங்கள்\n`;
        helpResponse += `❓ **கேள்விகள்**: பாட பொருட்களைப் பற்றி குறிப்பிட்ட கேள்விகள் கேளுங்கள்\n`;
        helpResponse += `📖 **பாட மேலோட்டம்**: "இந்த பாடம் எதைப் பற்றியது?" என்று கேளுங்கள்\n`;

        if (hasContent) {
          const contentTypes = [...new Set(contentSummaries.map((s: any) => s.content_type))];
          helpResponse += `\n📂 **கிடைக்கும் பொருட்கள்**: ${contentTypes.join(', ')}\n`;
        }

        helpResponse += `\n**இப்படி கேள்விகள் கேட்க முயற்சி செய்யுங்கள்:**\n`;
        helpResponse += `• "இந்த பாடம் எதைப் பற்றியது?"\n`;
        helpResponse += `• "[தலைப்பு பெயர்] விளக்குங்கள்"\n`;
        helpResponse += `• "முக்கிய தலைப்புகள் என்னென்ன?"\n`;
        helpResponse += `• "[கருத்து] புரிந்து கொள்ள உதவுங்கள்"\n`;
      } else {
        helpResponse = `Hi! I'm your AI tutor for **${course.name}**. Here's how I can help you:\n\n`;
        helpResponse += `📚 **Course Content**: Ask me about any topic covered in this course\n`;
        helpResponse += `💡 **Explanations**: Get detailed explanations of concepts\n`;
        helpResponse += `❓ **Questions**: Ask specific questions about the materials\n`;
        helpResponse += `📖 **Course Overview**: Ask "What's this course about?" for a summary\n`;

        if (hasContent) {
          const contentTypes = [...new Set(contentSummaries.map((s: any) => s.content_type))];
          helpResponse += `\n📂 **Available Materials**: ${contentTypes.join(', ')}\n`;
        }

        helpResponse += `\n**Try asking questions like:**\n`;
        helpResponse += `• "What's this course about?"\n`;
        helpResponse += `• "Explain [topic name]"\n`;
        helpResponse += `• "What are the key topics?"\n`;
        helpResponse += `• "Help me understand [concept]"\n`;
      }

      return helpResponse;
    } catch (error) {
      console.error('Failed to generate help response:', error);
      return `Hi! I'm your AI tutor for **${course.name}**. I can help you with:\n\n• Understanding course concepts\n• Answering questions about materials\n• Explaining complex topics\n• Providing course overviews\n\nJust ask me anything about the course content!`;
    }
  };

  const handleCourseSummaryQuery = async (originalQuery: string): Promise<string | null> => {
    if (!courseId || !course) return null;

    try {
      // Check if this is a course summary query
      const isSummaryQuery = contentSummaryService.detectCourseSummaryQuery(originalQuery, language);

      if (!isSummaryQuery) return null;

      console.log('🎯 Course summary query detected:', originalQuery);

      // Fetch course materials summaries
      const contentSummaries = await apiClient.getContentSummaries(courseId);
      console.log('📚 Retrieved content summaries:', contentSummaries);

      if (!contentSummaries || contentSummaries.length === 0) {
        // Fallback to regular course info if no summaries available
        return null;
      }

      // Prepare course summary data
      const courseSummaryData = {
        course_name: course.name,
        course_description: course.description || '',
        material_summaries: contentSummaries.map((summary: any) => ({
          content_id: summary.content_id,
          summary_text: summary.summary_text,
          key_topics: summary.key_topics || [],
          content_type: summary.content_type,
          difficulty_level: summary.difficulty_level,
          estimated_reading_time: summary.estimated_reading_time,
          learning_objectives: summary.learning_objectives || []
        })),
        total_materials: contentSummaries.length,
        content_types: [...new Set(contentSummaries.map((s: any) => s.content_type))]
      };

      console.log('🔄 Generating course overview with data:', courseSummaryData);

      // Generate comprehensive course overview
      const courseOverview = await contentSummaryService.generateCourseOverview(
        courseSummaryData,
        language
      );

      console.log('✅ Generated course overview:', courseOverview);
      return courseOverview;

    } catch (error) {
      console.error('Failed to handle course summary query:', error);
      return null;
    }
  };

  const handleClearChat = async () => {
    if (!courseId) {
      // For general chat, just clear local messages
      const welcomeContent = 'Hello! I\'m your AI study assistant. How can I help you today?';
      setMessages([{
        id: '1',
        content: welcomeContent,
        sender: 'assistant',
        timestamp: new Date().toISOString()
      }]);
      return;
    }

    if (confirm('Are you sure you want to clear this chat conversation? This action cannot be undone.')) {
      try {
        await apiClient.clearChatConversation(courseId);
        // Reload chat history (will show welcome message if empty)
        await loadChatHistory(course);
        console.log('Chat conversation cleared successfully');
      } catch (error) {
        console.error('Failed to clear chat conversation:', error);
        alert('Failed to clear chat. Please try again.');
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setLoading(true);

    // Save user message to database if course-specific
    if (courseId) {
      try {
        await apiClient.addChatMessage(courseId, {
          content: userMessage.content,
          sender: 'user'
        });
        console.log('User message saved to database');
      } catch (error) {
        console.error('Failed to save user message:', error);
      }
    }

    try {
      // First, check if this is a help query
      const helpResponse = await handleHelpQuery(userMessage.content);

      if (helpResponse) {
        console.log('🆘 Using help response');
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: helpResponse,
          sender: 'assistant',
          timestamp: new Date().toISOString(),
          sources: []
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Save help message to database if course-specific
        if (courseId) {
          try {
            await apiClient.addChatMessage(courseId, {
              content: helpResponse,
              sender: 'assistant',
              sources: [],
              model_used: 'help_system'
            });
            console.log('Help response saved to database');
          } catch (error) {
            console.error('Failed to save help response:', error);
          }
        }
        return;
      }

      // Next, check if this is a course summary query
      const courseSummaryResponse = await handleCourseSummaryQuery(userMessage.content);

      if (courseSummaryResponse) {
        // Handle course summary query directly
        console.log('📋 Using course summary response');
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: courseSummaryResponse,
          sender: 'assistant',
          timestamp: new Date().toISOString(),
          sources: [] // Course summaries don't have traditional sources
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Save assistant message to database if course-specific
        if (courseId) {
          try {
            await apiClient.addChatMessage(courseId, {
              content: courseSummaryResponse,
              sender: 'assistant',
              sources: [],
              model_used: 'course_summary'
            });
            console.log('Course summary response saved to database');
          } catch (error) {
            console.error('Failed to save course summary response:', error);
          }
        }
        return;
      }

      let queryToSend = userMessage.content;

      // If language is Tamil, translate user query to English first
      if (language === 'ta') {
        console.log('🔄 Translating Tamil query to English:', userMessage.content);
        queryToSend = await translationService.translateTamilToEnglish(userMessage.content);
        console.log('✅ Translated query:', queryToSend);
      }

      const data = await apiClient.post('/chat/quick-chat', {
        content: queryToSend,
        course_id: courseId
      });

      // Debug logging to track source issues
      console.log('🔍 Chat API Response Debug:');
      console.log('Original Query:', userMessage.content);
      console.log('Sent Query:', queryToSend);
      console.log('Course ID:', courseId);
      console.log('AI Response:', data.ai_response?.slice(0, 100) + '...');
      console.log('Sources in response:', data.sources);
      console.log('Sources length:', data.sources?.length || 0);

      let aiResponseContent = data.ai_response || "I apologize, but I couldn't process your request at the moment. Please try again.";

      // If language is Tamil, translate AI response to Tamil
      if (language === 'ta' && data.ai_response) {
        console.log('🔄 Translating AI response to Tamil:', aiResponseContent.slice(0, 100) + '...');
        aiResponseContent = await translationService.translateEnglishToTamil(aiResponseContent);
        console.log('✅ Translated AI response:', aiResponseContent.slice(0, 100) + '...');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponseContent,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        sources: data.sources || []
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to database if course-specific
      if (courseId) {
        try {
          await apiClient.addChatMessage(courseId, {
            content: aiResponseContent,
            sender: 'assistant',
            sources: (data.sources || []).map((s: any) => s.title || s.content_type || 'Unknown'),
            model_used: 'gpt-3.5-turbo' // or get from response data
          });
          console.log('AI response saved to database');
        } catch (error) {
          console.error('Failed to save AI response:', error);
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      let errorContent = "I'm having trouble connecting right now. Please check your internet connection and try again.";

      // Translate error message to Tamil if needed
      if (language === 'ta') {
        try {
          errorContent = await translationService.translateEnglishToTamil(errorContent);
        } catch (translationError) {
          console.error("Failed to translate error message:", translationError);
        }
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: errorContent,
        sender: 'assistant',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);

      // Save error message to database if course-specific
      if (courseId) {
        try {
          await apiClient.addChatMessage(courseId, {
            content: errorContent,
            sender: 'assistant',
            model_used: 'error_response'
          });
          console.log('Error message saved to database');
        } catch (error) {
          console.error('Failed to save error message:', error);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push("/student")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">
                    {course ? 'AI Tutor' : 'AI Study Assistant'}
                  </h1>
                  {course && (
                    <p className="text-sm text-gray-600">{course.name}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                <span>AI Online</span>
              </div>
              {courseId && messages.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearChat}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Chat
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Chat Container */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="bg-white rounded-lg shadow-sm border h-[calc(100vh-200px)] flex flex-col">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-3 ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.sender === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Bot className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                )}
                
                <div className={`max-w-xs lg:max-w-md ${
                  message.sender === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-900'
                } rounded-lg px-4 py-2`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Sources for AI messages */}
                  {message.sender === 'assistant' && message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2">Sources:</p>
                      <div className="flex flex-wrap gap-2">
                        {message.sources.filter(source => source).map((source, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              console.log('Chat - Source clicked:', source);
                              
                              // Determine the best URL to open based on available data
                              let targetUrl = '/student/courses';
                              
                              if (courseId) {
                                // If we have a course ID, go to course materials
                                if (source?.content_type === 'past_paper') {
                                  // For past papers, go to past papers section
                                  targetUrl = `/student/courses/${courseId}/past-papers`;
                                } else if (source?.content_id || source?.metadata?.content_id) {
                                  // If we have a content ID, try to link directly to it
                                  const contentId = source.content_id || source.metadata?.content_id;
                                  targetUrl = `/student/courses/${courseId}#content-${contentId}`;
                                } else {
                                  // Default to course materials page
                                  targetUrl = `/student/courses/${courseId}`;
                                }
                              }
                              
                              console.log('Chat - Opening URL:', targetUrl);
                              window.open(targetUrl, '_blank');
                            }}
                            className="inline-flex items-center space-x-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md px-2 py-1 text-xs text-blue-700 hover:text-blue-800 transition-colors cursor-pointer"
                            title={`Click to view "${source?.title || 'content'}" in course materials`}
                          >
                            <div className="text-blue-500">
                              {getContentTypeIcon(source.content_type)}
                            </div>
                            <span className="font-medium">{source?.title || 'Content'}</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Click on any source to view it in a new tab
                      </p>
                    </div>
                  )}
                  
                  <p className={`text-xs mt-1 ${
                    message.sender === 'user' 
                      ? 'text-blue-100' 
                      : 'text-gray-500'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                
                {message.sender === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Bot className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <Button 
                type="submit" 
                disabled={!inputMessage.trim() || loading}
                className="px-4 py-2"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            
            <div className="mt-2 text-xs text-gray-500 text-center">
              AI responses may not always be accurate. Please verify important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentChat() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading chat...</div>}>
      <ChatContent />
    </Suspense>
  );
}