import { Mail, ShieldCheck, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getSessionAccountFromCookies, isOwner, listAllAccounts } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function formatJoined(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function AdminPage() {
  const account = await getSessionAccountFromCookies();

  // Not "403" — a non-owner shouldn't even learn this page exists.
  if (!isOwner(account)) notFound();

  const accounts = await listAllAccounts();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-assumed-dark">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={3} />
        Owner only
      </p>
      <h1 className="text-display text-3xl font-black text-foreground">Registered users</h1>
      <p className="mt-1 text-text-muted">
        {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}. Visible only to you — emails are never
        shown to other users anywhere in the app.
      </p>

      {accounts.length === 0 ? (
        <div className="shadow-card mt-6 flex flex-col items-center gap-2 rounded-2xl bg-surface p-8 text-center text-text-muted">
          <Users className="h-6 w-6" strokeWidth={2.5} />
          No accounts yet.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {accounts.map((entry) => (
            <li key={entry.email} className="shadow-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-surface px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e3f8cc] font-black text-primary-dark">
                {entry.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="font-black text-foreground">{entry.displayName}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-muted">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{entry.email}</span>
              </span>
              <span className="ml-auto whitespace-nowrap text-xs font-bold text-text-muted">
                Joined {formatJoined(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
