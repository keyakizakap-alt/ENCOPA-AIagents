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
  description: "目的と予算から会場を絞り、参加者確認、幹事承認、予約と予定確保までを支援する宴会オーケストレーター。",
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
