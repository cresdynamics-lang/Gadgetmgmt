import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "GadgetHub Operations System",
  description: "GadgetHub retail operations and point of sale.",
  applicationName: "GadgetHub",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "GadgetHub",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/brand/icon-black.png",
    apple: "/brand/apple-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full bg-[#f5f5f5] text-[#111111]"><AuthProvider>{children}<PwaRegister /></AuthProvider></body>
    </html>
  );
}
