import type { Metadata } from "next";
import "./globals.css";

/**
 * The strict Content-Security-Policy in middleware.ts stamps a per-request nonce onto
 * every script Next.js renders. A prerendered page is served from cache and carries the
 * nonce of whichever request built it - which matches nothing - so the scripts would be
 * blocked outright. Rendering dynamically is the price of dropping 'unsafe-inline'.
 */
export const dynamic = 'force-dynamic';

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
