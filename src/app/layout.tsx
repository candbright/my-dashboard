import type { Metadata } from "next";
import { Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { SkipLink } from "@/components/layout/SkipLink";
import { AuthProvider } from "@/contexts/AuthContext";
import { LeaveGuardProvider } from "@/contexts/LeaveGuardContext";

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

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
    <html lang="zh-CN" className={`h-full antialiased ${notoSerifSC.variable}`}>
      <head>
        {/*
          The entry-animation wrappers in `@/components/ui/Animations` server-render with
          `style="opacity:0"` and only become visible once their animation runs on the
          client. With JavaScript unavailable that animation never runs, so the content
          would stay invisible **permanently** — on the public resume page, which wraps every
          section in `ScrollReveal`, that means a blank page.

          This restores the visible end state when scripting is off. It targets
          `[data-motion-reveal]`, an attribute the wrappers set explicitly, rather than a
          hand-written style selector: a rule that pattern-matches generated inline styles
          would silently stop matching the day the animation changed, and nothing would fail
          to tell us. `src/components/ui/Animations.a11y.test.tsx` asserts the wrappers still
          carry the attribute, so the two cannot drift apart unnoticed.
        */}
        <noscript>
          <style>{`[data-motion-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SkipLink />
        <AuthProvider>
          <LeaveGuardProvider>
            <Navbar />
            <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto">
              {children}
            </main>
          </LeaveGuardProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
