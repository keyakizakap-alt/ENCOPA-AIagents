import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENCOPA（エンコパ） | 決めるところから、予定に入るまで",
  description: "会場選び、アレルギー確認、プラン共有、参加者との連絡をひとつにまとめる会食・宴会アプリ。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
