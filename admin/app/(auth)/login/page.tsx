'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [persistentError, setPersistentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = createBrowserSupabaseClient();
  const incomingError = searchParams.get('error');

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('admin_login_email');
    if (storedEmail) {
      setEmail(storedEmail);
    }

    const existing = incomingError || sessionStorage.getItem('admin_login_error');
    if (existing) {
      setPersistentError(existing);
      sessionStorage.setItem('admin_login_error', existing);
    }
  }, [incomingError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setPersistentError(null);
    sessionStorage.removeItem('admin_login_error');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setPersistentError(signInError.message);
        sessionStorage.setItem('admin_login_error', signInError.message);
        sessionStorage.setItem('admin_login_email', email);
        setIsSubmitting(false);
        return;
      }

      sessionStorage.removeItem('admin_login_email');
      router.replace('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-panel p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">TailTag Admin</h1>
        <p className="mt-2 text-sm text-slate-300">Sign in with your admin credentials.</p>
        {(error || persistentError) && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error ?? persistentError ?? 'You do not have access to that page.'}
          </div>
        )}
        <form
          className="mt-6 space-y-4"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <label
              className="text-sm text-slate-200"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm text-slate-200"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-panel p-8 shadow-xl">
            <h1 className="text-2xl font-semibold text-white">TailTag Admin</h1>
            <p className="mt-2 text-sm text-slate-300">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
