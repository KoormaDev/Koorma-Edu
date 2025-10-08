'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api';
import { Button } from "@/components/ui/button";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  User, 
  Mail, 
  BookOpen, 
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';

interface InvitationDetails {
  email: string;
  full_name?: string;
  course_name: string;
  course_description?: string;
  exam_type: string;
  inviter_name: string;
  personal_message?: string;
  expires_at: string;
  invited_at: string;
  user_exists?: boolean;
}

export default function AcceptInvitation({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    password: '',
    confirmPassword: ''
  });

  const [formErrors, setFormErrors] = useState<{
    full_name?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    fetchInvitationDetails();
  }, [params.token]);

  const fetchInvitationDetails = async () => {
    try {
      setIsLoading(true);
      const details = await apiClient.getInvitationDetails(params.token);
      setInvitation(details);
      
      // Pre-fill the name if provided
      if (details.full_name) {
        setFormData(prev => ({
          ...prev,
          full_name: details.full_name
        }));
      }
    } catch (error: any) {
      console.error('Failed to fetch invitation details:', error);
      setError(error.message || 'Invalid or expired invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const errors: typeof formErrors = {};

    // Only validate form fields for new users
    if (!invitation?.user_exists) {
      if (!formData.full_name.trim()) {
        errors.full_name = 'Full name is required';
      }

      if (!formData.password) {
        errors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }

      if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (invitation?.user_exists) {
        // For existing users, just accept the invitation (no password needed)
        await apiClient.acceptInvitation(params.token, {
          full_name: invitation.full_name || invitation.email,
          password: 'dummy' // Backend will ignore this for existing users
        });
      } else {
        // For new users, create account with provided details
        await apiClient.acceptInvitation(params.token, {
          full_name: formData.full_name.trim(),
          password: formData.password
        });
      }

      setSuccess(true);
      
      // Redirect to login page after a short delay
      setTimeout(() => {
        const message = invitation?.user_exists ? 'enrolled-successfully' : 'account-created';
        router.push(`/login?message=${message}`);
      }, 2000);
      
    } catch (error: any) {
      console.error('Failed to accept invitation:', error);
      setError(error.message || 'Failed to accept invitation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatExamType = (examType: string) => {
    return examType.charAt(0).toUpperCase() + examType.slice(1).replace('_', ' ');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invitation details...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white rounded-lg shadow-md p-8">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.push('/login')}>
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white rounded-lg shadow-md p-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome aboard!</h1>
            <p className="text-gray-600 mb-4">
              Your account has been created successfully and you've been enrolled in the course.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Redirecting to login page...
            </p>
            <Button onClick={() => router.push('/login?message=account-created')}>
              Go to Login Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="p-3 bg-blue-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              You're Invited!
            </h1>
            <p className="text-gray-600">
              Complete your registration to join the course
            </p>
          </div>

          {/* Course Information Card */}
          {invitation && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {invitation.course_name}
                  </h2>
                  {invitation.course_description && (
                    <p className="text-gray-600 mb-3">{invitation.course_description}</p>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <Shield className="h-4 w-4 mr-1" />
                      {formatExamType(invitation.exam_type)}
                    </div>
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-1" />
                      Invited by {invitation.inviter_name}
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      Expires {new Date(invitation.expires_at).toLocaleDateString()}
                    </div>
                  </div>

                  {invitation.personal_message && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Personal message:</strong> {invitation.personal_message}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Registration Form */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-6">
              {invitation?.user_exists ? 'Accept Invitation' : 'Create Your Account'}
            </h3>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleAcceptInvitation} className="space-y-6">
              {/* Email (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={invitation?.email || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This is the email address the invitation was sent to
                </p>
              </div>

              {invitation?.user_exists ? (
                // For existing users, show enrollment confirmation
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 mb-2">
                    <strong>Good news!</strong> You already have an account with us.
                  </p>
                  <p className="text-sm text-green-700">
                    By accepting this invitation, you'll be enrolled in the course "{invitation?.course_name}".
                    You can then log in with your existing credentials to access the course.
                  </p>
                </div>
              ) : (
                // For new users, show account creation form
                <>
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.full_name ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter your full name"
                    />
                    {formErrors.full_name && (
                      <p className="text-xs text-red-600 mt-1">{formErrors.full_name}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          formErrors.password ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="Create a strong password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    {formErrors.password && (
                      <p className="text-xs text-red-600 mt-1">{formErrors.password}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Password must be at least 6 characters long
                    </p>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Confirm your password"
                    />
                    {formErrors.confirmPassword && (
                      <p className="text-xs text-red-600 mt-1">{formErrors.confirmPassword}</p>
                    )}
                  </div>
                </>
              )}

              {/* Terms */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  By accepting this invitation and creating your account, you agree to:
                </p>
                <ul className="text-sm text-gray-600 mt-2 space-y-1">
                  <li>• Follow the platform's terms of service</li>
                  <li>• Maintain academic integrity during assessments</li>
                  <li>• Use the platform for educational purposes only</li>
                </ul>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {invitation?.user_exists ? 'Enrolling...' : 'Creating Account...'}
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {invitation?.user_exists ? 'Accept Invitation & Enroll' : 'Accept Invitation & Create Account'}
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Already have an account?{' '}
                <button 
                  onClick={() => router.push('/login')}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign in here
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}