import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  runSaveDegreeNavigatorProfile,
  saveDegreeNavigatorProfile,
} from '../mastra/tools/degree-navigator/save-profile.js';
import type {
  DegreeNavigatorCapture,
  DegreeNavigatorProfileRow,
} from '../degree-navigator/schemas.js';

const AUTHENTICATED_USER_ID = '11111111-1111-4111-8111-111111111111';

function createCapture(overrides: Partial<DegreeNavigatorCapture> = {}): DegreeNavigatorCapture {
  return {
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
        title: 'Computer Science',
        kind: 'major',
      },
    ],
    audits: [
      {
        title: 'Computer Science Major',
        requirements: [
          {
            title: 'Required Courses',
            status: 'incomplete',
          },
        ],
      },
    ],
    transcriptTerms: [
      {
        label: 'Fall 2024',
        source: 'transcript',
        courses: [
          {
            courseCode: '01:198:111',
            title: 'Intro Computer Science',
            credits: 4,
            status: 'completed',
          },
        ],
      },
    ],
    runNotes: {},
    source: 'degree_navigator',
    capturedAt: '2026-04-28T12:00:00.000Z',
    ...overrides,
  };
}

function createProfileRow(
  userId: string,
  capture: DegreeNavigatorCapture,
): DegreeNavigatorProfileRow {
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
  };
}

describe('saveDegreeNavigatorProfile tool', () => {
  it('has the expected Mastra tool configuration', () => {
    assert.strictEqual(saveDegreeNavigatorProfile.id, 'saveDegreeNavigatorProfile');
    assert.ok(saveDegreeNavigatorProfile.description);
    assert.ok(saveDegreeNavigatorProfile.inputSchema);
    assert.ok(saveDegreeNavigatorProfile.outputSchema);
    assert.ok(typeof saveDegreeNavigatorProfile.execute === 'function');
  });

  it('requires authenticated runtime context', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture(),
        { get: () => undefined },
        {
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /Missing authenticated user context/,
    );

    assert.strictEqual(called, false);
  });

  it('scopes the save to the runtime user id and runtime browser session', async () => {
    const capture = createCapture({
      sourceSessionId: 'model_supplied_session',
    }) as DegreeNavigatorCapture & { userId: string };
    capture.userId = '99999999-9999-4999-8999-999999999999';

    let savedUserId: string | null = null;
    let savedCapture: DegreeNavigatorCapture | null = null;
    const result = await runSaveDegreeNavigatorProfile(
      capture,
      {
        get: (key: string) => {
          if (key === 'authenticatedUserId') {
            return AUTHENTICATED_USER_ID;
          }
          if (key === 'additionalContext') {
            return {
              browserSession: {
                data: {
                  browserSession: {
                    sessionId: 'runtime_session',
                  },
                },
              },
            };
          }
          return undefined;
        },
      },
      {
        upsertProfile: async (userId, input) => {
          savedUserId = userId;
          savedCapture = input;
          return createProfileRow(userId, input);
        },
      },
    );

    assert.strictEqual(savedUserId, AUTHENTICATED_USER_ID);
    assert.strictEqual(savedCapture?.sourceSessionId, 'runtime_session');
    assert.strictEqual(result.profile.userId, AUTHENTICATED_USER_ID);
  });

  it('rejects invalid captures before saving', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        {} as DegreeNavigatorCapture,
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
    );

    assert.strictEqual(called, false);
  });
});
