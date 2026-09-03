'use client';

import { Check, Loader2, Mail, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { extractApiErrorMessage } from '@/lib/apiError';

export interface AdminUser {
  email: string;
  displayName: string;
  createdAt: string;
}

function formatJoined(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminUsersList({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(user: AdminUser) {
    setEditingEmail(user.email);
    setDraftName(user.displayName);
    setError(null);
  }

  async function save(email: string) {
    const displayName = draftName.trim();
    if (!displayName) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      });
      if (!res.ok) {
        setError(await extractApiErrorMessage(res, 'Could not save that name.'));
        return;
      }
      setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, displayName } : u)));
      setEditingEmail(null);
    } catch {
      setError('Could not save that name.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{error}</div>
      )}

      <ul className="flex flex-col gap-3">
        {users.map((user) => {
          const editing = editingEmail === user.email;
          return (
            <li
              key={user.email}
              className="shadow-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e3f8cc] font-black text-primary-dark">
                {user.displayName.slice(0, 1).toUpperCase()}
              </span>

              {editing ? (
                <>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(user.email);
                      if (e.key === 'Escape') setEditingEmail(null);
                    }}
                    autoFocus
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-xl bg-background px-3 py-1.5 text-sm font-bold outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
                  />
                  <button
                    onClick={() => save(user.email)}
                    disabled={saving || !draftName.trim()}
                    aria-label="Save name"
                    className="rounded-full bg-primary p-2 text-white disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}
                  </button>
                  <button
                    onClick={() => setEditingEmail(null)}
                    aria-label="Cancel"
                    className="rounded-full p-2 text-text-muted hover:bg-black/5"
                  >
                    <X className="h-4 w-4" strokeWidth={3} />
                  </button>
                </>
              ) : (
                <>
                  <span className="font-black text-foreground">{user.displayName}</span>
                  <button
                    onClick={() => startEdit(user)}
                    aria-label={`Edit name for ${user.displayName}`}
                    className="rounded-full p-1.5 text-text-muted hover:bg-black/5 hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-muted">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </span>
                  <span className="ml-auto whitespace-nowrap text-xs font-bold text-text-muted">
                    Joined {formatJoined(user.createdAt)}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
