import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "ResumeVault — 个人简历管理平台",
  description: "上传、管理和展示你的 Markdown 格式个人简历，打造精美的在线简历展示页面。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
