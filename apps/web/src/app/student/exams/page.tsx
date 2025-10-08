"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useLanguage } from "../../../contexts/LanguageContext";
import { 
  ArrowLeft,
  FileText,
  Clock,
  Award,
  CheckCircle,
  AlertCircle,
  Play
} from "lucide-react";

interface MockExam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  status: string;
  total_questions: number;
  course?: {
    title: string;
  };
}

interface Submission {
  id: string;
  mock_exam_id: string;
  total_score: number;
  percentage_score: number;
  passed: boolean;
  submitted_at: string;
}

export default function StudentExams() {
  const router = useRouter();
  const { t } = useLanguage();
  const [exams, setExams] = useState<MockExam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log("Student exams page - Starting data fetch");
      
      // Fetch exams and basic submissions in parallel first
      const [examsData, submissionsData] = await Promise.all([
        apiClient.getMockExams({ is_active: true }).catch((error) => {
          console.error("Failed to fetch exams:", error);
          return [];
        }),
        apiClient.getMySubmissions().catch((error) => {
          console.error("Failed to fetch submissions:", error);
          return [];
        })
      ]);
      
      console.log("Student exams page - Initial data fetched:", {
        exams: examsData?.length || 0,
        submissions: submissionsData?.length || 0
      });
      
      // Set exams immediately to show the page content
      setExams(examsData || []);
      
      // Process submissions to enhance with detailed results
      const enhancedSubmissions = [];
      
      if (submissionsData && submissionsData.length > 0) {
        console.log("Student exams page - Enhancing submission data");
        
        for (const sub of submissionsData) {
          console.log(`Student exams page - Processing submission ${sub.id}`);

          // Try to get detailed results for more accurate data
          try {
            const detailedResults = await apiClient.getDetailedSubmissionResults(sub.id);
            console.log(`Student exams page - Got detailed results for ${sub.id}:`, detailedResults);
            
            // Use detailed results if available, otherwise fall back to basic submission data
            // IMPORTANT: Use !== undefined/null to avoid falsy 0 values being ignored
            const finalTotalScore = detailedResults.total_score !== undefined && detailedResults.total_score !== null ? detailedResults.total_score : sub.total_score;
            const finalPercentageScore = detailedResults.percentage_score !== undefined && detailedResults.percentage_score !== null ? detailedResults.percentage_score : sub.percentage_score;
            const finalPassed = detailedResults.passed !== undefined ? detailedResults.passed : sub.passed;
            
            console.log(`Student exams page - Final scores for ${sub.id}:`, {
              originalScore: sub.percentage_score,
              detailedScore: detailedResults.percentage_score,
              finalScore: finalPercentageScore,
              originalPassed: sub.passed,
              detailedPassed: detailedResults.passed,
              finalPassed: finalPassed
            });
            
            enhancedSubmissions.push({
              ...sub,
              total_score: finalTotalScore,
              percentage_score: finalPercentageScore,
              passed: finalPassed
            });
          } catch (detailError) {
            console.warn(`Student exams page - Could not get detailed results for ${sub.id}:`, detailError);
            // Fall back to basic submission data
            enhancedSubmissions.push(sub);
          }
        }
      }
      
      setSubmissions(enhancedSubmissions);
      console.log("Student exams page - Data fetch completed successfully");
      
    } catch (error) {
      console.error("Student exams page - Critical error during data fetch:", error);
      // Even on error, try to show what we can
      setExams([]);
      setSubmissions([]);
    } finally {
      setLoading(false);
      console.log("Student exams page - Loading completed");
    }
  };

  const getSubmissionForExam = (examId: string) => {
    const submission = submissions.find(sub => sub.mock_exam_id === examId);
    console.log(`Student exams - Finding submission for exam ${examId}:`, submission);
    return submission;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>{t('common.loading')}</p>
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
                onClick={() => router.push("/student")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('exams.backToDashboard')}
              </Button>
              <div className="flex items-center space-x-2">
                <FileText className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('exams.title')}</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">{t('exams.availableExams')}</p>
                <p className="text-xl font-bold text-gray-900">{exams.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">{t('exams.completed')}</p>
                <p className="text-xl font-bold text-gray-900">{submissions.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Award className="h-8 w-8 text-yellow-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">{t('exams.passed')}</p>
                <p className="text-xl font-bold text-gray-900">
                  {submissions.filter(sub => sub.passed).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Exams List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">{t('exams.availableExams')}</h2>
          </div>
          
          {exams.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('exams.noExams')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {exams.map((exam) => {
                const submission = getSubmissionForExam(exam.id);
                const isCompleted = !!submission;
                
                console.log(`Student exams - Exam ${exam.id} (${exam.title}):`, {
                  submission: submission,
                  isCompleted: isCompleted,
                  status: exam.status,
                  buttonShouldShow: !isCompleted ? 'Start Exam' : 'View Results'
                });
                
                return (
                  <div key={exam.id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium">{exam.title}</h3>
                          {isCompleted && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              submission.passed 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {submission.passed ? t('exams.passed') : t('exams.failed')}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-gray-600 mb-3">{exam.description}</p>
                        
                        <div className="flex items-center space-x-6 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {exam.duration_minutes} {t('exams.minutes')}
                          </div>
                          <div className="flex items-center">
                            <FileText className="h-4 w-4 mr-1" />
                            {exam.total_questions} {t('exams.questions')}
                          </div>
                          <span>
                            {exam.total_marks} marks ({t('exams.toPass')}: {exam.passing_marks})
                          </span>
                        </div>
                        
                        {isCompleted && (
                          <div className="mt-2 text-sm">
                            <span className="font-medium">{t('exams.yourScore')}: </span>
                            <span className={`font-bold ${
                              submission.passed ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {submission.total_score || 0}/{exam.total_marks || 0} ({(submission.percentage_score || 0).toFixed(1)}%)
                            </span>
                            <span className="text-gray-500 ml-2">
                              {t('exams.completedOn')} {new Date(submission.submitted_at).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isCompleted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/student/exams/${exam.id}/results`)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t('exams.viewResults')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => router.push(`/student/exams/${exam.id}/take`)}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            {t('exams.startExam')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}