"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Award, Users } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GraduationCap className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-gray-900">KSAI Education</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => router.push("/login")}>
                Sign In
              </Button>
              <Button onClick={() => router.push("/register")}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Transform Your Learning Experience
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Comprehensive education platform with AI-powered tutoring, 
            structured syllabi, and intelligent assessments
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => router.push("/register")}>
              Start Learning
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push("/about")}>
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-lg p-8 shadow-lg">
            <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Structured Learning</h3>
            <p className="text-gray-600">
              Organized course content with hierarchical syllabus structure. 
              Study materials and past papers linked to specific topics.
            </p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-lg">
            <div className="bg-green-100 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
              <Award className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Smart Assessments</h3>
            <p className="text-gray-600">
              AI-generated mock exams with instant evaluation. 
              Track progress and identify weak areas for improvement.
            </p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-lg">
            <div className="bg-purple-100 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">AI Tutor Support</h3>
            <p className="text-gray-600">
              Syllabus-restricted AI tutor provides accurate, contextual answers. 
              Available 24/7 for personalized learning assistance.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Excel in Your Exams?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of students achieving their academic goals
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            onClick={() => router.push("/register")}
          >
            Start Your Free Trial
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <GraduationCap className="h-6 w-6" />
              <span className="text-white font-semibold">KSAI Education Platform</span>
            </div>
            <div className="text-sm">
              © 2024 KSAI Education. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}