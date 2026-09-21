'use client';
import Link from 'next/link';
import { Bot, CalendarCheck, Home, MapPin, Settings, Users, UtensilsCrossed } from 'lucide-react';

export type ShellSection = 'home' | 'venues' | 'participants' | 'agent' | 'settings';

/**
 * Navigation is one list rendered two ways: a rail on the desktop, a tab bar on the phone.
 * Keeping a single source means a section can never appear in one and be missing from the
 * other, which is how navigation drifts.
 */
const NAV: { id: ShellSection; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'ホーム', short: 'ホーム', icon: Home },
  { id: 'venues', label: '会場候補', short: '会場', icon: MapPin },
  { id: 'participants', label: '参加者・連絡', short: '参加者', icon: Users },
  { id: 'agent', label: 'AIエージェント', short: 'AI', icon: Bot },
  { id: 'settings', label: '設定', short: '設定', icon: Settings },
];

export function AppShell({
  active,
  onNavigate,
  children,
}: {
  active: ShellSection;
  onNavigate: (section: ShellSection) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface text-ink lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden bg-sidebar text-sidebar-ink lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link href="/" className="flex items-center gap-3 px-5 py-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand text-white"><UtensilsCrossed className="size-5" /></span>
          <span className="min-w-0">
            <span className="block text-[17px] font-black tracking-[.06em]">ENCOPA</span>
            <span className="block truncate text-[11px] text-sidebar-muted">集まるって、こんなに楽しい。</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={active === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                active === id ? 'bg-brand text-white' : 'text-sidebar-ink/85 hover:bg-sidebar-raised'
              }`}
            >
              <Icon className="size-[18px] shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="m-3 rounded-2xl bg-sidebar-raised p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-sand"><CalendarCheck className="size-4" />いい宴を、いいチームで。</p>
          <p className="mt-2 text-[11px] leading-5 text-sidebar-muted">人が集まる時間を、もっと価値あるものに。</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>

      {/* The tab bar owns the bottom of the phone screen; the padding above reserves its space. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {NAV.map(({ id, short, icon: Icon }) => (
            <li key={id} className="flex-1">
              <button
                type="button"
                aria-current={active === id ? 'page' : undefined}
                onClick={() => onNavigate(id)}
                className={`flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                  active === id ? 'text-brand-ink' : 'text-muted-ink'
                }`}
              >
                <Icon className="size-[18px]" />
                {short}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
