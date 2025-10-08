"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiClient } from "../../lib/api";
import { useLanguage } from "../../contexts/LanguageContext";
import LanguageSwitch from "../../components/LanguageSwitch";
import { 
  GraduationCap, 
  BookOpen, 
  MessageCircle, 
  FileText, 
  TrendingUp,
  LogOut,
  Clock,
  Trophy,
  Target,
  Activity,
  Calendar,
  Star,
  Award,
  Play,
  Eye,
  Mail,
  ExternalLink,
  User,
  CheckCircle
} from "lucide-react";

interface StudentStats {
  enrolledCourses: number;
  completedExams: number;
  totalExams: number;
  averageScore: number;
  studyStreak: number;
  recentActivity: any[];
  upcomingExams: any[];
}

interface PendingInvitation {
  id: string;
  course_name: string;
  course_description?: string;
  exam_type: string;
  inviter_name: string;
  invited_at: string;
  expires_at: string;
  invitation_url: string;
  personal_message?: string;
}

export default function StudentDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);

  useEffect(() => {
    fetchStudentStats();
  }, []);

  const getTimeAgo = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      
      if (diffInMinutes < 60) return `${diffInMinutes} ${t('dashboard.minutesAgo')}`;
      if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} ${t('dashboard.hoursAgo')}`;
      return `${Math.floor(diffInMinutes / 1440)} ${t('dashboard.daysAgo')}`;
    } catch {
      return t('dashboard.recently');
    }
  };

  const fetchStudentStats = async () => {
    try {
      setIsLoading(true);
      
      // Fetch student-specific data
      const [enrollmentsData, invitationsData, examsData, submissionsData] = await Promise.all([
        apiClient.getMyEnrollments().catch(() => []), // Get actual enrollments for this student
        apiClient.getMyInvitations().catch(() => []), // Handle if not authenticated yet
        apiClient.getMockExams().catch(() => []), // Get available exams
        apiClient.getMySubmissions().catch(() => []) // Get actual submissions for this student
      ]);

      // Calculate completed exams and average score from actual submissions
      const completedSubmissions = submissionsData.filter((sub: any) => 
        sub.status === 'submitted' || sub.status === 'completed'
      );
      
      const totalScore = completedSubmissions.reduce((sum: number, sub: any) => 
        sum + (sub.percentage_score || 0), 0
      );
      
      const averageScore = completedSubmissions.length > 0 
        ? totalScore / completedSubmissions.length 
        : 0;

      // Calculate real student-specific stats
      const studentStats: StudentStats = {
        enrolledCourses: enrollmentsData.length, // Actual enrolled courses count
        completedExams: completedSubmissions.length, // Actual completed exams
        totalExams: examsData.length, // Total available exams
        averageScore: Math.round(averageScore * 10) / 10, // Average score with 1 decimal
        studyStreak: 1, // Default streak (could be calculated from submission dates)
        recentActivity: completedSubmissions.slice(0, 4).map((sub: any) => ({
          type: 'exam' as const,
          action: `Completed ${sub.exam?.title || 'Exam'}`,
          score: sub.percentage_score ? Math.round(sub.percentage_score) : undefined,
          time: sub.submitted_at ? getTimeAgo(sub.submitted_at) : '...'
        })),
        upcomingExams: [] // Could be populated with scheduled exams from enrolled courses
      };

      setStats(studentStats);
      setPendingInvitations(invitationsData || []);
    } catch (error) {
      console.error('Failed to fetch student stats:', error);
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
              <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <LanguageSwitch />
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t('common.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">{t('common.loading')}</span>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{t('dashboard.welcome')}</h2>
                  <p className="text-blue-100">{t('dashboard.welcomeSubtitle')}</p>
                </div>
                <div className="text-right">
                  <p className="text-blue-100 text-sm">{t('dashboard.studyStreak')}</p>
                  <p className="text-3xl font-bold">{stats?.studyStreak || 0} {t('dashboard.days')}</p>
                </div>
              </div>
            </div>

            {/* Statistics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t('dashboard.enrolledCourses')}</p>
                    <p className="text-3xl font-bold text-blue-600">{stats?.enrolledCourses || 0}</p>
                    <p className="text-xs text-green-600 flex items-center mt-1">
                      <BookOpen className="h-3 w-3 mr-1" />
                      {t('dashboard.activeEnrollment')}
                    </p>
                  </div>
                  <BookOpen className="h-8 w-8 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t('dashboard.examsCompleted')}</p>
                    <p className="text-3xl font-bold text-green-600">{stats?.completedExams || 0}</p>
                    <p className="text-xs text-gray-500 flex items-center mt-1">
                      <Target className="h-3 w-3 mr-1" />
                      {t('dashboard.outOfTotal')} {stats?.totalExams || 0} {t('dashboard.total')}
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-green-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t('dashboard.averageScore')}</p>
                    <p className="text-3xl font-bold text-yellow-600">{stats?.averageScore || 0}%</p>
                    <p className="text-xs text-yellow-600 flex items-center mt-1">
                      <Trophy className="h-3 w-3 mr-1" />
                      {t('dashboard.greatPerformance')}
                    </p>
                  </div>
                  <Award className="h-8 w-8 text-yellow-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t('dashboard.studyStreak')}</p>
                    <p className="text-3xl font-bold text-orange-600">{stats?.studyStreak || 0}</p>
                    <p className="text-xs text-orange-600 flex items-center mt-1">
                      <Activity className="h-3 w-3 mr-1" />
                      {t('dashboard.daysInARow')}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-orange-600" />
                </div>
              </div>
            </div>

            {/* Pending Course Invitations */}
            {pendingInvitations.length > 0 && (
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Mail className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-purple-900">
                      {t('dashboard.pendingCourseInvitations')}
                    </h2>
                    <p className="text-purple-700">
                      {pendingInvitations.length} {pendingInvitations.length > 1 ? t('dashboard.courseInvitationsWaitingPlural') : t('dashboard.courseInvitationsWaiting')}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {pendingInvitations.map((invitation, index) => (
                    <div key={invitation.id} className="bg-white border border-purple-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold text-gray-900">{invitation.course_name}</h3>
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                              {invitation.exam_type}
                            </span>
                          </div>
                          
                          {invitation.course_description && (
                            <p className="text-gray-600 text-sm mb-2">{invitation.course_description}</p>
                          )}
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-1" />
                              {t('dashboard.invitedBy')} {invitation.inviter_name}
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1" />
                              {t('dashboard.expires')} {new Date(invitation.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                          
                          {invitation.personal_message && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                              <p className="text-sm text-blue-800">
                                <strong>{t('dashboard.message')}:</strong> {invitation.personal_message}
                              </p>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex space-x-2 ml-4">
                          <Button
                            onClick={() => window.open(invitation.invitation_url, '_blank')}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t('dashboard.acceptInvitation')}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => window.open(invitation.invitation_url, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 p-4 bg-purple-100 border border-purple-200 rounded-lg">
                  <h4 className="font-medium text-purple-900 mb-2">{t('dashboard.howToAcceptInvitations')}</h4>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>{t('dashboard.acceptStep1')}</li>
                    <li>{t('dashboard.acceptStep2')}</li>
                    <li>{t('dashboard.acceptStep3')}</li>
                    <li>{t('dashboard.acceptStep4')}</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">{t('dashboard.quickActions')}</h2>
                </div>
                <div className="p-6 space-y-4">
                  <Button 
                    className="w-full justify-start h-12"
                    onClick={() => router.push("/student/courses")}
                  >
                    <BookOpen className="h-5 w-5 mr-3" />
                    {t('dashboard.continueLearning')}
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full justify-start h-12"
                    onClick={() => router.push("/student/progress")}
                  >
                    <TrendingUp className="h-5 w-5 mr-3" />
                    {t('dashboard.viewProgress')}
                  </Button>
                </div>
              </div>

              {/* Upcoming Exams */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">{t('dashboard.upcomingExams')}</h2>
                </div>
                <div className="p-6">
                  {stats?.upcomingExams?.length ? (
                    <div className="space-y-4">
                      {stats.upcomingExams.slice(0, 3).map((exam, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                              <FileText className="h-4 w-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium">{exam.title}</p>
                              <div className="flex items-center space-x-3 text-sm text-gray-500">
                                <span className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {new Date(exam.date).toLocaleDateString()}
                                </span>
                                <span className="flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {exam.duration} mins
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">{t('dashboard.noUpcomingExams')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold">{t('dashboard.recentActivity')}</h2>
              </div>
              <div className="p-6">
                {stats?.recentActivity?.length ? (
                  <div className="space-y-4">
                    {stats.recentActivity.map((activity, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <div className={`p-2 rounded-full ${
                          activity.type === 'exam' ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          {activity.type === 'exam' 
                            ? <FileText className="h-4 w-4 text-purple-600" />
                            : <BookOpen className="h-4 w-4 text-blue-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                          <div className="flex items-center space-x-4 mt-1">
                            {activity.score && (
                              <span className="text-xs text-green-600 flex items-center">
                                <Star className="h-3 w-3 mr-1" />
                                {t('dashboard.score')}: {activity.score}%
                              </span>
                            )}
                            {activity.progress && (
                              <span className="text-xs text-blue-600 flex items-center">
                                <Target className="h-3 w-3 mr-1" />
                                {t('dashboard.progress')}: {activity.progress}%
                              </span>
                            )}
                            <span className="text-xs text-gray-500 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {activity.time}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">{t('dashboard.noRecentActivity')}</p>
                )}
              </div>
            </div>

            {/* Navigation Cards */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* My Courses */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <BookOpen className="h-10 w-10 text-blue-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('navigation.myCourses')}</h3>
                <p className="text-gray-600 text-sm mb-4">
                  {t('navigation.myCoursesDesc')}
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/student/courses")}
                >
                  {t('navigation.viewCourses')}
                </Button>
              </div>




              {/* My Progress */}
              <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <TrendingUp className="h-10 w-10 text-orange-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('navigation.myProgress')}</h3>
                <p className="text-gray-600 text-sm mb-4">
                  {t('navigation.myProgressDesc')}
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push("/student/progress")}
                >
                  {t('dashboard.viewProgress')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}