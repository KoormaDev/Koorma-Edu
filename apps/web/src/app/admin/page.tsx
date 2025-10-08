"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiClient } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { 
  GraduationCap, 
  BookOpen, 
  Users,
  Shield, 
  FileText, 
  BarChart,
  LogOut,
  TrendingUp,
  Calendar,
  Clock,
  Award,
  Settings,
  Plus,
  Activity
} from "lucide-react";

interface DashboardStats {
  totalCourses: number;
  totalStudents: number;
  totalExams: number;
  totalMaterials: number;
  totalSubmissions: number;
  averageScore: number;
  passRate: number;
  activeUsersWeek: number;
  recentActivity: any[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Client-side role protection
    if (user && user.role === 'student') {
      console.log('[CLIENT] Student user detected in admin area, redirecting to /student');
      router.push('/student');
      return;
    }
    
    fetchDashboardStats();
  }, [user, router]);

  const fetchDashboardStats = async () => {
    try {
      setIsLoading(true);
      
      // Fetch analytics overview and recent activity
      const analyticsData = await apiClient.getAnalyticsOverview();
      let recentActivityData = [];
      
      try {
        recentActivityData = await apiClient.getRecentActivity(10);
      } catch (error) {
        console.warn('Failed to fetch recent activity, using empty array:', error);
        recentActivityData = [];
      }

      const dashboardStats: DashboardStats = {
        totalCourses: analyticsData.total_courses,
        totalStudents: analyticsData.total_students,
        totalExams: analyticsData.total_exams,
        totalMaterials: analyticsData.total_materials,
        totalSubmissions: analyticsData.total_submissions,
        averageScore: analyticsData.average_score,
        passRate: analyticsData.pass_rate,
        activeUsersWeek: analyticsData.active_users_week,
        recentActivity: recentActivityData.map((activity: any) => ({
          type: activity.type,
          action: activity.action,
          item: activity.item,
          time: activity.relative_time,
          score: activity.score
        }))
      };

      setStats(dashboardStats);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      // Fallback to basic data if analytics fails
      try {
        const [coursesData, examsData] = await Promise.all([
          apiClient.getCourses(),
          apiClient.getMockExams()
        ]);
        
        setStats({
          totalCourses: coursesData.length,
          totalStudents: 0,
          totalExams: examsData.length,
          totalMaterials: 0,
          totalSubmissions: 0,
          averageScore: 0,
          passRate: 0,
          activeUsersWeek: 0,
          recentActivity: []
        });
      } catch (fallbackError) {
        console.error('Failed to fetch fallback data:', fallbackError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GraduationCap className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Statistics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Courses</p>
                    <p className="text-3xl font-bold text-blue-600">{stats?.totalCourses || 0}</p>
                    <p className="text-xs text-blue-600 flex items-center mt-1">
                      <BookOpen className="h-3 w-3 mr-1" />
                      Active courses
                    </p>
                  </div>
                  <BookOpen className="h-8 w-8 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Students</p>
                    <p className="text-3xl font-bold text-green-600">{stats?.totalStudents || 0}</p>
                    <p className="text-xs text-green-600 flex items-center mt-1">
                      <Activity className="h-3 w-3 mr-1" />
                      {stats?.activeUsersWeek || 0} active this week
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-green-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Mock Exams</p>
                    <p className="text-3xl font-bold text-purple-600">{stats?.totalExams || 0}</p>
                    <p className="text-xs text-purple-600 flex items-center mt-1">
                      <Award className="h-3 w-3 mr-1" />
                      {stats?.totalSubmissions || 0} submissions
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-purple-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Study Materials</p>
                    <p className="text-3xl font-bold text-orange-600">{stats?.totalMaterials || 0}</p>
                    <p className="text-xs text-orange-600 flex items-center mt-1">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Avg: {stats?.averageScore || 0}% score
                    </p>
                  </div>
                  <BarChart className="h-8 w-8 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">Quick Actions</h2>
                </div>
                <div className="p-6 space-y-4">
                  <Button 
                    className="w-full justify-start h-12"
                    onClick={() => router.push("/admin/courses")}
                  >
                    <Plus className="h-5 w-5 mr-3" />
                    Create New Course
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full justify-start h-12"
                    onClick={() => router.push("/admin/exams")}
                  >
                    <FileText className="h-5 w-5 mr-3" />
                    Create Mock Exam
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full justify-start h-12"
                    onClick={() => router.push("/admin/students")}
                  >
                    <Users className="h-5 w-5 mr-3" />
                    Invite Students
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full justify-start h-12"
                    onClick={() => router.push("/admin/analytics")}
                  >
                    <BarChart className="h-5 w-5 mr-3" />
                    View Analytics
                  </Button>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">Recent Activity</h2>
                </div>
                <div className="p-6">
                  {stats?.recentActivity?.length ? (
                    <div className="space-y-4">
                      {stats.recentActivity.map((activity, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <div className={`p-2 rounded-full ${
                            activity.type === 'course' ? 'bg-blue-100' :
                            activity.type === 'student' ? 'bg-green-100' :
                            activity.type === 'exam' ? 'bg-purple-100' :
                            'bg-orange-100'
                          }`}>
                            {activity.type === 'course' ? <BookOpen className="h-4 w-4 text-blue-600" /> :
                             activity.type === 'student' ? <Users className="h-4 w-4 text-green-600" /> :
                             activity.type === 'exam' ? <FileText className="h-4 w-4 text-purple-600" /> :
                             <BarChart className="h-4 w-4 text-orange-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{activity.item}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Clock className="h-3 w-3 text-gray-400" />
                              <p className="text-xs text-gray-500">{activity.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No recent activity</p>
                  )}
                </div>
              </div>
            </div>

            {/* Management Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {/* Course Management */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <BookOpen className="h-10 w-10 text-blue-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Course Management</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Create courses, upload syllabi, and manage content
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/admin/courses")}
                >
                  Manage Courses
                </Button>
              </div>

              {/* Student Management */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <Users className="h-10 w-10 text-green-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Student Management</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Invite students, manage enrollments, track progress
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/admin/students")}
                >
                  Manage Students
                </Button>
              </div>

              {/* Mock Exams */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <FileText className="h-10 w-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Mock Exams</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Create and manage mock exams and assessments
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/admin/exams")}
                >
                  Manage Exams
                </Button>
              </div>

              {/* Admin Management */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <Shield className="h-10 w-10 text-indigo-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Admin Management</h3>
                <p className="text-gray-600 text-sm mb-4">
                  View admin accounts, create admins (super admin only)
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/admin/admins")}
                >
                  Manage Admins
                </Button>
              </div>

              {/* Analytics */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <BarChart className="h-10 w-10 text-orange-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Analytics</h3>
                <p className="text-gray-600 text-sm mb-4">
                  View performance analytics and reports
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/admin/analytics")}
                >
                  View Analytics
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}