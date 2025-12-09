import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import type { AdminProfile } from '@/lib/auth';
import { LogoutButton } from './logout-button';

export function TopBar({ profile }: { profile: AdminProfile }) {
  const showSupabaseLink = profile.role === 'owner';

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-panel/60 px-6 py-4 backdrop-blur">
      {showSupabaseLink && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-slate-100">
          <span>For infrastructure tasks, jump to Supabase Dashboard.</span>
          <Link
            href="https://supabase.com/dashboard/"
            className="inline-flex items-center gap-1 text-primary hover:text-accent"
            target="_blank"
          >
            Open Supabase <ExternalLink size={14} />
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Signed in as</p>
          <p className="text-lg font-semibold text-white">
            {profile.username || profile.email || 'Admin'}
          </p>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
