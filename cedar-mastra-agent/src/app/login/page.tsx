'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push('/');
  };

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top,_#e5f1ff,_#f7f9fc_45%,_#ffffff)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16">
        <div className="w-full">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Rutgers SOC</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Sign in to continue</h1>
              <p className="mt-2 text-sm text-slate-600">
                Use your email and password to access saved schedules and preferences.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              Back to home
            </Link>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    placeholder="you@rutgers.edu"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white/70 p-8 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Why sign in?</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">
                Keep your schedule synced
              </h2>
              <p className="mt-3 text-sm text-slate-600">
                Save your course plans across devices, pick up where you left off, and keep your
                schedule preferences aligned with Cedar.
              </p>
              <div className="mt-6 space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-slate-500" />
                  <span>Store schedules and timetable metadata securely.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-slate-500" />
                  <span>Unlock collaboration with advisors and peers.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-slate-500" />
                  <span>Get smarter recommendations from Cedar.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
