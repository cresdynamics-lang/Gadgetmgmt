import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
import { PwaLifecycle } from "@/components/pwa-lifecycle";

export const metadata: Metadata = {
  title: "GadgetHub Operations System",
  description: "GadgetHub retail operations and point of sale.",
  appleWebApp: { capable: true, title: "GadgetHub", statusBarStyle: "default" },
  icons: { icon: "/brand/icon-black.png", apple: "/brand/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f4f2" }, { media: "(prefers-color-scheme: dark)", color: "#141a16" }], viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html suppressHydrationWarning lang="en" className="h-full antialiased" data-scroll-behavior="auto">
      <head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem("gadgethub-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch{};try{if(location.pathname!=="/login"&&sessionStorage.getItem("gadgethub-lock-pending"))document.documentElement.dataset.lockPending="true";}catch{}` }}/></head>
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]"><AuthProvider><PwaLifecycle />{children}</AuthProvider></body>
    </html>
  );
}
