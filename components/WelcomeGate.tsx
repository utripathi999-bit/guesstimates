'use client';

import { Flame, Lightbulb, Loader2, Lock, Mail, MessagesSquare, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';

type Mode = 'login' | 'signup';

const SELLING_POINTS = [
  { icon: MessagesSquare, text: 'Ask a real interviewer clarifying questions before you start' },
  { icon: Lightbulb, text: 'Get nudged when stuck, and critiqued on what you actually wrote' },
  { icon: Flame, text: 'Two fresh cases a day, with streaks to keep you honest' },
];

export function WelcomeGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, signup } = useAuth();

  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = mode === 'login' ? await login(email, password) : await signup(email, password, displayName);

    if (result.success) {
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } else {
      setError(result.error ?? 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-4 py-12 lg:flex-row lg:items-start lg:gap-16 lg:py-20">
      <div className="flex-1 text-center lg:text-left">
        <div className="mb-4 inline-flex items-center gap-2.5 text-2xl font-black tracking-tight text-primary-dark">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-xl shadow-[0_4px_10px_-3px_hsl(96_100%_35%/0.55)]">
            🎯
          </span>
          GuessMates
        </div>
        <h1 className="text-display text-3xl font-black leading-tight text-foreground sm:text-4xl">
          Practise guesstimates like it&apos;s the real interview.
        </h1>
        <p className="mt-3 text-text-muted">
          Two cases a day, built around Indian market context. Create an account to track your streak and get on
          the leaderboard.
        </p>

        <ul className="mt-6 flex flex-col gap-3 text-left">
          {SELLING_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm font-bold text-foreground">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#e3f8cc] text-primary-dark">
                <Icon className="h-4 w-4" strokeWidth={2.5} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="shadow-card w-full max-w-md rounded-3xl bg-surface p-6">
        <h2 className="text-display text-2xl font-black text-foreground">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {mode === 'login' ? 'Sign in to pick up your streak.' : 'Use your real first name — your batch sees it on the leaderboard.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          {mode === 'signup' && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your first name"
                required
                minLength={2}
                maxLength={40}
                className="w-full rounded-xl bg-background py-2.5 pl-10 pr-3 text-sm outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoComplete="email"
              className="w-full rounded-xl bg-background py-2.5 pl-10 pr-3 text-sm outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-xl bg-background py-2.5 pl-10 pr-3 text-sm outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
            />
          </div>
          {mode === 'signup' && <p className="-mt-1 text-xs text-text-muted">Password must be at least 8 characters.</p>}

          {error && <div className="rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{error}</div>}

          <Button type="submit" variant="primary" size="md" disabled={submitting} className="mt-1 w-full">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <button
          onClick={() => {
            setError(null);
            setMode((m) => (m === 'login' ? 'signup' : 'login'));
          }}
          className="mt-4 w-full text-center text-sm font-bold text-action-dark hover:underline"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
