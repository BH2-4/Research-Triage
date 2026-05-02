import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "人人都能做科研",
  description: "面向所有人的 AI 科研启蒙与路径引导平台。先了解你是谁，再帮你找到最适合的探索路径。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="site-bg" />
        <main className="app-shell">{children}</main>
      </body>
    </html>
  );
}
