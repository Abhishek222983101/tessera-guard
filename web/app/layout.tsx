import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Suspense } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "TESSERA — agent behaviour guard",
  description: "Catch AI agents that drift from their role while their credentials stay valid. Built by Team Paradigm Shift for D3COY 1.0.",
  authors: [{ name: "Team Paradigm Shift" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full dark`}>
      <body className="min-h-full"><Suspense><Shell>{children}</Shell></Suspense><Toaster theme="dark" position="bottom-right" /></body>
    </html>
  );
}
