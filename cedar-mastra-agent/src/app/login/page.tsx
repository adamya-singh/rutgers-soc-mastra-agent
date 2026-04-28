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

  // Pick up the user's chosen / system theme so login matches the rest of the app.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const next = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', next === 'dark');
  }, []);

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
    <div className="relative flex min-h-screen w-full items-center justify-center px-6 py-12">
      <Link
        href="/"
        className="focus-ring absolute left-6 top-6 inline-flex items-center gap-1 rounded text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <span aria-hidden="true">←</span> Back
      </Link>

      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-primary" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Rutgers SOC</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {mode === 'signup' ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'signup'
            ? 'Sign up to save schedules across devices.'
            : 'Use your email and password to continue.'}
        </p>

        <div className="mt-6 inline-flex rounded border border-border bg-surface-2 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`focus-ring rounded px-3 py-1 transition ${mode === 'signin' ? 'bg-surface-1 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
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
            className={`focus-ring rounded px-3 py-1 transition ${mode === 'signup' ? 'bg-surface-1 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="focus-ring mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
              placeholder="you@rutgers.edu"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="focus-ring mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          {successMessage && (
            <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="focus-ring flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? mode === 'signup'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
