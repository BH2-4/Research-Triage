import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "科研课题分诊台",
  description: "面向学生科研项目的 AI 分诊入口，先判断状态，再给最小可行路径。",
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
