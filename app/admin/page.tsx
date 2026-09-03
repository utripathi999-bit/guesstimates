import { ShieldCheck, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { AdminUsersList } from '@/components/AdminUsersList';
import { getSessionAccountFromCookies, isOwner, listAllAccounts } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
      <h1 className="text-display text-3xl font-black text-foreground">Registered students</h1>
      <p className="mb-6 mt-1 text-text-muted">
        {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}. Emails are visible only to you — never
        shown to students anywhere in the app. Click the pencil to correct a name.
      </p>

      {accounts.length === 0 ? (
        <div className="shadow-card flex flex-col items-center gap-2 rounded-2xl bg-surface p-8 text-center text-text-muted">
          <Users className="h-6 w-6" strokeWidth={2.5} />
          No accounts yet.
        </div>
      ) : (
        <AdminUsersList initialUsers={accounts} />
      )}
    </main>
  );
}
