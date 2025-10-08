"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "../../../lib/store";
import { 
  ArrowLeft,
  Users,
  UserPlus,
  Mail,
  Calendar,
  GraduationCap,
  Clock,
  Check,
  X,
  AlertCircle
} from "lucide-react";

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
  is_active: string;
  institution_id?: string;
}

export default function StudentManagement() {
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuthStore();
  const [students, setStudents] = useState<User[]>([]);
  const [pendingStudents, setPendingStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // Client-side role protection - redirect students away
    if (user && user.role === 'student') {
      console.log('[CLIENT] Student user detected in admin area, redirecting to /student');
      router.push('/student');
      return;
    }
    
    // Wait a bit for auth to fully hydrate before making decisions
    const timer = setTimeout(() => {
      if (!authLoading && !authChecked) {
        setAuthChecked(true);
        if (user && token) {
          fetchStudents();
        } else {
          // If still no user after waiting, redirect to login
          console.log('[CLIENT] No authentication found after initialization, redirecting to login');
          router.push('/login');
        }
      }
    }, 500); // Give more time for auth to hydrate
    
    return () => clearTimeout(timer);
  }, [authLoading, user, token, authChecked]);

  const fetchStudents = async () => {
    try {
      console.log("Current user:", user?.email, user?.role);
      console.log("Current token:", token ? `${token.substring(0, 20)}...` : "null");
      
      // At this point, we know user and token exist (checked in useEffect)

      // Import API client
      const { apiClient } = await import('../../../lib/api');
      
      try {
        // Fetch all students
        const studentsData = await apiClient.getUsers('student');
        console.log("Fetched students:", studentsData); // Debug log
        setStudents(studentsData.filter((user: User) => user.role === 'student' && user.is_active === 'active'));
      } catch (error: any) {
        if (error.status === 401) {
          console.error("Authentication failed. Token may be expired. Redirecting to login.");
          router.push("/login");
          return;
        } else {
          console.error("Failed to fetch students:", error);
        }
      }
      
      try {
        // Fetch pending users  
        const pendingData = await apiClient.getPendingUsers();
        console.log("Fetched pending users:", pendingData); // Debug log
        setPendingStudents(pendingData.pending_users || []);
      } catch (error) {
        console.error("Failed to fetch pending users:", error);
      }
      
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // In a real app, you'd have an invite endpoint
      alert(`Invitation sent to ${inviteEmail}. They can register at /register`);
      setInviteEmail("");
      setShowInviteForm(false);
    } catch (error) {
      console.error("Failed to invite student:", error);
    }
  };

  const handleApproveStudent = async (studentId: string) => {
    try {
      const { apiClient } = await import('../../../lib/api');
      await apiClient.activateUser(studentId);
      
      alert('Student approved successfully!');
      fetchStudents(); // Refresh the lists
    } catch (error) {
      console.error('Failed to approve student:', error);
      alert('Failed to approve student. Please try again.');
    }
  };

  const handleRejectStudent = async (studentId: string) => {
    if (confirm('Are you sure you want to reject this student application? This action cannot be undone.')) {
      try {
        const { apiClient } = await import('../../../lib/api');
        await apiClient.deactivateUser(studentId);
        
        alert('Student application rejected.');
        fetchStudents(); // Refresh the lists
      } catch (error) {
        console.error('Failed to reject student:', error);
        alert('Failed to reject student. Please try again.');
      }
    }
  };

  // Show loading while auth is still loading or data is being fetched or auth not checked yet
  if (authLoading || loading || !authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading students...</p>
        </div>
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
                onClick={() => router.push("/admin")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-2">
                <Users className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Student Management</h1>
              </div>
            </div>
            <Button onClick={() => setShowInviteForm(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Student
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Pending Approvals Section */}
        {pendingStudents.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6 border-b bg-yellow-50">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
                <h2 className="text-xl font-semibold text-yellow-800">
                  Pending Student Approvals ({pendingStudents.length})
                </h2>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                These students have registered and are waiting for approval to access the system.
              </p>
            </div>
            
            <div className="divide-y">
              {pendingStudents.map((student) => (
                <div key={student.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-yellow-100 rounded-full flex items-center justify-center">
                        <span className="text-yellow-600 font-medium text-sm">
                          {student.full_name?.charAt(0).toUpperCase() || student.email?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium">{student.full_name || 'Name not provided'}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Mail className="h-4 w-4 mr-1" />
                            {student.email}
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Applied {new Date(student.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleApproveStudent(student.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectStudent(student.id)}
                        className="border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showInviteForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Invite New Student</h2>
            <form onSubmit={handleInviteStudent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="student@example.com"
                />
              </div>
              <div className="flex space-x-2">
                <Button type="submit">Send Invitation</Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setShowInviteForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Students List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">All Students ({students.length})</h2>
          </div>
          
          {students.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No students found. Invite your first student to get started.</p>
            </div>
          ) : (
            <div className="divide-y">
              {students.map((student) => (
                <div key={student.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium text-sm">
                          {student.full_name?.charAt(0).toUpperCase() || student.email?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium">{student.full_name || student.email || 'Unknown User'}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Mail className="h-4 w-4 mr-1" />
                            {student.email}
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            Joined {new Date(student.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        student.is_active === 'active'
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {student.is_active === 'active' ? 'Active' : 'Inactive'}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/students/${student.id}/progress`)}
                      >
                        <GraduationCap className="h-4 w-4 mr-1" />
                        View Progress
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}