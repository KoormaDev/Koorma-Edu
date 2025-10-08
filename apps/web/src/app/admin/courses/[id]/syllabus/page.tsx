'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Plus, 
  FileText, 
  Upload, 
  Edit2, 
  Trash2,
  ChevronDown,
  ChevronRight,
  Save,
  X
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
  description: string;
  exam_type: string;
}

interface Syllabus {
  id: string;
  course_id: string;
  title: string;
  description: string;
  version: string;
  items: SyllabusItem[];
}

interface SyllabusItem {
  id: string;
  syllabus_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  item_type: 'subject' | 'topic' | 'subtopic';
  order_index: number;
  depth_level: number;
  children?: SyllabusItem[];
}

export default function SyllabusManagement({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [syllabusItems, setSyllabusItems] = useState<SyllabusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateSyllabus, setShowCreateSyllabus] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<SyllabusItem | null>(null);
  const [editingSyllabus, setEditingSyllabus] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const [syllabusForm, setSyllabusForm] = useState({
    title: '',
    description: '',
    version: '1.0'
  });
  const [syllabusDocument, setSyllabusDocument] = useState<File | null>(null);

  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    item_type: 'subject' as 'subject' | 'topic' | 'subtopic'
  });

  const [editForm, setEditForm] = useState({
    title: '',
    description: ''
  });

  useEffect(() => {
    fetchCourseAndSyllabus();
  }, [params.id]);

  const fetchCourseAndSyllabus = async () => {
    try {
      setIsLoading(true);
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);

      try {
        const syllabusData = await apiClient.getCourseSyllabus(params.id);
        setSyllabus(syllabusData);
        
        if (syllabusData) {
          const itemsData = await apiClient.getSyllabusItems(syllabusData.id);
          setSyllabusItems(buildHierarchy(itemsData));
        }
      } catch (syllabusError: any) {
        if (syllabusError.status !== 404) {
          console.error('Failed to fetch syllabus:', syllabusError);
        }
      }
    } catch (error) {
      console.error('Failed to fetch course:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const buildHierarchy = (items: SyllabusItem[]): SyllabusItem[] => {
    const itemMap = new Map<string, SyllabusItem>();
    const rootItems: SyllabusItem[] = [];

    // First pass: create map of all items
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build hierarchy
    items.forEach(item => {
      const itemWithChildren = itemMap.get(item.id)!;
      
      if (item.parent_id && itemMap.has(item.parent_id)) {
        const parent = itemMap.get(item.parent_id)!;
        parent.children = parent.children || [];
        parent.children.push(itemWithChildren);
      } else {
        rootItems.push(itemWithChildren);
      }
    });

    // Sort by order_index
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

  const handleCreateSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const syllabusData = await apiClient.createSyllabusWithDocument({
        course_id: params.id,
        ...syllabusForm,
        document: syllabusDocument || undefined
      });
      setSyllabus(syllabusData);
      setShowCreateSyllabus(false);
      setSyllabusForm({ title: '', description: '', version: '1.0' });
      setSyllabusDocument(null);
    } catch (error) {
      console.error('Failed to create syllabus:', error);
      alert('Failed to create syllabus. Please try again.');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syllabus) return;

    try {
      await apiClient.createSyllabusItem(syllabus.id, {
        ...itemForm,
        parent_id: selectedParent,
        order_index: 0
      });
      
      setShowAddItem(false);
      setItemForm({ title: '', description: '', item_type: 'subject' });
      setSelectedParent(null);
      fetchCourseAndSyllabus();
    } catch (error) {
      console.error('Failed to add syllabus item:', error);
      alert('Failed to add item. Please try again.');
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      await apiClient.updateSyllabusItem(editingItem.id, editForm);
      setEditingItem(null);
      setEditForm({ title: '', description: '' });
      fetchCourseAndSyllabus();
    } catch (error) {
      console.error('Failed to update syllabus item:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  const handleDeleteItem = async (itemId: string, itemTitle: string) => {
    if (confirm(`Are you sure you want to delete "${itemTitle}"? This will also delete all sub-items.`)) {
      try {
        await apiClient.deleteSyllabusItem(itemId);
        fetchCourseAndSyllabus();
      } catch (error) {
        console.error('Failed to delete syllabus item:', error);
        alert('Failed to delete item. Please try again.');
      }
    }
  };

  const handleEditSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syllabus) return;

    try {
      const updatedSyllabus = await apiClient.updateSyllabus(syllabus.id, syllabusForm);
      setSyllabus(updatedSyllabus);
      setEditingSyllabus(false);
      setSyllabusForm({ title: '', description: '', version: '1.0' });
    } catch (error) {
      console.error('Failed to update syllabus:', error);
      alert('Failed to update syllabus. Please try again.');
    }
  };

  const handleDeleteSyllabus = async () => {
    if (!syllabus) return;
    if (confirm(`Are you sure you want to delete the entire syllabus "${syllabus.title}"? This will delete all curriculum items and cannot be undone.`)) {
      try {
        await apiClient.deleteSyllabus(syllabus.id);
        setSyllabus(null);
        setSyllabusItems([]);
      } catch (error) {
        console.error('Failed to delete syllabus:', error);
        alert('Failed to delete syllabus. Please try again.');
      }
    }
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

  const getItemTypeColor = (type: string) => {
    switch (type) {
      case 'subject': return 'bg-blue-100 text-blue-800';
      case 'topic': return 'bg-green-100 text-green-800';
      case 'subtopic': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderSyllabusItem = (item: SyllabusItem, depth: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.id} className="border-l-2 border-gray-200">
        <div 
          className={`flex items-center space-x-3 p-3 hover:bg-gray-50 ${
            depth > 0 ? `ml-${depth * 6}` : ''
          }`}
        >
          <div className="flex items-center space-x-2 flex-1">
            {hasChildren && (
              <button
                onClick={() => toggleExpand(item.id)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
            
            <div className="flex items-center space-x-2 flex-1">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getItemTypeColor(item.item_type)}`}>
                {item.item_type}
              </span>
              <span className="font-medium">{item.title}</span>
              {item.description && (
                <span className="text-gray-500 text-sm">- {item.description}</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedParent(item.id);
                setItemForm({ 
                  title: '', 
                  description: '', 
                  item_type: item.item_type === 'subject' ? 'topic' : 'subtopic' 
                });
                setShowAddItem(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingItem(item);
                setEditForm({
                  title: item.title,
                  description: item.description || ''
                });
              }}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteItem(item.id, item.title)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="ml-4">
            {item.children!.map(child => renderSyllabusItem(child, depth + 1))}
          </div>
        )}
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
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/admin/courses')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Courses
              </Button>
              <div className="flex items-center space-x-2">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Syllabus Management</h1>
                  <p className="text-gray-600">{course?.name}</p>
                </div>
              </div>
            </div>
            
            {syllabus && (
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => setShowAddItem(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!syllabus ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Syllabus Found</h2>
            <p className="text-gray-600 mb-6">
              This course doesn't have a syllabus yet. Create one to start structuring the curriculum.
            </p>
            <Button
              onClick={() => setShowCreateSyllabus(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Syllabus
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Syllabus Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold">{syllabus.title}</h2>
                  <p className="text-gray-600 mt-1">{syllabus.description}</p>
                  <span className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm mt-2">
                    Version {syllabus.version}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSyllabusForm({
                        title: syllabus.title,
                        description: syllabus.description,
                        version: syllabus.version
                      });
                      setEditingSyllabus(true);
                    }}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Details
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleDeleteSyllabus}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Syllabus
                  </Button>
                </div>
              </div>
            </div>

            {/* Syllabus Items */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Curriculum Structure</h3>
              </div>
              
              {syllabusItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="mb-4">No curriculum items added yet.</p>
                  <Button
                    onClick={() => setShowAddItem(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Subject
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {syllabusItems.map(item => renderSyllabusItem(item))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Item Modal */}
        {editingItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Edit Item</h3>
              <form onSubmit={handleEditItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editForm.title}
                    onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setEditingItem(null);
                      setEditForm({ title: '', description: '' });
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Syllabus Modal */}
        {editingSyllabus && syllabus && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Edit Syllabus Details</h3>
              <form onSubmit={handleEditSyllabus} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={syllabusForm.title}
                    onChange={(e) => setSyllabusForm({...syllabusForm, title: e.target.value})}
                    placeholder="e.g., UPSC Civil Services Syllabus"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={syllabusForm.description}
                    onChange={(e) => setSyllabusForm({...syllabusForm, description: e.target.value})}
                    placeholder="Brief description of the syllabus"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Version</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={syllabusForm.version}
                    onChange={(e) => setSyllabusForm({...syllabusForm, version: e.target.value})}
                  />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingSyllabus(false);
                      setSyllabusForm({ title: '', description: '', version: '1.0' });
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Syllabus Modal */}
        {showCreateSyllabus && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Create Syllabus</h3>
              <form onSubmit={handleCreateSyllabus} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={syllabusForm.title}
                    onChange={(e) => setSyllabusForm({...syllabusForm, title: e.target.value})}
                    placeholder="e.g., UPSC Civil Services Syllabus"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={syllabusForm.description}
                    onChange={(e) => setSyllabusForm({...syllabusForm, description: e.target.value})}
                    placeholder="Brief description of the syllabus"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Version</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={syllabusForm.version}
                    onChange={(e) => setSyllabusForm({...syllabusForm, version: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Syllabus Document (Optional)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => setSyllabusDocument(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported formats: PDF, Word documents, Text files
                  </p>
                  {syllabusDocument && (
                    <p className="text-sm text-green-600 mt-1 flex items-center">
                      <Upload className="h-4 w-4 mr-1" />
                      Selected: {syllabusDocument.name}
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <Button type="submit">Create</Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowCreateSyllabus(false);
                      setSyllabusForm({ title: '', description: '', version: '1.0' });
                      setSyllabusDocument(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                Add {selectedParent ? 'Sub-item' : 'New Item'}
              </h3>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={itemForm.item_type}
                    onChange={(e) => setItemForm({...itemForm, item_type: e.target.value as any})}
                  >
                    <option value="subject">Subject</option>
                    <option value="topic">Topic</option>
                    <option value="subtopic">Sub-topic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={itemForm.title}
                    onChange={(e) => setItemForm({...itemForm, title: e.target.value})}
                    placeholder="e.g., Indian Polity"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={itemForm.description}
                    onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit">
                    <Save className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowAddItem(false);
                      setSelectedParent(null);
                      setItemForm({ title: '', description: '', item_type: 'subject' });
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}