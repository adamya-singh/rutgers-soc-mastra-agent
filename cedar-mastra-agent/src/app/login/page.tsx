'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.user && !data.session) {
        setSuccessMessage('Check your email to confirm your account, then return here to sign in.');
        setLoading(false);
        return;
      }

      router.push('/');
      return;
    }

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
    <div className="min-h-screen w-full bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16">
        <div className="w-full">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rutgers SOC</p>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">Sign in to continue</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Use your email and password to access saved schedules and preferences.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-border bg-surface-1 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-border-subtle hover:bg-surface-2"
            >
              Back to home
            </Link>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-surface-2/80 p-8 shadow-elev-1 backdrop-blur">
              <div className="flex rounded-full border border-border bg-surface-1 p-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'signin' ? 'bg-surface-2 text-foreground shadow-sm' : ''}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'signup' ? 'bg-surface-2 text-foreground shadow-sm' : ''}`}
                >
                  Sign up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                    placeholder="you@rutgers.edu"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                    placeholder="••••••••"
                  />
                </div>

                {successMessage && (
                  <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                    {successMessage}
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-full bg-action px-5 py-3 text-sm font-semibold text-action-foreground shadow-action-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading
                    ? mode === 'signup'
                      ? 'Creating account...'
                      : 'Signing in...'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Sign in'}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-border bg-surface-1/70 p-8 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Why sign in?</p>
              <h2 className="mt-3 text-xl font-semibold text-foreground">
                Keep your schedule synced
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Save your course plans across devices, pick up where you left off, and keep your
                schedule preferences aligned with Cedar.
              </p>
              <div className="mt-6 space-y-3 text-sm text-foreground/80">
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-action" />
                  <span>Store schedules and timetable metadata securely.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-action" />
                  <span>Unlock collaboration with advisors and peers.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-action" />
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
