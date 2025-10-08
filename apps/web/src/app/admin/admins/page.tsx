"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "../../../lib/store";
import { 
  ArrowLeft,
  Users,
  UserPlus,
  Mail,
  Calendar,
  Settings,
  Eye,
  EyeOff,
  User,
  Phone,
  Shield
} from "lucide-react";

interface Admin {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  role: string;
  created_at: string;
  is_active: string;
}

export default function AdminManagement() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [useEmail, setUseEmail] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    phone_number: '',
    password: '',
    full_name: ''
  });

  useEffect(() => {
    if (user) {
      console.log('Admin page - User object:', user);
      console.log('Admin page - User role:', user.role);
      console.log('Admin page - Is super admin check:', user.role === 'super_admin');
      
      // Temporary workaround: treat superadmin@ksai-exam.com as super admin
      const isActualSuperAdmin = user.role === 'super_admin' || user.email === 'superadmin@ksai-exam.com';
      setIsSuperAdmin(isActualSuperAdmin);
      fetchAdmins();
    }
  }, [user, token]);

  const fetchAdmins = async () => {
    try {
      if (!user || !token) {
        router.push("/login");
        return;
      }

      if (user.role !== 'admin' && user.role !== 'super_admin') {
        router.push("/student");
        return;
      }

      const { apiClient } = await import('../../../lib/api');
      
      try {
        const adminsData = await apiClient.getUsers('admin');
        let allAdmins = adminsData.filter((user: Admin) => user.role === 'admin');
        
        // Also get super admins
        try {
          const superAdminsData = await apiClient.getUsers('super_admin');
          allAdmins = [...allAdmins, ...superAdminsData.filter((user: Admin) => user.role === 'super_admin')];
        } catch (error) {
          console.log("No super admins or access denied");
        }
        
        setAdmins(allAdmins);
      } catch (error: any) {
        if (error.status === 401) {
          router.push("/login");
          return;
        } else {
          console.error("Failed to fetch admins:", error);
        }
      }
      
    } catch (error) {
      console.error("Failed to fetch admins:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is super admin (including workaround)
    const canCreateAdmin = user?.role === 'super_admin' || user?.email === 'superadmin@ksai-exam.com';
    if (!canCreateAdmin) {
      alert('Only super admins can create admin accounts');
      return;
    }
    
    try {
      const adminData: any = {
        password: formData.password,
        full_name: formData.full_name
      };
      
      if (useEmail) {
        adminData.email = formData.email;
      } else {
        adminData.phone_number = formData.phone_number;
      }

      const { apiClient } = await import('../../../lib/api');
      await apiClient.createAdmin(adminData);
      
      alert('Admin created successfully!');
      setFormData({ email: '', phone_number: '', password: '', full_name: '' });
      setShowCreateForm(false);
      fetchAdmins(); // Refresh the list
    } catch (error) {
      console.error('Failed to create admin:', error);
      alert('Failed to create admin. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading admins...</p>
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
                <Shield className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin Management</h1>
                {isSuperAdmin && (
                  <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-1 rounded-full">
                    Super Admin
                  </span>
                )}
              </div>
            </div>
            {isSuperAdmin && (
              <Button onClick={() => setShowCreateForm(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Create Admin Account
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-blue-800">Admin Management</h3>
              <p className="text-sm text-blue-700 mt-1">
                {isSuperAdmin 
                  ? "As a Super Admin, you can create new admin accounts. Regular admins have the same functionality but cannot create other admins."
                  : "You are viewing all admin accounts. Only Super Admins can create new admin accounts."
                }
                <br />
                <span className="text-xs text-gray-500">Debug: isSuperAdmin = {String(isSuperAdmin)}, userRole = {user?.role}, email = {user?.email}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Create Admin Form (Super Admin Only) */}
        {isSuperAdmin && showCreateForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Admin Account</h2>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              {/* Full Name */}
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
                    placeholder="Enter admin's full name"
                    value={formData.full_name}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Contact Method Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Method
                </label>
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
                        placeholder="Enter admin's email"
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
                        placeholder="Enter admin's phone number"
                        value={formData.phone_number}
                        onChange={handleChange}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="pr-10"
                    placeholder="Enter initial password for admin"
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

              <div className="flex space-x-2">
                <Button type="submit">Create Admin</Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormData({ email: '', phone_number: '', password: '', full_name: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Admins List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">All Administrators ({admins.length})</h2>
            <p className="text-sm text-gray-600 mt-1">
              Admins have full access to manage students, courses, and exams. Super Admins can additionally create other admins.
            </p>
          </div>
          
          {admins.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No admins found.</p>
            </div>
          ) : (
            <div className="divide-y">
              {admins.map((admin) => (
                <div key={admin.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        admin.role === 'super_admin' ? 'bg-purple-100' : 'bg-blue-100'
                      }`}>
                        <span className={`font-medium text-sm ${
                          admin.role === 'super_admin' ? 'text-purple-600' : 'text-blue-600'
                        }`}>
                          {admin.full_name?.charAt(0).toUpperCase() || admin.email?.charAt(0).toUpperCase() || 'A'}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-medium">{admin.full_name || admin.email || 'Unknown Admin'}</h3>
                          {admin.role === 'super_admin' && (
                            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-1 rounded-full">
                              Super Admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Mail className="h-4 w-4 mr-1" />
                            {admin.email || admin.phone_number}
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            Created {new Date(admin.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        admin.is_active === 'active'
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {admin.is_active === 'active' ? 'Active' : 'Inactive'}
                      </span>
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