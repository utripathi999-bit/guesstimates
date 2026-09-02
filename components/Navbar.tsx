'use client';

import { Flame, LayoutGrid, ListChecks, Sparkles, Trophy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStreakData } from '@/lib/streakStorage';

const NAV_LINKS = [
  { href: '/', label: 'Today', icon: Sparkles },
  { href: '/archive', label: 'Archive', icon: LayoutGrid },
  { href: '/flashcards', label: 'Flashcards', icon: ListChecks },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];

export function Navbar() {
  const pathname = usePathname();
  const { currentStreak, xp } = useStreakData();

  return (
    <header className="sticky top-0 z-40 bg-surface/90 shadow-card backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-black tracking-tight text-primary-dark">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-lg shadow-[0_4px_10px_-3px_hsl(96_100%_35%/0.55)]">
            🎯
          </span>
          <span className="hidden sm:inline">GuesstimateDaily</span>
        </Link>

        <nav className="flex items-center gap-1 rounded-2xl bg-background/70 p-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-bold transition-all sm:px-3
                  ${active ? 'bg-primary text-white shadow-[0_3px_8px_-2px_hsl(96_100%_35%/0.5)]' : 'text-text-muted hover:bg-black/5 hover:text-foreground'}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-gradient-to-br from-[#ffdca8] to-[#ffc372] px-3 py-1.5 font-black text-[#8a4b00] shadow-[0_3px_8px_-2px_hsl(35_100%_50%/0.4)]">
            <Flame
              className={`h-5 w-5 ${currentStreak > 0 ? 'animate-flame-flicker' : ''}`}
              strokeWidth={2.5}
              fill={currentStreak > 0 ? '#FF9600' : 'none'}
            />
            <span className="tabular-nums">{currentStreak}</span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-gradient-to-br from-[#aee6fd] to-[#7ed2fb] px-3 py-1.5 font-black text-action-dark shadow-[0_3px_8px_-2px_hsl(199_96%_50%/0.4)]">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            <span className="tabular-nums">{xp}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
