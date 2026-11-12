import { auth } from "@/auth";
import { canAccessPage, hasSensitiveQuery, isOwnerEntitlementPath, isSensitiveQueryKey, relativeAppPath, safeInternalPath } from "@/lib/access";
import { getAccessMap } from "@/lib/entitlements";

function redirectTo(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" },
  });
}

export default auth(async (request) => {
  const pathname = request.nextUrl.pathname;
  if (hasSensitiveQuery(request.nextUrl.searchParams) || (request.nextUrl.searchParams.has("callbackUrl") && !safeInternalPath(request.nextUrl.searchParams.get("callbackUrl")))) {
    const clean = request.nextUrl.clone();
    for (const key of [...clean.searchParams.keys()]) {
      if (isSensitiveQueryKey(key)) clean.searchParams.delete(key);
    }
    const callbackUrl = clean.searchParams.get("callbackUrl");
    const safeCallback = safeInternalPath(callbackUrl);
    if (callbackUrl && !safeCallback) clean.searchParams.delete("callbackUrl");
    if (safeCallback) clean.searchParams.set("callbackUrl", safeCallback);
    return redirectTo(relativeAppPath(clean));
  }

  const publicCustomerPayment = pathname.startsWith("/pay/") || pathname.startsWith("/request/");
  if (!request.auth && pathname !== "/login" && !publicCustomerPayment) {
    const login = new URL("/login", "http://gadgethub.local");
    const callbackUrl = safeInternalPath(pathname);
    if (callbackUrl && callbackUrl !== "/login") login.searchParams.set("callbackUrl", callbackUrl);
    return redirectTo(relativeAppPath(login));
  }
  if (request.auth?.user && pathname !== "/login" && !publicCustomerPayment) {
    let grants;
    try {
      grants = await getAccessMap();
    } catch {
      if (request.auth.user.role === "OWNER" && isOwnerEntitlementPath(pathname)) return;
      return new Response("Page access could not be checked. Try again shortly.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    if (!canAccessPage(request.auth.user.role, pathname, grants)) {
      if (pathname !== "/dashboard" && canAccessPage(request.auth.user.role, "/dashboard", grants)) {
        return redirectTo("/dashboard");
      }
      return new Response("Your role does not include this page.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|notifications-sw.js|notifications-offline.html|notifications-icon|manifest.webmanifest).*)"],
};
