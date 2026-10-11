import { auth } from "@/auth";
import { canAccessPage } from "@/lib/access";

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  if (!request.auth && pathname !== "/login") {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }
  if (request.auth?.user && pathname !== "/login" && !canAccessPage(request.auth.user.role, pathname)) {
    return Response.redirect(new URL("/dashboard", request.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};