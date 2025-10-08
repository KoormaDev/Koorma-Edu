# KSAI Education Platform

A comprehensive learning and assessment system built with Next.js and FastAPI, following the architecture patterns of the KS AI Platform.

## 🚀 Features

### For Institutions/Admins
- **Course Management**: Create and manage courses with different exam types
- **Syllabus Structure**: Upload and organize syllabus into subjects and topics
- **Content Management**: Link study materials and past papers to syllabus items
- **Mock Exam Creation**: Create AI-generated or past paper-based assessments
- **Student Progress**: Track student performance and identify weak areas
- **Student Invitations**: Bulk invite students via email

### For Students
- **Course Enrollment**: Access enrolled courses and materials
- **AI Tutor**: Syllabus-restricted chat assistant for learning
- **Practice Tests**: Practice with past papers and questions
- **Mock Exams**: Take timed assessments with instant results
- **Progress Tracking**: View performance analytics and suggestions

## 🏗️ Architecture

This is a monorepo built with:
- **Frontend**: Next.js 14 with TypeScript and Tailwind CSS
- **Backend**: FastAPI with SQLAlchemy and PostgreSQL
- **Vector Database**: Qdrant for AI/RAG functionality
- **Package Management**: pnpm workspaces
- **Build System**: Turbo

```
ksai-exam-platform/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # FastAPI backend
├── packages/
│   ├── ui/           # Shared UI components
│   └── types/        # Shared TypeScript types
└── scripts/          # Development and deployment scripts
```

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker and Docker Compose
- pnpm (recommended) or npm

### Development Setup

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd KSAI-EXAM
   chmod +x scripts/*.sh
   ./scripts/setup.sh
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Update .env with your configuration
   ```

3. **Start development environment**:
   ```bash
   ./scripts/dev.sh
   ```

4. **Run database migrations**:
   ```bash
   cd apps/api
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   alembic upgrade head
   ```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Database**: localhost:5432 (postgres/password)

## 📚 Database Schema

### Core Entities
- **Users**: Students, admins, and institutions
- **Courses**: Top-level containers for learning content
- **Syllabus & SyllabusItems**: Hierarchical course structure
- **Content**: Study materials and past papers
- **MockExams & Questions**: Assessment system
- **StudentSubmissions**: Exam attempts and results

### Key Features
- Multi-tenant architecture with institution isolation
- Flexible user roles (student, admin, institution)
- Hierarchical syllabus structure (subject → topic → subtopic)
- AI-powered question generation and evaluation
- Comprehensive analytics and progress tracking

## 🎨 UI Components

The platform uses a custom UI library (`@ksai-exam/ui`) built with:
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling
- **Class Variance Authority**: Type-safe component variants
- **Lucide Icons**: Modern icon library

### Design System
- **Primary**: Blue (#2563EB) for primary actions
- **Secondary**: Light blue (#EFF6FF) for secondary elements
- **Success**: Green (#10B981) for positive feedback
- **Warning**: Yellow (#FBBF24) for warnings
- **Destructive**: Red (#EF4444) for errors

## 🔐 Authentication & Authorization

- **JWT-based authentication** with role-based access control
- **Multi-factor authentication** with CAPTCHA support
- **Institution-level isolation** for data security
- **Student approval workflow** for controlled access

### User Roles
- **Student**: Access courses, take exams, view results
- **Admin/Institution**: Manage courses, students, and content
- **System Admin**: Full platform management

## 🤖 AI Features

- **RAG-based AI Tutor**: Syllabus-restricted conversational AI
- **Question Generation**: AI-powered test questions from content
- **Automated Evaluation**: Instant feedback and scoring
- **Performance Analytics**: AI-driven insights and recommendations

## 🚀 Deployment

### Development
```bash
docker-compose up --build
```

### Production
1. Update environment variables for production
2. Build and deploy frontend to Vercel/similar
3. Deploy backend to AWS/GCP with proper database
4. Configure vector database and AI services

## 📝 API Documentation

The API is self-documenting with FastAPI. Access the interactive docs at `/docs` when running the backend.

### Key Endpoints
- `POST /auth/login` - User authentication
- `GET /courses` - List courses
- `POST /courses` - Create course (admin)
- `GET /exams/{id}` - Get exam details
- `POST /submissions` - Submit exam

## 🧪 Testing

```bash
# Backend tests
cd apps/api
pytest

# Frontend tests
cd apps/web
npm test
```

## 📦 Package Scripts

```bash
# Install all dependencies
pnpm install

# Start development
pnpm dev

# Build all packages
pnpm build

# Lint and format
pnpm lint
pnpm format

# Clean build artifacts
pnpm clean
```

## 🤝 Contributing

1. Follow the existing code style and patterns
2. Update tests for any new features
3. Ensure all packages build successfully
4. Update documentation as needed

## 📄 License

This project is licensed under the MIT License.

## 🙋‍♂️ Support

For questions and support, please refer to the documentation or create an issue in the repository.