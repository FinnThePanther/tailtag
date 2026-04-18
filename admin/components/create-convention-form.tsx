'use client';

import { useState, useTransition } from 'react';

import { createConventionAction } from '@/app/(dashboard)/conventions/actions';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Sydney',
  'Australia/Sydney',
];

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function CreateConventionForm() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [createDefaultGameplayPack, setCreateDefaultGameplayPack] = useState(true);
  const [startImmediately, setStartImmediately] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(toSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlug(value);
    setSlugEdited(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createConventionAction({
          name,
          slug,
          startDate: startDate || null,
          endDate: endDate || null,
          location: location || null,
          timezone,
          createDefaultGameplayPack,
          startImmediately,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-slate-200">Convention name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. FurFest 2026"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary placeholder:text-muted"
          />
        </div>
        <div>
          <label className="text-sm text-slate-200">Slug</label>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="e.g. furfest-2026"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary placeholder:text-muted"
          />
          <p className="mt-1 text-xs text-muted">Lowercase letters, numbers, and hyphens only.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-slate-200">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-sm text-slate-200">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-slate-200">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Convention Center, City, State"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary placeholder:text-muted"
          />
        </div>
        <div>
          <label className="text-sm text-slate-200">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          >
            {TIMEZONES.map((tz) => (
              <option
                key={tz}
                value={tz}
              >
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={createDefaultGameplayPack}
            onChange={(e) => setCreateDefaultGameplayPack(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold text-white">Create default gameplay pack</span>
            <span className="text-xs text-muted">
              Adds starter daily tasks and convention achievements.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={startImmediately}
            onChange={(e) => setStartImmediately(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold text-white">
              Start immediately if within date window
            </span>
            <span className="text-xs text-muted">
              Future conventions will be scheduled and still require a manual start.
            </span>
          </span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create convention'}
        </button>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </form>
  );
}
