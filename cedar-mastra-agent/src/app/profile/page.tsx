'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';
import { buildMastraApiUrl } from '@/lib/mastraConfig';
import { clearLocalSchedules } from '@/lib/scheduleStorage';

type DegreeNavigatorCourseStatus =
  | 'completed'
  | 'current'
  | 'planned'
  | 'ap'
  | 'placement'
  | 'unused'
  | 'unknown';

type DegreeNavigatorRequirementStatus =
  | 'complete'
  | 'projected'
  | 'in_progress'
  | 'incomplete'
  | 'unknown';

interface DegreeNavigatorCourseRef {
  courseCode: string;
  title?: string;
  campus?: string;
  credits?: number;
  grade?: string;
  status?: DegreeNavigatorCourseStatus;
  specialCode?: string;
  repeatedCourseCode?: string;
  usedAs?: string;
  termLabel?: string;
  rawText?: string;
}

interface DegreeNavigatorProgram {
  code?: string;
  title: string;
  campus?: string;
  kind?: 'core' | 'major' | 'minor' | 'certificate' | 'other';
}

interface DegreeNavigatorRequirement {
  code?: string;
  title: string;
  status?: DegreeNavigatorRequirementStatus;
  summary?: string;
  completedCount?: number;
  totalCount?: number;
  neededCount?: number;
  courses?: DegreeNavigatorCourseRef[];
  stillNeeded?: Array<{
    label: string;
    courseOptions?: string[];
    requiredCount?: number;
    completedCount?: number;
    neededCount?: number;
    description?: string;
  }>;
  requirementOptions?: Array<{
    label: string;
    courseOptions?: string[];
    requiredCount?: number;
    completedCount?: number;
    neededCount?: number;
    description?: string;
  }>;
  notes?: string[];
  conditions?: string[];
}

interface DegreeNavigatorAudit {
  programCode?: string;
  title: string;
  versionTerm?: string;
  completedCredits?: number | null;
  completedRequirements?: {
    completed: number;
    total: number;
  };
  overallStatus?: string;
  gpa?: {
    label?: string;
    value?: number;
    status?: string;
    qualityPoints?: number;
    credits?: number;
  };
  requirements: DegreeNavigatorRequirement[];
  conditions?: string[];
  notes?: string[];
  unusedCourses?: DegreeNavigatorCourseRef[];
}

interface DegreeNavigatorTranscriptTerm {
  label: string;
  year?: number;
  termName?: string;
  termCode?: string;
  source: 'transcript' | 'ap_credit' | 'placement' | 'other';
  courses: DegreeNavigatorCourseRef[];
}

interface DegreeNavigatorProfileRow {
  id: string;
  userId: string;
  schemaVersion: number;
  studentName: string | null;
  ruid: string | null;
  netid: string | null;
  schoolCode: string | null;
  schoolName: string | null;
  graduationYear: string | null;
  graduationMonth: string | null;
  degreeCreditsEarned: number | null;
  cumulativeGpa: number | null;
  plannedCourseCount: number | null;
  programs: DegreeNavigatorProgram[];
  audits: DegreeNavigatorAudit[];
  transcriptTerms: DegreeNavigatorTranscriptTerm[];
  runNotes: {
    capturedFrom?: string;
    capturedAt?: string;
    disclaimer?: string;
    extractionWarnings?: string[];
    unavailableRoutes?: string[];
  };
  sourceSessionId: string | null;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

type MetadataValue =
  | string
  | number
  | boolean
  | null
  | MetadataValue[]
  | { [key: string]: MetadataValue };

interface AccountInfo {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  role: string | null;
  provider: string | null;
  appMetadata: Record<string, MetadataValue>;
  userMetadata: Record<string, MetadataValue>;
}

interface DegreeNavigatorProfileResponse {
  profile: DegreeNavigatorProfileRow | null;
}

interface ClearDegreeNavigatorProfileResponse {
  cleared: boolean;
}

function applyStoredTheme() {
  if (typeof window === 'undefined') return;
  const stored = window.localStorage.getItem('theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatNumber(value?: number | null, options?: Intl.NumberFormatOptions) {
  if (value === null || value === undefined) return 'Not available';
  return new Intl.NumberFormat(undefined, options).format(value);
}

function titleCase(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status?: DegreeNavigatorRequirementStatus | DegreeNavigatorCourseStatus) {
  switch (status) {
    case 'complete':
    case 'completed':
      return 'border-success/30 bg-success/10 text-success';
    case 'projected':
    case 'in_progress':
    case 'current':
    case 'planned':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'incomplete':
    case 'unused':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-surface-2 text-muted-foreground';
  }
}

function courseDetails(course: DegreeNavigatorCourseRef) {
  return [
    course.credits !== undefined ? `${formatNumber(course.credits)} credits` : null,
    course.grade ? `Grade ${course.grade}` : null,
    course.termLabel,
    course.usedAs ? `Used as ${course.usedAs}` : null,
    course.repeatedCourseCode ? `Repeat ${course.repeatedCourseCode}` : null,
    course.specialCode ? `Code ${course.specialCode}` : null,
  ].filter(Boolean);
}

function metadataEntries(metadata: Record<string, MetadataValue>) {
  return Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined);
}

function renderMetadataValue(value: MetadataValue): string {
  if (Array.isArray(value)) {
    return value.map(renderMetadataValue).join(', ');
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function getAccountInfo(
  sessionUser: NonNullable<Awaited<ReturnType<typeof supabaseClient.auth.getUser>>['data']['user']>,
): AccountInfo {
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? null,
    phone: sessionUser.phone ?? null,
    createdAt: sessionUser.created_at ?? null,
    updatedAt: sessionUser.updated_at ?? null,
    lastSignInAt: sessionUser.last_sign_in_at ?? null,
    role: sessionUser.role ?? null,
    provider:
      typeof sessionUser.app_metadata.provider === 'string'
        ? sessionUser.app_metadata.provider
        : null,
    appMetadata: sessionUser.app_metadata as Record<string, MetadataValue>,
    userMetadata: sessionUser.user_metadata as Record<string, MetadataValue>,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [account, setAccount] = React.useState<AccountInfo | null>(null);
  const [degreeProfile, setDegreeProfile] = React.useState<DegreeNavigatorProfileRow | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isClearingDegreeProfile, setIsClearingDegreeProfile] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    applyStoredTheme();
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
        await Promise.all([supabaseClient.auth.getSession(), supabaseClient.auth.getUser()]);

      if (!isMounted) return;

      if (sessionError || userError) {
        setError(sessionError?.message ?? userError?.message ?? 'Unable to load your profile.');
        setIsLoading(false);
        return;
      }

      const user = userData.user;
      const accessToken = sessionData.session?.access_token;

      if (!user || !accessToken) {
        setAccount(null);
        setDegreeProfile(null);
        setIsLoading(false);
        return;
      }

      setAccount(getAccountInfo(user));

      try {
        const response = await fetch(buildMastraApiUrl('/degree-navigator/profile'), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const json = (await response.json()) as DegreeNavigatorProfileResponse & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? `Degree Navigator request failed (${response.status})`);
        }
        if (isMounted) setDegreeProfile(json.profile);
      } catch (degreeNavigatorError) {
        if (isMounted) {
          setError(
            degreeNavigatorError instanceof Error
              ? degreeNavigatorError.message
              : 'Unable to load Degree Navigator information.',
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const signOut = async () => {
    await supabaseClient.auth.signOut();
    clearLocalSchedules();
    router.push('/login');
  };

  const clearDegreeNavigatorProfile = async () => {
    if (!degreeProfile || isClearingDegreeProfile) return;

    const confirmed = window.confirm(
      'Clear all saved Degree Navigator information from your profile? This removes saved student profile, programs, audits, transcript terms, and run notes from the app.',
    );
    if (!confirmed) return;

    setIsClearingDegreeProfile(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: sessionError } = await supabaseClient.auth.getSession();
      const accessToken = data.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error(
          sessionError?.message ?? 'Sign in again before clearing Degree Navigator information.',
        );
      }

      const response = await fetch(buildMastraApiUrl('/degree-navigator/profile'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const json = (await response.json()) as ClearDegreeNavigatorProfileResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? `Degree Navigator clear request failed (${response.status})`);
      }

      setDegreeProfile(null);
      setSuccessMessage(
        json.cleared
          ? 'Degree Navigator information cleared from your profile.'
          : 'No saved Degree Navigator information was found.',
      );
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : 'Unable to clear Degree Navigator information.',
      );
    } finally {
      setIsClearingDegreeProfile(false);
    }
  };

  const completedRequirementCount = React.useMemo(
    () =>
      degreeProfile?.audits.reduce(
        (total, audit) =>
          total +
          audit.requirements.filter((requirement) => requirement.status === 'complete').length,
        0,
      ) ?? 0,
    [degreeProfile],
  );

  const courseCount = React.useMemo(
    () =>
      degreeProfile?.transcriptTerms.reduce((total, term) => total + term.courses.length, 0) ?? 0,
    [degreeProfile],
  );

  if (isLoading) {
    return (
      <ProfileShell>
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-pulse rounded-full border border-primary/40 bg-primary/10" />
            <p className="mt-4 text-sm text-muted-foreground">Loading your profile...</p>
          </div>
        </div>
      </ProfileShell>
    );
  }

  if (!account) {
    return (
      <ProfileShell>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Profile</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Sign in to see your profile.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your account details and Degree Navigator capture are private to your authenticated
            Rutgers SOC account.
          </p>
          <Link
            href="/login"
            className="focus-ring mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-border bg-surface-1 p-6 shadow-elev-2 sm:p-8">
          <div className="absolute right-0 top-0 h-56 w-56 -translate-y-1/2 translate-x-1/3 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                Student profile
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {degreeProfile?.studentName ?? account.email ?? 'Your profile'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                A quiet overview of your Rutgers SOC account, saved Degree Navigator capture,
                programs, audits, and transcript history.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/#degree-navigator"
                className="focus-ring inline-flex h-10 items-center rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-foreground transition hover:bg-surface-2"
              >
                Sync Degree Navigator
              </Link>
              <button
                type="button"
                onClick={clearDegreeNavigatorProfile}
                disabled={!degreeProfile || isClearingDegreeProfile}
                className="focus-ring inline-flex h-10 items-center rounded-md border border-destructive/30 bg-surface-1 px-4 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:opacity-50"
              >
                {isClearingDegreeProfile ? 'Clearing...' : 'Clear Degree Navigator info'}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="focus-ring inline-flex h-10 items-center rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mt-6 rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-sm text-success">
            {successMessage}
          </div>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Credits earned"
            value={formatNumber(degreeProfile?.degreeCreditsEarned)}
          />
          <MetricCard
            label="Cumulative GPA"
            value={formatNumber(degreeProfile?.cumulativeGpa, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            })}
          />
          <MetricCard label="Programs" value={formatNumber(degreeProfile?.programs.length ?? 0)} />
          <MetricCard label="Transcript courses" value={formatNumber(courseCount)} />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Account" eyebrow="Supabase">
            <InfoGrid
              items={[
                ['Email', account.email ?? 'Not available'],
                ['User ID', account.id],
                ['Role', account.role ?? 'Not available'],
                ['Provider', account.provider ?? 'Not available'],
                ['Phone', account.phone ?? 'Not available'],
                ['Created', formatDateTime(account.createdAt)],
                ['Last sign in', formatDateTime(account.lastSignInAt)],
                ['Updated', formatDateTime(account.updatedAt)],
              ]}
            />
          </Panel>

          <Panel title="Degree Navigator" eyebrow="Latest saved capture">
            {degreeProfile ? (
              <InfoGrid
                items={[
                  ['Name', degreeProfile.studentName ?? 'Not available'],
                  ['RUID', degreeProfile.ruid ?? 'Not available'],
                  ['NetID', degreeProfile.netid ?? 'Not available'],
                  [
                    'School',
                    [degreeProfile.schoolCode, degreeProfile.schoolName]
                      .filter(Boolean)
                      .join(', ') || 'Not available',
                  ],
                  [
                    'Graduation',
                    [degreeProfile.graduationMonth, degreeProfile.graduationYear]
                      .filter(Boolean)
                      .join(' ') || 'Not available',
                  ],
                  ['Planned courses', formatNumber(degreeProfile.plannedCourseCount)],
                  ['Captured', formatDateTime(degreeProfile.capturedAt)],
                  ['Updated', formatDateTime(degreeProfile.updatedAt)],
                ]}
              />
            ) : (
              <EmptyState
                title="No Degree Navigator capture yet"
                description="Sync from Degree Navigator to save your profile, audits, and transcript terms here."
              />
            )}
          </Panel>
        </section>

        {degreeProfile && (
          <>
            <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Programs" eyebrow={`${degreeProfile.programs.length} declared`}>
                <div className="space-y-3">
                  {degreeProfile.programs.map((program, index) => (
                    <div
                      key={`${program.code ?? program.title}-${index}`}
                      className="rounded-xl border border-border bg-surface-2/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{program.title}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[program.code, program.campus].filter(Boolean).join(' · ') ||
                              'No code listed'}
                          </p>
                        </div>
                        {program.kind && <Pill>{titleCase(program.kind)}</Pill>}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Audit Summary"
                eyebrow={`${completedRequirementCount} completed requirements`}
              >
                <div className="space-y-4">
                  {degreeProfile.audits.map((audit, index) => (
                    <div key={`${audit.programCode ?? audit.title}-${index}`} className="space-y-3">
                      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">{audit.title}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[audit.programCode, audit.versionTerm].filter(Boolean).join(' · ') ||
                                'No version term listed'}
                            </p>
                          </div>
                          {audit.completedRequirements && (
                            <Pill>
                              {audit.completedRequirements.completed}/
                              {audit.completedRequirements.total} complete
                            </Pill>
                          )}
                        </div>
                        {audit.overallStatus && (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {audit.overallStatus}
                          </p>
                        )}
                        {audit.gpa?.value !== undefined && (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Pill>
                              {audit.gpa.label ?? 'GPA'}{' '}
                              {formatNumber(audit.gpa.value, {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              })}
                            </Pill>
                            {audit.gpa.status && <Pill>{audit.gpa.status}</Pill>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="mt-6">
              <Panel title="Requirements" eyebrow="Degree audit details">
                <div className="grid gap-4 lg:grid-cols-2">
                  {degreeProfile.audits.flatMap((audit) =>
                    audit.requirements.map((requirement, index) => (
                      <RequirementCard
                        key={`${audit.programCode ?? audit.title}-${requirement.code ?? requirement.title}-${index}`}
                        auditTitle={audit.title}
                        requirement={requirement}
                      />
                    )),
                  )}
                </div>
              </Panel>
            </section>

            <section className="mt-6">
              <Panel title="Audit Notes" eyebrow="Conditions, notes, and unused courses">
                <div className="space-y-4">
                  {degreeProfile.audits.map((audit, index) => (
                    <AuditDetails
                      key={`${audit.programCode ?? audit.title}-details-${index}`}
                      audit={audit}
                    />
                  ))}
                </div>
              </Panel>
            </section>

            <section className="mt-6">
              <Panel title="Transcript" eyebrow={`${degreeProfile.transcriptTerms.length} terms`}>
                <div className="space-y-4">
                  {degreeProfile.transcriptTerms.map((term) => (
                    <div
                      key={`${term.label}-${term.source}`}
                      className="rounded-xl border border-border bg-surface-2/60 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{term.label}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[titleCase(term.source), term.termCode].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <Pill>{term.courses.length} courses</Pill>
                      </div>
                      <CourseList courses={term.courses} />
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <Panel title="Run Notes" eyebrow="Capture metadata">
                <InfoGrid
                  items={[
                    ['Captured from', degreeProfile.runNotes.capturedFrom ?? 'Not available'],
                    [
                      'Captured at',
                      formatDateTime(degreeProfile.runNotes.capturedAt ?? degreeProfile.capturedAt),
                    ],
                    ['Source session', degreeProfile.sourceSessionId ?? 'Not stored'],
                    ['Schema version', String(degreeProfile.schemaVersion)],
                  ]}
                />
                {degreeProfile.runNotes.disclaimer && (
                  <p className="mt-4 rounded-xl border border-border bg-surface-2/60 p-3 text-sm leading-6 text-muted-foreground">
                    {degreeProfile.runNotes.disclaimer}
                  </p>
                )}
                <NoteList
                  title="Extraction warnings"
                  notes={degreeProfile.runNotes.extractionWarnings}
                />
                <NoteList
                  title="Unavailable routes"
                  notes={degreeProfile.runNotes.unavailableRoutes}
                />
              </Panel>

              <Panel title="Metadata" eyebrow="Account fields">
                <MetadataBlock
                  title="User metadata"
                  entries={metadataEntries(account.userMetadata)}
                />
                <MetadataBlock
                  title="App metadata"
                  entries={metadataEntries(account.appMetadata)}
                />
              </Panel>
            </section>
          </>
        )}
      </main>
    </ProfileShell>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="focus-ring -mx-1 inline-flex items-center gap-2 rounded px-1 py-1"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-primary" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Rutgers SOC
            </span>
          </Link>
          <Link
            href="/"
            className="focus-ring inline-flex h-8 items-center rounded-md border border-border bg-surface-1 px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            Back to app
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-5 shadow-elev-1">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5 shadow-elev-1 sm:p-6">
      <div className="mb-5">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value], index) => (
        <div
          key={`${label}-${index}`}
          className="rounded-xl border border-border bg-surface-2/60 p-3"
        >
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-2/50 p-6 text-center">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-muted-foreground ${className}`}
    >
      {children}
    </span>
  );
}

function RequirementCard({
  auditTitle,
  requirement,
}: {
  auditTitle: string;
  requirement: DegreeNavigatorRequirement;
}) {
  const progress =
    requirement.completedCount !== undefined && requirement.totalCount !== undefined
      ? `${requirement.completedCount}/${requirement.totalCount} complete`
      : requirement.neededCount !== undefined
        ? `${requirement.neededCount} needed`
        : null;
  const requirementOptions = requirement.requirementOptions ?? (
    requirement.status === 'complete' ? requirement.stillNeeded : undefined
  );
  const stillNeeded = requirement.status === 'incomplete' || requirement.status === 'projected'
    ? requirement.stillNeeded
    : undefined;

  return (
    <article className="rounded-xl border border-border bg-surface-2/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {auditTitle}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            {[requirement.code, requirement.title].filter(Boolean).join(' · ')}
          </h3>
        </div>
        {requirement.status && (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone(
              requirement.status,
            )}`}
          >
            {titleCase(requirement.status)}
          </span>
        )}
      </div>

      {(requirement.summary || progress) && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {[progress, requirement.summary].filter(Boolean).join(' · ')}
        </p>
      )}

      {requirement.courses && requirement.courses.length > 0 && (
        <CourseList courses={requirement.courses} />
      )}

      {requirementOptions && requirementOptions.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-surface-1 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Requirement options
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {requirementOptions.map((option, index) => (
              <li key={`${option.label}-${index}`}>
                <span className="text-foreground">{option.label}</span>
                {option.requiredCount !== undefined && (
                  <span> · requires {option.requiredCount}</span>
                )}
                {option.completedCount !== undefined && (
                  <span> · {option.completedCount} completed</span>
                )}
                {option.courseOptions && option.courseOptions.length > 0 && (
                  <span> · {option.courseOptions.join(' or ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stillNeeded && stillNeeded.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/25 bg-warning/5 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-warning">
            Still needed
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {stillNeeded.map((needed, index) => (
              <li key={`${needed.label}-${index}`}>
                <span className="text-foreground">{needed.label}</span>
                {needed.neededCount !== undefined && (
                  <span> · needs {needed.neededCount}</span>
                )}
                {needed.courseOptions && needed.courseOptions.length > 0 && (
                  <span> · {needed.courseOptions.join(' or ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {requirement.notes && requirement.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm leading-6 text-muted-foreground">
          {requirement.notes.map((note, index) => (
            <li key={`${note}-${index}`}>{note}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function AuditDetails({ audit }: { audit: DegreeNavigatorAudit }) {
  const hasConditions = Boolean(audit.conditions?.length);
  const hasNotes = Boolean(audit.notes?.length);
  const hasUnusedCourses = Boolean(audit.unusedCourses?.length);

  if (!hasConditions && !hasNotes && !hasUnusedCourses) {
    return (
      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <h3 className="text-sm font-semibold text-foreground">{audit.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">No extra audit notes were captured.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-4">
      <h3 className="text-sm font-semibold text-foreground">{audit.title}</h3>
      <NoteList title="Conditions" notes={audit.conditions} />
      <NoteList title="Notes" notes={audit.notes} />
      {audit.unusedCourses && audit.unusedCourses.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Unused courses
          </p>
          <CourseList courses={audit.unusedCourses} />
        </div>
      )}
    </div>
  );
}

function NoteList({ title, notes }: { title: string; notes?: string[] }) {
  if (!notes || notes.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-muted-foreground">
        {notes.map((note, index) => (
          <li key={`${note}-${index}`}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function CourseList({ courses }: { courses: DegreeNavigatorCourseRef[] }) {
  return (
    <div className="mt-4 grid gap-2">
      {courses.map((course, index) => {
        const details = courseDetails(course);
        const displayTitle = course.title ?? course.courseCode;
        return (
          <div
            key={`${course.courseCode}-${course.termLabel ?? ''}-${index}`}
            className="rounded-lg border border-border bg-surface-1/70 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {displayTitle}
                  {course.title ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {course.courseCode}
                    </span>
                  ) : null}
                </p>
                {details.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{details.join(' · ')}</p>
                )}
              </div>
              {course.status && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(
                    course.status,
                  )}`}
                >
                  {titleCase(course.status)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetadataBlock({
  title,
  entries,
}: {
  title: string;
  entries: Array<[string, MetadataValue]>;
}) {
  return (
    <div className="not-last:mb-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No metadata saved.</p>
      ) : (
        <dl className="mt-3 space-y-2">
          {entries.map(([label, value], index) => (
            <div
              key={`${label}-${index}`}
              className="rounded-lg border border-border bg-surface-2/60 p-3"
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {titleCase(label)}
              </dt>
              <dd className="mt-1 break-words text-sm text-foreground">
                {renderMetadataValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
