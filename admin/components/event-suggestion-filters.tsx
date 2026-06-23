'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'spam', label: 'Spam' },
  { value: 'all', label: 'All' },
];

export function EventSuggestionFilters({ initialStatus }: { initialStatus?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [status, setStatus] = useState(initialStatus || 'active');

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(search.toString());
    params.delete('status');
    if (status && status !== 'active') {
      params.set('status', status);
    }
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  return (
    <form
      onSubmit={apply}
      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div>
        <label
          htmlFor="status-select"
          className="text-sm text-slate-200"
        >
          Status
        </label>
        <select
          id="status-select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          {STATUS_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
