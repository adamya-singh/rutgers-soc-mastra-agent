import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  readDegreeNavigatorProfile,
  runReadDegreeNavigatorProfile,
} from '../mastra/tools/degree-navigator/read-profile.js';
import type {
  DegreeNavigatorCapture,
  DegreeNavigatorProfileRow,
} from '../degree-navigator/schemas.js';

const AUTHENTICATED_USER_ID = '11111111-1111-4111-8111-111111111111';

function createProfileRow(
  userId: string,
  overrides: Partial<DegreeNavigatorProfileRow> = {},
): DegreeNavigatorProfileRow {
  const capture: DegreeNavigatorCapture = {
    schemaVersion: 1,
    profile: {
      name: 'Jane Student',
      ruid: '123456789',
      netid: 'js123',
      school: {
        code: '01',
        name: 'School of Arts and Sciences',
      },
      degreeCreditsEarned: 90,
      cumulativeGpa: 3.5,
    },
    programs: [
      {
        code: 'NB198SJ',
        title: 'Major in Computer Science - B.S. (NB)',
        campus: 'NB',
        kind: 'major',
      },
    ],
    audits: [
      {
        programCode: 'NB198SJ',
        title: 'Computer Science Major',
        requirements: [
          {
            code: 'R1',
            title: 'Computer Science Core',
            status: 'incomplete',
            completedCount: 4,
            totalCount: 6,
            neededCount: 2,
            courses: [
              {
                courseCode: '01:198:111',
                title: 'Intro Computer Science',
                credits: 4,
                grade: 'A',
                status: 'completed',
                termLabel: 'Fall 2023',
              },
            ],
            stillNeeded: [
              {
                label: 'Machine Learning/Deep Learning',
                courseOptions: ['01:198:461', '01:198:462'],
              },
            ],
          },
        ],
        unusedCourses: [
          {
            courseCode: '01:090:101',
            title: 'First-Year Interest Group Seminar',
            status: 'unused',
          },
        ],
      },
    ],
    transcriptTerms: [
      {
        label: 'Fall 2023',
        source: 'transcript',
        courses: [
          {
            courseCode: '01:198:111',
            title: 'Intro Computer Science',
            credits: 4,
            grade: 'A',
            status: 'completed',
          },
        ],
      },
    ],
    runNotes: {
      capturedFrom: 'degree_navigator',
      extractionWarnings: ['Unofficial audit view'],
    },
    source: 'degree_navigator',
    capturedAt: '2026-04-28T12:00:00.000Z',
  };

  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId,
    schemaVersion: capture.schemaVersion,
    studentName: capture.profile.name ?? null,
    ruid: capture.profile.ruid ?? null,
    netid: capture.profile.netid ?? null,
    schoolCode: capture.profile.school?.code ?? null,
    schoolName: capture.profile.school?.name ?? null,
    graduationYear: capture.profile.declaredGraduation?.year ?? null,
    graduationMonth: capture.profile.declaredGraduation?.month ?? null,
    degreeCreditsEarned: capture.profile.degreeCreditsEarned ?? null,
    cumulativeGpa: capture.profile.cumulativeGpa ?? null,
    plannedCourseCount: capture.profile.plannedCourseCount ?? null,
    profile: capture.profile,
    programs: capture.programs,
    audits: capture.audits,
    transcriptTerms: capture.transcriptTerms,
    runNotes: capture.runNotes,
    source: capture.source,
    sourceSessionId: capture.sourceSessionId ?? null,
    capturedAt: capture.capturedAt ?? '2026-04-28T12:00:00.000Z',
    createdAt: '2026-04-28T12:00:00.000Z',
    updatedAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  };
}

describe('readDegreeNavigatorProfile tool', () => {
  it('has the expected Mastra tool configuration', () => {
    assert.strictEqual(readDegreeNavigatorProfile.id, 'readDegreeNavigatorProfile');
    assert.ok(readDegreeNavigatorProfile.description);
    assert.ok(readDegreeNavigatorProfile.inputSchema);
    assert.ok(readDegreeNavigatorProfile.outputSchema);
    assert.ok(typeof readDegreeNavigatorProfile.execute === 'function');
  });

  it('requires authenticated runtime context', async () => {
    let called = false;

    await assert.rejects(
      runReadDegreeNavigatorProfile(
        {},
        { get: () => undefined },
        {
          getProfile: async () => {
            called = true;
            return null;
          },
        },
      ),
      /Missing authenticated user context/,
    );

    assert.strictEqual(called, false);
  });

  it('scopes the read to the runtime user id', async () => {
    let readUserId: string | null = null;
    const profile = createProfileRow(AUTHENTICATED_USER_ID);

    const result = await runReadDegreeNavigatorProfile(
      {},
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        getProfile: async (userId) => {
          readUserId = userId;
          return profile;
        },
      },
    );

    assert.strictEqual(readUserId, AUTHENTICATED_USER_ID);
    assert.strictEqual(result.profile?.userId, AUTHENTICATED_USER_ID);
  });

  it('returns null when the authenticated user has no saved profile', async () => {
    const result = await runReadDegreeNavigatorProfile(
      {},
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        getProfile: async () => null,
      },
    );

    assert.strictEqual(result.profile, null);
  });

  it('preserves nested requirements, still-needed options, and transcript courses', async () => {
    const profile = createProfileRow(AUTHENTICATED_USER_ID);

    const result = await runReadDegreeNavigatorProfile(
      {},
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        getProfile: async () => profile,
      },
    );

    assert.strictEqual(result.profile?.programs[0]?.code, 'NB198SJ');
    assert.strictEqual(result.profile?.audits[0]?.requirements[0]?.courses?.[0]?.courseCode, '01:198:111');
    assert.deepStrictEqual(
      result.profile?.audits[0]?.requirements[0]?.stillNeeded?.[0]?.courseOptions,
      ['01:198:461', '01:198:462'],
    );
    assert.strictEqual(result.profile?.audits[0]?.unusedCourses?.[0]?.courseCode, '01:090:101');
    assert.strictEqual(result.profile?.transcriptTerms[0]?.courses[0]?.grade, 'A');
    assert.deepStrictEqual(result.profile?.runNotes.extractionWarnings, ['Unofficial audit view']);
  });
});
