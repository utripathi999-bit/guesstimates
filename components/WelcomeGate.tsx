'use client';

import { Flame, Lightbulb, Loader2, Lock, Mail, MessagesSquare, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';

type Mode = 'login' | 'signup';

/** Reasons the Google round trip can come back without a session. */
const OAUTH_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_unavailable: 'Google sign-in is not set up yet — use an email and password for now.',
  google_unverified: "That Google account's email isn't verified, so it can't be used to sign in.",
  google_failed: "Google sign-in didn't complete. Please try again.",
  full: 'GuessMates is full right now — every place is taken.',
};

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

  // The Google flow is a full page redirect, so anything that went wrong comes
  // back as a query parameter rather than through the form's own state.
  const oauthError = OAUTH_ERRORS[searchParams.get('error') ?? ''] ?? null;
  const shownError = error ?? oauthError;

  const next = searchParams.get('next');
  const googleHref = `/api/auth/google/start${next && next.startsWith('/') ? `?next=${encodeURIComponent(next)}` : ''}`;

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

        {/* A plain link, not a fetch: the flow is a redirect to Google and back,
            so there is nothing for client JavaScript to do or get wrong. */}
        <a
          href={googleHref}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl border-b-4 border-surface-border bg-surface px-6 py-3 text-base font-extrabold uppercase tracking-wide text-foreground transition-all duration-150 hover:-translate-y-0.5 active:translate-y-1 active:border-b-0"
        >
          <svg aria-hidden="true" viewBox="0 0 18 18" className="h-5 w-5">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          Continue with Google
        </a>

        <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-text-muted">
          <span className="h-px flex-1 bg-surface-border" />
          or use an email
          <span className="h-px flex-1 bg-surface-border" />
        </div>

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

          {shownError && (
            <div className="rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{shownError}</div>
          )}

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
