'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  Mail, 
  Upload, 
  Search,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Copy,
  ExternalLink
} from 'lucide-react';

interface Course {
  id: string;
  name: string;
}

interface Student {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  enrollment_status: 'active' | 'completed' | 'dropped';
  enrolled_at: string;
  completed_at?: string;
}

interface InvitedStudent {
  id: string;
  email: string;
  full_name?: string;
  status: 'pending' | 'accepted' | 'expired';
  invited_at: string;
}

export default function StudentsManagement({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InvitedStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [inviteForm, setInviteForm] = useState({
    email: '',
    full_name: ''
  });

  const [bulkEmails, setBulkEmails] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastInvitationUrl, setLastInvitationUrl] = useState<string | null>(null);
  const [showInvitationUrl, setShowInvitationUrl] = useState(false);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const courseData = await apiClient.getCourse(params.id);
      setCourse(courseData);

      // Fetch enrolled students
      try {
        const enrollments = await apiClient.get(`/courses/${params.id}/enrollments`);
        
        // Transform enrollment data to student format for the UI
        const enrolledStudents: Student[] = [];
        
        for (const enrollment of enrollments) {
          // If the enrollment has student data embedded, use it
          if (enrollment.student) {
            enrolledStudents.push({
              id: enrollment.student_id,
              email: enrollment.student.email || '',
              full_name: enrollment.student.full_name || enrollment.student.email || 'Student',
              phone_number: enrollment.student.phone_number,
              enrollment_status: enrollment.enrollment_status || 'active',
              enrolled_at: enrollment.enrolled_at
            });
          } else {
            // If no student data embedded, fetch it separately
            try {
              const studentData = await apiClient.get(`/auth/users/${enrollment.student_id}`);
              enrolledStudents.push({
                id: enrollment.student_id,
                email: studentData.email || '',
                full_name: studentData.full_name || studentData.email || 'Student',
                phone_number: studentData.phone_number,
                enrollment_status: enrollment.enrollment_status || 'active',
                enrolled_at: enrollment.enrolled_at
              });
            } catch (studentError) {
              console.error(`Failed to fetch student ${enrollment.student_id}:`, studentError);
              // Fall back to basic info
              enrolledStudents.push({
                id: enrollment.student_id,
                email: 'Unknown Email',
                full_name: 'Unknown Student',
                phone_number: null,
                enrollment_status: enrollment.enrollment_status || 'active',
                enrolled_at: enrollment.enrolled_at
              });
            }
          }
        }
        
        setStudents(enrolledStudents);
      } catch (error) {
        console.error('Failed to fetch enrollments:', error);
        // Set empty array if no enrollments found
        setStudents([]);
      }

      // Fetch real invitations
      try {
        const invitations = await apiClient.getCourseInvitations(params.id, 'pending');
        const invitesList: InvitedStudent[] = invitations.map((invite: any) => ({
          id: invite.id,
          email: invite.email,
          full_name: invite.full_name,
          status: invite.status,
          invited_at: invite.invited_at
        }));
        setPendingInvites(invitesList);
      } catch (error) {
        console.error('Failed to fetch invitations:', error);
        setPendingInvites([]);
      }

    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiClient.inviteStudent(params.id, {
        email: inviteForm.email,
        full_name: inviteForm.full_name || undefined
      });
      
      // Show the invitation URL
      if (response.invitation_url) {
        setLastInvitationUrl(response.invitation_url);
        setShowInvitationUrl(true);
      }
      
      setShowInviteModal(false);
      setInviteForm({ email: '', full_name: '' });
      fetchData(); // Refresh data to show new invitation
      
    } catch (error) {
      console.error('Failed to send invite:', error);
      alert('Failed to send invitation. Please try again.');
    }
  };

  const handleBulkInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const emails = bulkEmails.split('\n').filter(email => email.trim());
      
      await apiClient.bulkInviteStudents(params.id, {
        emails: emails.map(email => email.trim())
      });
      
      setShowBulkUpload(false);
      setBulkEmails('');
      fetchData(); // Refresh data to show new invitations
      
      alert(`Sent ${emails.length} invitations!`);
    } catch (error) {
      console.error('Failed to send bulk invites:', error);
      alert('Failed to send bulk invitations. Please try again.');
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      // This would parse CSV and send invites
      console.log('Processing CSV file:', selectedFile.name);
      alert('CSV upload functionality would be implemented here');
      setSelectedFile(null);
      setShowBulkUpload(false);
    } catch (error) {
      console.error('Failed to process CSV:', error);
      alert('Failed to process CSV file. Please try again.');
    }
  };

  const handleResendInvitation = async (inviteId: string, email: string) => {
    try {
      // Cancel the old invitation and create a new one
      await apiClient.cancelInvitation(params.id, inviteId);
      await apiClient.inviteStudent(params.id, { email });
      
      fetchData(); // Refresh data
      alert(`Invitation resent to ${email}!`);
    } catch (error) {
      console.error('Failed to resend invitation:', error);
      alert('Failed to resend invitation. Please try again.');
    }
  };

  const handleCancelInvitation = async (inviteId: string, email: string) => {
    if (!confirm(`Are you sure you want to cancel the invitation to ${email}?`)) {
      return;
    }
    
    try {
      await apiClient.cancelInvitation(params.id, inviteId);
      fetchData(); // Refresh data
      alert(`Invitation to ${email} has been cancelled.`);
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
      alert('Failed to cancel invitation. Please try again.');
    }
  };

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to remove ${studentName} from this course?`)) {
      return;
    }
    
    try {
      // Call API to remove student from course
      console.log(`Attempting to remove student: DELETE /courses/${params.id}/enrollments/${studentId}`);
      await apiClient.delete(`/courses/${params.id}/enrollments/${studentId}`);
      fetchData(); // Refresh data
      alert(`${studentName} has been removed from the course.`);
    } catch (error: any) {
      console.error('Failed to remove student:', error);
      const errorMessage = error?.message || error?.detail || 'Unknown error occurred';
      const statusCode = error?.status || error?.response?.status || 'Unknown';
      alert(`Failed to remove student (Error ${statusCode}): ${errorMessage}. Please try again.`);
    }
  };

  const filteredStudents = students.filter(student =>
    student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'dropped': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'accepted':
        return <CheckCircle className="h-4 w-4" />;
      case 'dropped':
      case 'expired':
        return <XCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
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
                <Users className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Student Management</h1>
                  <p className="text-gray-600">{course?.name}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => setShowBulkUpload(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Bulk Invite
              </Button>
              <Button onClick={() => setShowInviteModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Invite Student
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Total Enrolled</p>
            <p className="text-2xl font-semibold">{students.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Active Students</p>
            <p className="text-2xl font-semibold">
              {students.filter(s => s.enrollment_status === 'active').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Completed</p>
            <p className="text-2xl font-semibold">
              {students.filter(s => s.enrollment_status === 'completed').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Pending Invites</p>
            <p className="text-2xl font-semibold text-yellow-600">{pendingInvites.length}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search students by name or email..."
                className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export List
            </Button>
          </div>
        </div>

        {/* Pending Invitations */}
        {pendingInvites.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold flex items-center">
                <Clock className="h-5 w-5 mr-2 text-yellow-500" />
                Pending Invitations ({pendingInvites.length})
              </h2>
            </div>
            
            <div className="divide-y">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{invite.full_name || 'Name not provided'}</p>
                    <p className="text-gray-600">{invite.email}</p>
                    <p className="text-sm text-gray-500">
                      Invited: {new Date(invite.invited_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center ${getStatusColor(invite.status)}`}>
                      {getStatusIcon(invite.status)}
                      <span className="ml-1">{invite.status}</span>
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleResendInvitation(invite.id, invite.email)}
                    >
                      Resend
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleCancelInvitation(invite.id, invite.email)}
                      className="text-red-600 border-red-300 hover:bg-red-50"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enrolled Students */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Enrolled Students ({filteredStudents.length})</h2>
          </div>
          
          {filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">
                {searchTerm ? 'No students found matching your search.' : 'No students enrolled yet.'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setShowInviteModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite First Student
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredStudents.map((student) => (
                <div key={student.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="p-2 bg-blue-100 rounded-full">
                        <Users className="h-5 w-5 text-blue-600" />
                      </div>
                      
                      <div>
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-lg font-medium">{student.full_name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center ${getStatusColor(student.enrollment_status)}`}>
                            {getStatusIcon(student.enrollment_status)}
                            <span className="ml-1">{student.enrollment_status}</span>
                          </span>
                        </div>
                        
                        <p className="text-gray-600 mb-2">{student.email}</p>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>Enrolled: {new Date(student.enrolled_at).toLocaleDateString()}</span>
                          {student.phone_number && (
                            <span>Phone: {student.phone_number}</span>
                          )}
                          {student.completed_at && (
                            <span>Completed: {new Date(student.completed_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        View Progress
                      </Button>
                      <Button variant="outline" size="sm">
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRemoveStudent(student.id, student.full_name)}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite Student Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Invite Student</h3>
              
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})}
                    placeholder="student@example.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name (Optional)</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={inviteForm.full_name}
                    onChange={(e) => setInviteForm({...inviteForm, full_name: e.target.value})}
                    placeholder="Student Name"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Invitation will include:</strong>
                  </p>
                  <ul className="text-sm text-blue-700 mt-2 space-y-1">
                    <li>• Course name and description</li>
                    <li>• Registration link</li>
                    <li>• Instructions to set up account</li>
                  </ul>
                </div>
                
                <div className="flex space-x-2">
                  <Button type="submit">
                    <Mail className="h-4 w-4 mr-2" />
                    Send Invitation
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteForm({ email: '', full_name: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bulk Upload Modal */}
        {showBulkUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
              <h3 className="text-lg font-semibold mb-4">Bulk Invite Students</h3>
              
              <div className="space-y-6">
                {/* Email List Method */}
                <div>
                  <h4 className="font-medium mb-2">Method 1: Email List</h4>
                  <form onSubmit={handleBulkInvite}>
                    <label className="block text-sm font-medium mb-1">
                      Email Addresses (one per line)
                    </label>
                    <textarea
                      rows={6}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={bulkEmails}
                      onChange={(e) => setBulkEmails(e.target.value)}
                      placeholder={`student1@example.com\nstudent2@example.com\nstudent3@example.com`}
                    />
                    <div className="flex justify-end mt-2">
                      <Button type="submit">
                        Send Invitations
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium mb-2">Method 2: CSV Upload</h4>
                  <form onSubmit={handleFileUpload}>
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-1">
                        Upload CSV File
                      </label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        CSV should have columns: email, full_name (optional)
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 border rounded-lg p-3 mb-4">
                      <p className="text-sm font-medium mb-1">CSV Format Example:</p>
                      <code className="text-xs text-gray-600">
                        email,full_name<br/>
                        john@example.com,John Doe<br/>
                        jane@example.com,Jane Smith
                      </code>
                    </div>
                    
                    <div className="flex justify-end">
                      <Button type="submit" disabled={!selectedFile}>
                        <Upload className="h-4 w-4 mr-2" />
                        Process CSV
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowBulkUpload(false);
                      setBulkEmails('');
                      setSelectedFile(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invitation URL Modal */}
        {showInvitationUrl && lastInvitationUrl && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Invitation Sent Successfully!</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  The invitation has been sent. Share this link with the student to complete their registration:
                </p>
                
                <div className="bg-gray-50 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 mr-3">
                      <p className="text-sm font-medium text-gray-700 mb-1">Invitation Link:</p>
                      <p className="text-sm text-blue-600 font-mono break-all">
                        {lastInvitationUrl}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(lastInvitationUrl);
                          alert('Invitation URL copied to clipboard!');
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(lastInvitationUrl, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">What happens next:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Share this link with the student via email, message, or any preferred method</li>
                    <li>• The student will click the link to access the invitation page</li>
                    <li>• They will fill out their details and create their account password</li>
                    <li>• Once accepted, they will be automatically enrolled in the course</li>
                    <li>• The link expires in 7 days for security</li>
                  </ul>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowInvitationUrl(false);
                    setLastInvitationUrl(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(lastInvitationUrl);
                    alert('Invitation URL copied to clipboard!');
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link & Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}