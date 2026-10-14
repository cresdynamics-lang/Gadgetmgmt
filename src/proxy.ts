import { auth } from "@/auth";
import { canAccessPage } from "@/lib/access";

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const publicCustomerPayment = pathname.startsWith("/pay/") || pathname.startsWith("/request/");
  if (!request.auth && pathname !== "/login" && !publicCustomerPayment) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }
  if (request.auth?.user && pathname !== "/login" && !publicCustomerPayment && !canAccessPage(request.auth.user.role, pathname)) {
    return Response.redirect(new URL("/dashboard", request.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
