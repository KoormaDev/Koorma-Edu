"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiClient } from "../../../lib/api";
import { 
  ArrowLeft,
  BarChart,
  TrendingUp,
  Users,
  FileText,
  Clock,
  Award
} from "lucide-react";

interface AnalyticsData {
  totalStudents: number;
  totalCourses: number;
  totalExams: number;
  totalSubmissions: number;
  averageScore: number;
  passRate: number;
  activeUsersThisWeek: number;
  popularCourses: Array<{
    id: string;
    title: string;
    enrollments: number;
  }>;
}

export default function Analytics() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Use the API client for analytics data
      const analyticsData = await apiClient.getAnalyticsOverview();
      
      const analytics: AnalyticsData = {
        totalStudents: (analyticsData as any).total_students,
        totalCourses: (analyticsData as any).total_courses,
        totalExams: (analyticsData as any).total_exams,
        totalSubmissions: (analyticsData as any).total_submissions,
        averageScore: (analyticsData as any).average_score,
        passRate: (analyticsData as any).pass_rate,
        activeUsersThisWeek: (analyticsData as any).active_users_week,
        popularCourses: (analyticsData as any).popular_courses || []
      };

      setAnalytics(analytics);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Failed to load analytics data</p>
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
                <BarChart className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Key Metrics */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Students</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalStudents}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Courses</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalCourses}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Mock Exams</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalExams}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Award className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Submissions</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalSubmissions}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
              Performance Overview
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Score</span>
                <span className="font-semibold text-lg">
                  {analytics.averageScore.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Pass Rate</span>
                <span className="font-semibold text-lg text-green-600">
                  {analytics.passRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Active Users (This Week)</span>
                <span className="font-semibold text-lg">
                  {analytics.activeUsersThisWeek}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Popular Courses</h3>
            <div className="space-y-3">
              {analytics.popularCourses.map((course, index) => (
                <div key={course.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
                      {index + 1}
                    </span>
                    <span className="font-medium text-sm">{course.title}</span>
                  </div>
                  <span className="text-gray-500 text-sm">
                    {course.enrollments} students
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Performance Analytics */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Performance Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Performance Breakdown</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-gray-700">Students Passing</span>
                <div className="text-right">
                  <span className="text-xl font-bold text-green-600">
                    {analytics.passRate.toFixed(1)}%
                  </span>
                  <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ width: `${analytics.passRate}%` }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-gray-700">Average Score</span>
                <div className="text-right">
                  <span className="text-xl font-bold text-blue-600">
                    {analytics.averageScore.toFixed(1)}%
                  </span>
                  <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{ width: `${analytics.averageScore}%` }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                <span className="text-gray-700">Active Students</span>
                <div className="text-right">
                  <span className="text-xl font-bold text-purple-600">
                    {analytics.activeUsersThisWeek}
                  </span>
                  <span className="text-sm text-gray-500 block">This week</span>
                </div>
              </div>
            </div>
          </div>

          {/* Submission Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Submission Activity</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total Submissions</span>
                <span className="font-semibold text-2xl text-gray-900">
                  {analytics.totalSubmissions}
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pass Rate</span>
                  <span className="font-medium">{analytics.passRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${analytics.passRate}%` }}
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {analytics.totalExams}
                  </div>
                  <div className="text-sm text-gray-500">Total Exams Available</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">System Overview</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {((analytics.totalSubmissions / Math.max(analytics.totalExams, 1)) * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Exam Participation Rate</div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
              <div className="text-2xl font-bold text-green-600 mb-2">
                {analytics.averageScore.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Platform Average Score</div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {((analytics.activeUsersThisWeek / Math.max(analytics.totalStudents, 1)) * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Weekly Engagement Rate</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}