import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public routes that don't require authentication
const publicRoutes = ['/', '/login', '/register', '/about'];

// Define role-based route access
const roleRoutes = {
  admin: ['/admin'],
  student: ['/student'],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public routes (exact match or starts with, but not root path matching everything)
  if (publicRoutes.some(route => {
    if (route === '/') {
      return pathname === '/'; // Exact match for root path only
    }
    return pathname === route || pathname.startsWith(route + '/');
  })) {
    return NextResponse.next();
  }

  // Check for auth token in cookies or headers
  const authCookie = request.cookies.get('auth-store');
  
  if (!authCookie) {
    // No auth token, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Parse the auth store to get user info
    const authData = JSON.parse(authCookie.value);
    const user = authData?.state?.user;
    
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check role-based access
    const userRole = user.role?.toLowerCase();
    
    // Admin-level roles that can access admin routes
    const adminRoles = ['admin', 'super_admin', 'institution'];
    
    // Check if user is trying to access admin routes
    if (pathname.startsWith('/admin') && !adminRoles.includes(userRole)) {
      return NextResponse.redirect(new URL('/student', request.url));
    }
    
    // Check if user is trying to access student routes  
    if (pathname.startsWith('/student') && adminRoles.includes(userRole)) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    // If there's an error parsing auth data, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)',
  ],
};