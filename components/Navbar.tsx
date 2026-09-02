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
    <header className="sticky top-0 z-40 border-b-2 border-surface-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-primary-dark">
          <span className="text-2xl">🎯</span>
          <span className="hidden sm:inline">GuesstimateDaily</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-bold transition-colors sm:px-3
                  ${active ? 'bg-[#e3f8cc] text-primary-dark' : 'text-text-muted hover:bg-black/5'}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-[#fff4e5] px-3 py-1.5 font-extrabold text-streak">
            <Flame
              className={`h-5 w-5 ${currentStreak > 0 ? 'animate-flame-flicker' : ''}`}
              strokeWidth={2.5}
              fill={currentStreak > 0 ? '#FF9600' : 'none'}
            />
            {currentStreak}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-[#d3eefd] px-3 py-1.5 font-extrabold text-action-dark">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            {xp}
          </div>
        </div>
      </div>
    </header>
  );
}
