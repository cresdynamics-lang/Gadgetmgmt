import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GadgetHub Operations System",
  description: "GadgetHub retail operations and point of sale.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#fafafa] text-[#0a0a0a]"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
