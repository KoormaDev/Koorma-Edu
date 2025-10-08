export type Language = 'en' | 'ta';

export const translations = {
  en: {
    // Common/Navigation
    common: {
      language: 'Language',
      english: 'English',
      tamil: 'Tamil',
      logout: 'Logout',
      loading: 'Loading...',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      submit: 'Submit',
      cancel: 'Cancel',
      save: 'Save',
      edit: 'Edit',
      delete: 'Delete',
      view: 'View',
      start: 'Start',
      continue: 'Continue',
    },
    
    // Student Dashboard
    dashboard: {
      title: 'Student Dashboard',
      welcome: 'Welcome back, Student!',
      welcomeSubtitle: 'Ready to continue your learning journey?',
      studyStreak: 'Study Streak',
      days: 'days',
      daysInARow: 'Days in a row',
      enrolledCourses: 'Enrolled Courses',
      activeEnrollment: 'Active enrollment',
      examsCompleted: 'Exams Completed',
      outOfTotal: 'Out of',
      total: 'total',
      averageScore: 'Average Score',
      greatPerformance: 'Great performance!',
      quickActions: 'Quick Actions',
      continueLearning: 'Continue Learning',
      viewProgress: 'View Progress',
      upcomingExams: 'Upcoming Exams',
      noUpcomingExams: 'No upcoming exams',
      recentActivity: 'Recent Activity',
      noRecentActivity: 'No recent activity',
      score: 'Score',
      progress: 'Progress',
      completed: 'Completed',
      minutesAgo: 'minutes ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago',
      recently: 'recently',
      pendingCourseInvitations: 'Pending Course Invitations',
      courseInvitationsWaiting: 'course invitation waiting for you!',
      courseInvitationsWaitingPlural: 'course invitations waiting for you!',
      invitedBy: 'Invited by',
      expires: 'Expires',
      message: 'Message',
      acceptInvitation: 'Accept Invitation',
      howToAcceptInvitations: 'How to accept invitations:',
      acceptStep1: '• Click "Accept Invitation" to go to the registration page',
      acceptStep2: '• Fill in your details and create your account password',
      acceptStep3: '• You\'ll be automatically enrolled in the course after acceptance',
      acceptStep4: '• Login with your new credentials to access course materials',
    },
    
    // My Courses
    courses: {
      title: 'My Courses',
      backToDashboard: 'Back to Dashboard',
      totalCourses: 'Total Courses',
      activeCourses: 'Active Courses',
      completedCourses: 'Completed Courses',
      averageProgress: 'Average Progress',
      noCourses: 'No courses available',
      noCoursesMessage: 'You are not enrolled in any courses yet.',
      browseAvailable: 'Browse Available Courses',
      viewCourse: 'View Course',
      continueStudying: 'Continue Studying',
      courseProgress: 'Course Progress',
      examType: 'Exam Type',
      language: 'Language',
      status: 'Status',
      enrolledDate: 'Enrolled',
    },
    
    // Mock Exams
    exams: {
      title: 'Mock Exams',
      backToDashboard: 'Back to Dashboard',
      availableExams: 'Available Exams',
      completed: 'Completed',
      passed: 'Passed',
      bestScore: 'Best Score',
      pending: 'Pending',
      noExams: 'No exams available at the moment.',
      minutes: 'minutes',
      questions: 'questions',
      toPass: 'to pass',
      attempts: 'attempts',
      startExam: 'Start Exam',
      retakeExam: 'Retake',
      viewResults: 'View Results',
      yourScore: 'Your Score',
      completedOn: 'Completed on',
      notStarted: 'Not Started',
      inProgress: 'In Progress',
      failed: 'Failed',
      lastAttempt: 'Last attempt',
    },
    
    // Course Details
    courseDetail: {
      backToCourses: 'Back to Courses',
      studyMaterials: 'Study Materials',
      pastPapers: 'Past Papers',
      aiTutor: 'AI Tutor',
      exams: 'Exams',
      progress: 'Progress',
      overview: 'Overview',
      materials: 'Materials',
      discussions: 'Discussions',
    },
    
    // Navigation Cards
    navigation: {
      myCourses: 'My Courses',
      myCoursesDesc: 'Access enrolled courses and study materials',
      viewCourses: 'View Courses',
      myProgress: 'My Progress',
      myProgressDesc: 'Track your learning progress and performance',
    },

    // AI Chat/Tutor
    chat: {
      aiTutor: 'AI Tutor',
      aiStudyAssistant: 'AI Study Assistant',
      backToDashboard: 'Back to Dashboard',
      aiOnline: 'AI Online',
      welcomeMessage: 'Hello! I\'m your AI tutor for this course. I can help you with questions about the course materials, explain concepts, and provide study guidance based on the uploaded content. What would you like to learn about today?',
      welcomeMessageGeneral: 'Hello! I\'m your AI study assistant. I can help you with questions about your courses, explain concepts, or provide study guidance. What would you like to know?',
      inputPlaceholder: 'Ask me anything about your studies...',
      sources: 'Sources',
      sourcesHelp: 'Click sources to view course materials in a new tab',
      aiDisclaimer: 'AI can make mistakes. Verify important information with your course materials.',
    },
  },
  
  ta: {
    // Common/Navigation
    common: {
      language: 'மொழி',
      english: 'English',
      tamil: 'தமிழ்',
      logout: 'வெளியேறு',
      loading: 'ஏற்றுகிறது...',
      back: 'பின்',
      next: 'அடுத்து',
      previous: 'முந்தைய',
      submit: 'சமர்ப்பிக்க',
      cancel: 'ரத்து',
      save: 'சேமி',
      edit: 'திருத்து',
      delete: 'நீக்கு',
      view: 'காண்க',
      start: 'தொடங்கு',
      continue: 'தொடர்',
    },
    
    // Student Dashboard
    dashboard: {
      title: 'மாணவர் டாஷ்போர்டு',
      welcome: 'வரவேற்கிறோம், மாணவரே!',
      welcomeSubtitle: 'உங்கள் கற்றல் பயணத்தைத் தொடர தயாரா?',
      studyStreak: 'படிப்பு தொடர்ச்சி',
      days: 'நாட்கள்',
      daysInARow: 'தொடர்ச்சியான நாட்கள்',
      enrolledCourses: 'சேர்ந்த பாடங்கள்',
      activeEnrollment: 'செயலில் உள்ள சேர்க்கை',
      examsCompleted: 'முடிந்த தேர்வுகள்',
      outOfTotal: 'மொத்தம்',
      total: 'க்கு',
      averageScore: 'சராசரி மதிப்பெண்',
      greatPerformance: 'சிறந்த செயல்பாடு!',
      quickActions: 'விரைவு நடவடிக்கைகள்',
      continueLearning: 'கற்றலைத் தொடரவும்',
      viewProgress: 'முன்னேற்றத்தைக் காண்க',
      upcomingExams: 'வரவிருக்கும் தேர்வுகள்',
      noUpcomingExams: 'வரவிருக்கும் தேர்வுகள் இல்லை',
      recentActivity: 'சமீபத்திய செயல்பாடு',
      noRecentActivity: 'சமீபத்திய செயல்பாடு இல்லை',
      score: 'மதிப்பெண்',
      progress: 'முன்னேற்றம்',
      completed: 'முடிந்தது',
      minutesAgo: 'நிமிடங்களுக்கு முன்',
      hoursAgo: 'மணிநேரங்களுக்கு முன்',
      daysAgo: 'நாட்களுக்கு முன்',
      recently: 'சமீபத்தில்',
      pendingCourseInvitations: 'நிலுவையில் உள்ள பாட அழைப்புகள்',
      courseInvitationsWaiting: 'பாட அழைப்பு உங்களுக்காக காத்திருக்கிறது!',
      courseInvitationsWaitingPlural: 'பாட அழைப்புகள் உங்களுக்காக காத்திருக்கின்றன!',
      invitedBy: 'அழைத்தவர்',
      expires: 'காலாவதி',
      message: 'செய்தி',
      acceptInvitation: 'அழைப்பை ஏற்கவும்',
      howToAcceptInvitations: 'அழைப்புகளை எப்படி ஏற்பது:',
      acceptStep1: '• பதிவு பக்கத்திற்கு செல்ல "அழைப்பை ஏற்கவும்" கிளிக் செய்யவும்',
      acceptStep2: '• உங்கள் விவரங்களை நிரப்பி கணக்கு கடவுச்சொல்லை உருவாக்கவும்',
      acceptStep3: '• ஏற்றுக்கொண்ட பிறகு தானாகவே பாடத்தில் சேர்க்கப்படுவீர்கள்',
      acceptStep4: '• பாட பொருட்களை அணுக உங்கள் புதிய அங்கீகாரத்துடன் உள்நுழையவும்',
    },
    
    // My Courses
    courses: {
      title: 'எனது பாடங்கள்',
      backToDashboard: 'டாஷ்போர்டுக்கு திரும்பு',
      totalCourses: 'மொத்த பாடங்கள்',
      activeCourses: 'செயலில் உள்ள பாடங்கள்',
      completedCourses: 'முடிந்த பாடங்கள்',
      averageProgress: 'சராசரி முன்னேற்றம்',
      noCourses: 'பாடங்கள் எதுவும் இல்லை',
      noCoursesMessage: 'நீங்கள் இன்னும் எந்த பாடங்களிலும் சேரவில்லை.',
      browseAvailable: 'கிடைக்கும் பாடங்களைப் பார்க்கவும்',
      viewCourse: 'பாடத்தைக் காண்க',
      continueStudying: 'படிப்பைத் தொடரவும்',
      courseProgress: 'பாட முன்னேற்றம்',
      examType: 'தேர்வு வகை',
      language: 'மொழி',
      status: 'நிலை',
      enrolledDate: 'சேர்ந்த தேதி',
    },
    
    // Mock Exams
    exams: {
      title: 'பயிற்சி தேர்வுகள்',
      backToDashboard: 'டாஷ்போர்டுக்கு திரும்பு',
      availableExams: 'கிடைக்கும் தேர்வுகள்',
      completed: 'முடிந்தது',
      passed: 'தேர்ச்சி',
      bestScore: 'சிறந்த மதிப்பெண்',
      pending: 'நிலுவை',
      noExams: 'தற்போது எந்த தேர்வும் இல்லை.',
      minutes: 'நிமிடங்கள்',
      questions: 'கேள்விகள்',
      toPass: 'தேர்ச்சிக்கு',
      attempts: 'முயற்சிகள்',
      startExam: 'தேர்வைத் தொடங்கவும்',
      retakeExam: 'மீண்டும் எழுதவும்',
      viewResults: 'முடிவுகளைக் காண்க',
      yourScore: 'உங்கள் மதிப்பெண்',
      completedOn: 'முடிந்த தேதி',
      notStarted: 'தொடங்கவில்லை',
      inProgress: 'நடந்து கொண்டிருக்கிறது',
      failed: 'தோல்வி',
      lastAttempt: 'கடைசி முயற்சி',
    },
    
    // Course Details
    courseDetail: {
      backToCourses: 'பாடங்களுக்கு திரும்பு',
      studyMaterials: 'படிப்பு பொருட்கள்',
      pastPapers: 'பழைய வினாத்தாள்கள்',
      aiTutor: 'AI ஆசிரியர்',
      exams: 'தேர்வுகள்',
      progress: 'முன்னேற்றம்',
      overview: 'கண்ணோட்டம்',
      materials: 'பொருட்கள்',
      discussions: 'விவாதங்கள்',
    },
    
    // Navigation Cards
    navigation: {
      myCourses: 'எனது பாடங்கள்',
      myCoursesDesc: 'சேர்ந்த பாடங்கள் மற்றும் படிப்பு பொருட்களை அணுகவும்',
      viewCourses: 'பாடங்களைக் காண்க',
      myProgress: 'எனது முன்னேற்றம்',
      myProgressDesc: 'உங்கள் கற்றல் முன்னேற்றம் மற்றும் செயல்திறனைக் கண்காணிக்கவும்',
    },

    // AI Chat/Tutor
    chat: {
      aiTutor: 'செயற்கை நுண்ணறிவு ஆசிரியர்',
      aiStudyAssistant: 'செயற்கை நுண்ணறிவு படிப்பு உதவியாளர்',
      backToDashboard: 'டாஷ்போர்டுக்கு திரும்பு',
      aiOnline: 'AI ஆன்லைனில்',
      welcomeMessage: 'வணக்கம்! நான் இந்த பாடத்திற்கான உங்கள் செயற்கை நுண்ணறிவு ஆசிரியர். பாட பொருட்கள் பற்றிய கேள்விகள், கருத்துக்களை விளக்குதல், மற்றும் பதிவேற்றப்பட்ட உள்ளடக்கத்தின் அடிப்படையில் படிப்பு வழிகாட்டுதல் ஆகியவற்றில் நான் உங்களுக்கு உதவ முடியும். இன்று நீங்கள் என்ன கற்க விரும்புகிறீர்கள்?',
      welcomeMessageGeneral: 'வணக்கம்! நான் உங்கள் செயற்கை நுண்ணறிவு படிப்பு உதவியாளர். உங்கள் பாடங்கள் பற்றிய கேள்விகள், கருத்துக்களை விளக்குதல், அல்லது படிப்பு வழிகாட்டுதல் ஆகியவற்றில் நான் உங்களுக்கு உதவ முடியும். நீங்கள் என்ன அறிய விரும்புகிறீர்கள்?',
      inputPlaceholder: 'உங்கள் படிப்பு பற்றி எதையும் கேளுங்கள்...',
      sources: 'ஆதாரங்கள்',
      sourcesHelp: 'புதிய தாவலில் பாட பொருட்களைக் காண ஆதாரங்களைக் கிளிக் செய்யவும்',
      aiDisclaimer: 'செயற்கை நுண்ணறிவு தவறுகள் செய்யலாம். உங்கள் பாட பொருட்களுடன் முக்கியமான தகவல்களை சரிபார்க்கவும்.',
    },
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

// Helper function to get nested translation value
export const getTranslation = (
  language: Language,
  key: string
): string => {
  const keys = key.split('.');
  let value: any = translations[language];
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to English if translation not found
      value = translations.en;
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object' && fallbackKey in value) {
          value = value[fallbackKey];
        } else {
          return key; // Return key if not found in fallback
        }
      }
      break;
    }
  }
  
  return typeof value === 'string' ? value : key;
};