const requiredEnvVars = [
  'NEXT_PUBLIC_MASTRA_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

const missing = requiredEnvVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `Missing frontend build environment variables: ${missing.join(', ')}`,
  );
  console.error(
    'Next.js needs these values during build as well as at runtime.',
  );
  process.exit(1);
}
