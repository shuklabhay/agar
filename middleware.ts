import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isAuthPage = createRouteMatcher(["/login", "/signup"]);
const isProtectedRoute = createRouteMatcher(["/classes", "/classes/(.*)", "/settings"]);
const isRootPage = createRouteMatcher(["/"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();
  
  // Redirect authenticated users from auth pages to /classes
  if (isAuthPage(request) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/classes");
  }
  
  // Redirect authenticated users from root to /classes
  if (isRootPage(request) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/classes");
  }
  
  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute(request) && !isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
