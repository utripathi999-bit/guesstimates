'use client';

import { Loader2, Lock, Mail, User } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'login' | 'signup';

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = mode === 'login' ? await login(email, password) : await signup(email, password, displayName);

    setSubmitting(false);
    if (result.success) {
      handleClose();
    } else {
      setError(result.error ?? 'Something went wrong');
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-display text-2xl font-black text-foreground">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {mode === 'login'
              ? 'Sign in to save your streak to the leaderboard.'
              : 'Use your real first name — your batch sees it on the leaderboard.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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

          {error && (
            <div className="shadow-card rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{error}</div>
          )}

          <Button type="submit" variant="action" size="md" disabled={submitting} className="mt-1 w-full">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <button
          onClick={() => {
            setError(null);
            setMode((m) => (m === 'login' ? 'signup' : 'login'));
          }}
          className="text-center text-sm font-bold text-action-dark hover:underline"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </Modal>
  );
}
