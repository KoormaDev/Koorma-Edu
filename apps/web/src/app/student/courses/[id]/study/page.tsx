'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { handleContentView } from '../../../../../lib/content-viewer';
import { usePageTimeTracking } from '../../../../../hooks/usePageTimeTracking';
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Video,
  Link,
  Download,
  PlayCircle,
  ChevronRight,
  ChevronDown,
  Eye,
  Clock,
  CheckCircle,
  Star,
  MessageSquare,
  Check,
  Circle,
  Timer
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
}

interface SyllabusItem {
  id: string;
  title: string;
  description: string;
  item_type: 'subject' | 'topic' | 'subtopic';
  order_index: number;
  depth_level: number;
  children?: SyllabusItem[];
}

interface StudyMaterial {
  id: string;
  title: string;
  description: string;
  content_type: 'text' | 'video' | 'document' | 'website' | 'pdf' | 'youtube';
  language: string;
  file_path?: string;
  source_url?: string;
  external_url?: string;
  content_text?: string;
  status: string;
  created_at: string;
  syllabus_item_id?: string;
}

export default function StudyPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [syllabusItems, setSyllabusItems] = useState<SyllabusItem[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [materialProgress, setMaterialProgress] = useState<Record<string, any>>({});
  const [activeSession, setActiveSession] = useState<any>(null);

  // Track time on study materials page
  usePageTimeTracking({
    pageType: 'material',
    contentId: selectedItem || undefined
  });

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch course data
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);

      // Fetch syllabus and materials
      try {
        const syllabusData = await apiClient.getCourseSyllabus(params.id);
        if (syllabusData) {
          const itemsData = await apiClient.getSyllabusItems(syllabusData.id);
          setSyllabusItems(buildHierarchy(itemsData));
        }
      } catch (error) {
        console.log('No syllabus found');
      }

      // Fetch all materials for this course
      const materialsData = await apiClient.getContent({ course_id: params.id });
      // Include both active and published materials (materials are saved as 'active' in database)
      const filteredMaterials = materialsData.filter((m: StudyMaterial) =>
        m.status === 'published' || m.status === 'active'
      );
      setMaterials(filteredMaterials);

      // Load progress for all materials
      await loadMaterialProgress(filteredMaterials);

    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const buildHierarchy = (items: SyllabusItem[]): SyllabusItem[] => {
    const itemMap = new Map<string, SyllabusItem>();
    const rootItems: SyllabusItem[] = [];

    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    items.forEach(item => {
      const itemWithChildren = itemMap.get(item.id)!;
      
      if (item.syllabus_item_id && itemMap.has(item.syllabus_item_id)) {
        const parent = itemMap.get(item.syllabus_item_id)!;
        parent.children = parent.children || [];
        parent.children.push(itemWithChildren);
      } else {
        rootItems.push(itemWithChildren);
      }
    });

    const sortItems = (items: SyllabusItem[]) => {
      items.sort((a, b) => a.order_index - b.order_index);
      items.forEach(item => {
        if (item.children) {
          sortItems(item.children);
        }
      });
    };

    sortItems(rootItems);
    return rootItems;
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItem(itemId);
    // Auto-expand when selected
    setExpandedItems(prev => new Set([...prev, itemId]));
  };

  // Progress tracking functions
  const loadMaterialProgress = async (materials: StudyMaterial[]) => {
    try {
      const progressPromises = materials.map(async (material) => {
        try {
          const progress = await apiClient.getMaterialProgress(material.id);
          return { materialId: material.id, progress };
        } catch (error) {
          // If no progress exists, return default
          return {
            materialId: material.id,
            progress: {
              is_completed: false,
              completion_percentage: 0,
              time_spent_minutes: 0
            }
          };
        }
      });

      const progressResults = await Promise.all(progressPromises);
      const progressMap: Record<string, any> = {};

      progressResults.forEach(({ materialId, progress }) => {
        progressMap[materialId] = progress;
      });

      setMaterialProgress(progressMap);
    } catch (error) {
      console.error('Failed to load material progress:', error);
    }
  };

  const toggleMaterialCompletion = async (materialId: string) => {
    try {
      const currentProgress = materialProgress[materialId];
      const newCompletionStatus = !currentProgress?.is_completed;

      const updatedProgress = await apiClient.updateMaterialProgress(materialId, {
        is_completed: newCompletionStatus
      });

      setMaterialProgress(prev => ({
        ...prev,
        [materialId]: updatedProgress
      }));
    } catch (error) {
      console.error('Failed to update material progress:', error);
    }
  };

  const startStudySession = async (materialId: string) => {
    try {
      const session = await apiClient.startStudySession({
        content_id: materialId,
        course_id: params.id,
        session_type: 'study'
      });
      setActiveSession(session);
    } catch (error) {
      console.error('Failed to start study session:', error);
    }
  };

  const endCurrentSession = async () => {
    if (activeSession) {
      try {
        await apiClient.endStudySession(activeSession.id);
        setActiveSession(null);
        // Reload progress to show updated time
        if (materials.length > 0) {
          await loadMaterialProgress(materials);
        }
      } catch (error) {
        console.error('Failed to end study session:', error);
      }
    }
  };

  const getMaterialsForItem = (itemId: string) => {
    // Convert both to strings to ensure proper comparison
    return materials.filter(m => String(m.syllabus_item_id) === String(itemId));
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'document':
      case 'pdf': return <FileText className="h-4 w-4" />;
      case 'video':
      case 'youtube': return <Video className="h-4 w-4" />;
      case 'website':
      case 'url': return <Link className="h-4 w-4" />;
      case 'text': return <BookOpen className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getItemTypeColor = (type: string) => {
    switch (type) {
      case 'subject': return 'bg-blue-100 text-blue-800';
      case 'topic': return 'bg-green-100 text-green-800';
      case 'subtopic': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleViewMaterial = (material: StudyMaterial) => {
    // Use the content viewer utility for consistent behavior
    handleContentView(material);
  };

  const handleDownload = async (material: StudyMaterial) => {
    if (material.file_path) {
      try {
        // Get auth token from cookie storage (same as API client)
        const getCookie = (name: string): string | null => {
          if (typeof document === 'undefined') return null;
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
          return null;
        };
        
        const authStoreCookie = getCookie('auth-store');
        let authToken = null;
        
        if (authStoreCookie) {
          try {
            const parsed = JSON.parse(decodeURIComponent(authStoreCookie));
            authToken = parsed.state?.token || null;
          } catch (e) {
            console.error('Error parsing auth store cookie:', e);
          }
        }
        
        // Fallback to localStorage if cookie method fails
        if (!authToken) {
          const token = localStorage.getItem('auth-store');
          authToken = token ? JSON.parse(token).state?.token : null;
        }
        
        const baseUrl = 'https://13.53.207.48';
        const response = await fetch(`${baseUrl}/api/v1/content/download/${material.file_path}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Download failed');
        }
        
        // Get the filename from Content-Disposition header or extract from file path
        const contentDisposition = response.headers.get('content-disposition');
        let filename = material.title; // fallback
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        } else {
          // Extract original filename from file path (after timestamp prefix)
          const pathParts = material.file_path.split('/');
          const fileWithTimestamp = pathParts[pathParts.length - 1];
          const underscoreIndex = fileWithTimestamp.indexOf('_');
          if (underscoreIndex > 0) {
            filename = fileWithTimestamp.substring(underscoreIndex + 1);
          }
          
          // Ensure extension is present
          if (!filename.includes('.')) {
            // Add extension based on content type
            const extensionMap: {[key: string]: string} = {
              'pdf': '.pdf',
              'docx': '.docx',
              'xlsx': '.xlsx',
              'document': '.pdf'
            };
            const ext = extensionMap[material.content_type] || '.pdf';
            filename = filename + ext;
          }
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (error) {
        console.error('Download failed:', error);
        alert('Failed to download file. Please try again.');
      }
    }
  };

  const renderSyllabusItem = (item: SyllabusItem, depth: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isSelected = selectedItem === item.id;
    const itemMaterials = getMaterialsForItem(item.id);

    return (
      <div key={item.id} className={`border-l-2 ${isSelected ? 'border-blue-500' : 'border-gray-200'}`}>
        <div 
          className={`flex items-center space-x-3 p-3 cursor-pointer hover:bg-gray-50 ${
            isSelected ? 'bg-blue-50' : ''
          } ${depth > 0 ? `ml-${depth * 4}` : ''}`}
          onClick={() => handleSelectItem(item.id)}
        >
          <div className="flex items-center space-x-2">
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(item.id);
                }}
                className="p-1 hover:bg-gray-200 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
            
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getItemTypeColor(item.item_type)}`}>
              {item.item_type}
            </span>
            <span className="font-medium">{item.title}</span>
            {itemMaterials.length > 0 && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                {itemMaterials.length} materials
              </span>
            )}
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {item.children!.map(child => renderSyllabusItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderMaterialCard = (material: StudyMaterial) => {
    const progress = materialProgress[material.id];
    const isCompleted = progress?.is_completed || false;
    const timeSpent = progress?.time_spent_minutes || 0;

    return (
      <div key={material.id} className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${isCompleted ? 'ring-2 ring-green-200' : ''}`}>
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            {getContentIcon(material.content_type)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <h3 className="font-medium truncate">{material.title}</h3>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {material.content_type}
                </span>
                {isCompleted && (
                  <span className="flex items-center text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Completed
                  </span>
                )}
              </div>

              <Button
                variant={isCompleted ? "default" : "outline"}
                size="sm"
                onClick={() => toggleMaterialCompletion(material.id)}
                className={isCompleted ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {isCompleted ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Done
                  </>
                ) : (
                  <>
                    <Circle className="h-4 w-4 mr-1" />
                    Mark Done
                  </>
                )}
              </Button>
            </div>

            <p className="text-gray-600 text-sm mb-2">{material.description}</p>

            {/* Progress info */}
            <div className="flex items-center space-x-4 mb-3 text-sm text-gray-500">
              {timeSpent > 0 && (
                <div className="flex items-center">
                  <Timer className="h-4 w-4 mr-1" />
                  {Math.floor(timeSpent / 60)}h {timeSpent % 60}m studied
                </div>
              )}
              {activeSession?.content_id === material.id && (
                <div className="flex items-center text-green-600">
                  <Clock className="h-4 w-4 mr-1" />
                  Study session active
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await startStudySession(material.id);
                  handleViewMaterial(material);
                }}
              >
                <Eye className="h-4 w-4 mr-1" />
                Study
              </Button>

              {(material.content_type === 'document' || material.content_type === 'pdf' || material.content_type === 'docx' || material.content_type === 'xlsx') && material.file_path && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(material)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              )}

              {(material.content_type === 'video' || material.content_type === 'youtube') && (material.external_url || material.source_url) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await startStudySession(material.id);
                    handleContentView(material);
                  }}
                >
                  <PlayCircle className="h-4 w-4 mr-1" />
                  Watch
                </Button>
              )}

              {material.content_type === 'website' && (material.external_url || material.source_url) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await startStudySession(material.id);
                    handleContentView(material);
                  }}
                >
                  <Link className="h-4 w-4 mr-1" />
                  Visit
                </Button>
              )}

              {activeSession?.content_id === material.id && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={endCurrentSession}
                >
                  End Session
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
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
                <BookOpen className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Study Materials</h1>
                  <p className="text-gray-600">{course?.name}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => router.push('/student/chat')}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask AI Tutor
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Syllabus Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Course Syllabus</h2>
              </div>
              
              {syllabusItems.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No syllabus structure available</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {syllabusItems.map(item => renderSyllabusItem(item))}
                </div>
              )}
            </div>
          </div>

          {/* Study Materials */}
          <div className="lg:col-span-2">
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Published Materials</p>
                  <p className="text-2xl font-semibold">{materials.length}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Documents</p>
                  <p className="text-2xl font-semibold">
                    {materials.filter(m => m.content_type === 'document' || m.content_type === 'pdf' || m.content_type === 'docx').length}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Videos</p>
                  <p className="text-2xl font-semibold">
                    {materials.filter(m => m.content_type === 'video' || m.content_type === 'youtube').length}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Progress</p>
                  <p className="text-2xl font-semibold text-green-600">
                    {materials.length > 0
                      ? Math.round((Object.values(materialProgress).filter(p => p?.is_completed).length / materials.length) * 100)
                      : 0}%
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Course Progress</h3>
                  <span className="text-sm text-gray-600">
                    {Object.values(materialProgress).filter(p => p?.is_completed).length} of {materials.length} completed
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all duration-300"
                    style={{
                      width: `${materials.length > 0
                        ? (Object.values(materialProgress).filter(p => p?.is_completed).length / materials.length) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              {/* Active Session Alert */}
              {activeSession && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Clock className="h-5 w-5 text-green-600 mr-2" />
                      <span className="font-medium text-green-800">Study session active</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={endCurrentSession}
                      className="border-green-300 text-green-700 hover:bg-green-100"
                    >
                      End Session
                    </Button>
                  </div>
                </div>
              )}

              {/* Materials List */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">
                    {selectedItem ? 'Materials for Selected Topic' : 'All Study Materials'}
                  </h2>
                  {selectedItem && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedItem(null)}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Show All Materials
                    </Button>
                  )}
                </div>
                
                {materials.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center">
                    <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-semibold mb-2">No Study Materials</h3>
                    <p className="text-gray-600">
                      Study materials haven't been uploaded yet. Check back later.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(selectedItem 
                      ? getMaterialsForItem(selectedItem)
                      : materials
                    ).map(material => renderMaterialCard(material))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}