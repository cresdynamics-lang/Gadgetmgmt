import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GadgetHub Operations System",
  description: "GadgetHub retail operations and point of sale.",
  appleWebApp: { capable: true, title: "GadgetHub", statusBarStyle: "default" },
  icons: { apple: "/notifications-icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="auto">
      <body className="min-h-full bg-[#f4f4f2] text-[#0a0a0a]"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
