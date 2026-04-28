'use client';
import { IBM_Plex_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { CedarCopilot, ProviderConfig } from 'cedar-os';
import { messageRenderers } from '@/cedar/messageRenderers';
import React from 'react';
import { getClientIdentity } from '@/lib/clientIdentity';
import { supabaseClient } from '@/lib/supabaseClient';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [identity, setIdentity] = React.useState(() => getClientIdentity());
  const [authState, setAuthState] = React.useState<{
    userId: string | null;
    accessToken: string | null;
  }>({
    userId: null,
    accessToken: null,
  });

  React.useEffect(() => {
    setIdentity(getClientIdentity());
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setAuthState({
        userId: data.session?.user.id ?? null,
        accessToken: data.session?.access_token ?? null,
      });
    });

    const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setAuthState({
        userId: session?.user.id ?? null,
        accessToken: session?.access_token ?? null,
      });
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const llmProvider = {
    provider: 'mastra' as const,
    baseURL: process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111',
    headers: authState.accessToken
      ? {
          Authorization: `Bearer ${authState.accessToken}`,
        }
      : undefined,
  } as ProviderConfig;

  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${plexSans.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <CedarCopilot
          userId={authState.userId ?? identity.userId}
          threadId={identity.threadId}
          llmProvider={llmProvider}
          messageRenderers={messageRenderers}
        >
          {children}
        </CedarCopilot>
      </body>
    </html>
  );
}
