'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '../../lib/store';
import { Eye, EyeOff, Mail, Phone, User } from 'lucide-react';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, register, isLoading, error, clearError } = useAuthStore();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone_number: '',
    password: '',
    full_name: '',
    role: 'student'
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [useEmail, setUseEmail] = useState(true);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (mode === 'login') {
        console.log('[LOGIN] Starting login process...');
        await login({
          username: useEmail ? formData.email : formData.phone_number,
          password: formData.password
        });
        
        console.log('[LOGIN] Login successful, checking user state...');
        
        // Small delay to ensure auth store persistence
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Redirect based on user role
        const user = useAuthStore.getState().user;
        console.log('[LOGIN] User role:', user?.role);
        
        if (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'institution') {
          console.log('[LOGIN] Redirecting to /admin');
          router.push('/admin');
        } else {
          console.log('[LOGIN] Redirecting to /student');
          router.push('/student');
        }
      } else {
        const registerData: any = {
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role
        };
        
        if (useEmail) {
          registerData.email = formData.email;
        } else {
          registerData.phone_number = formData.phone_number;
        }
        
        await register(registerData);
        router.push('/login?message=Registration successful! Your account is pending admin approval. You will be able to login once approved.');
      }
    } catch (error) {
      // Error is handled by the store
      console.error('Auth error:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <p className="mt-2 text-gray-600">
            {mode === 'login' 
              ? 'Welcome back to KSAI Education' 
              : 'Join KSAI Education Platform'
            }
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-lg">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="full_name"
                      name="full_name"
                      type="text"
                      required
                      className="pl-10"
                      placeholder="Enter your full name"
                      value={formData.full_name}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                {/* Role is automatically set to student - no selection needed */}
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {mode === 'login' ? 'Username' : 'Contact Method'}
              </label>
              
              {mode === 'register' && (
                <div className="flex mb-2">
                  <button
                    type="button"
                    className={`px-3 py-1 text-sm rounded-l-md border ${
                      useEmail
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-gray-100 text-gray-700 border-gray-300'
                    }`}
                    onClick={() => setUseEmail(true)}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 text-sm rounded-r-md border-l-0 border ${
                      !useEmail
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-gray-100 text-gray-700 border-gray-300'
                    }`}
                    onClick={() => setUseEmail(false)}
                  >
                    Phone
                  </button>
                </div>
              )}

              <div className="relative">
                {useEmail ? (
                  <>
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className="pl-10"
                      placeholder={mode === 'login' ? 'Enter email or phone' : 'Enter your email'}
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </>
                ) : (
                  <>
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone_number"
                      name="phone_number"
                      type="tel"
                      required
                      className="pl-10"
                      placeholder="Enter your phone number"
                      value={formData.phone_number}
                      onChange={handleChange}
                    />
                  </>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="pr-10"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </Button>
          </form>

          {mode === 'login' && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-500 font-medium"
                  onClick={() => router.push('/register')}
                >
                  Sign up as Student
                </button>
              </p>
            </div>
          )}

          {mode === 'register' && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-500 font-medium"
                  onClick={() => router.push('/login')}
                >
                  Sign in here
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}