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
import { DegreeNavigatorCaptureSchema } from '../degree-navigator/schemas.js';

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

  it('keeps backend-owned capture constants out of the LLM input schema', () => {
    const parsed = saveDegreeNavigatorProfile.inputSchema.parse({
      profile: {},
    });

    assert.strictEqual(Object.hasOwn(parsed, 'schemaVersion'), false);
    assert.strictEqual(Object.hasOwn(parsed, 'source'), false);
  });

  it('requires authenticated runtime context', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture(),
        { get: () => undefined },
        {
          enrichCapture: async (capture) => capture,
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
        enrichCapture: async (capture) => capture,
        upsertProfile: async (userId, input) => {
          savedUserId = userId;
          savedCapture = input;
          return createProfileRow(userId, input);
        },
      },
    );

    assert.strictEqual(savedUserId, AUTHENTICATED_USER_ID);
    assert.strictEqual(savedCapture?.schemaVersion, 1);
    assert.strictEqual(savedCapture?.source, 'degree_navigator');
    assert.strictEqual(savedCapture?.sourceSessionId, 'runtime_session');
    assert.strictEqual(result.profile.userId, AUTHENTICATED_USER_ID);
  });

  it('rejects invalid captures before saving', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        {} as DegreeNavigatorCapture,
        {
          get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined),
        },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
    );

    assert.strictEqual(called, false);
  });

  it('enriches captures before saving', async () => {
    let savedCapture: DegreeNavigatorCapture | null = null;
    const result = await runSaveDegreeNavigatorProfile(
      createCapture({
        transcriptTerms: [
          {
            label: 'Fall 2024',
            source: 'transcript',
            courses: [
              {
                courseCode: '01:640:250',
              },
            ],
          },
        ],
      }),
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        enrichCapture: async (capture) => ({
          ...capture,
          transcriptTerms: capture.transcriptTerms.map((term) => ({
            ...term,
            courses: term.courses.map((course) => ({
              ...course,
              title: course.courseCode === '01:640:250' ? 'Linear Algebra' : course.title,
            })),
          })),
        }),
        upsertProfile: async (userId, capture) => {
          savedCapture = capture;
          return createProfileRow(userId, capture);
        },
      },
    );

    assert.strictEqual(savedCapture?.transcriptTerms[0].courses[0].title, 'Linear Algebra');
    assert.strictEqual(result.profile.transcriptTerms[0].courses[0].title, 'Linear Algebra');
  });

  it('preserves requirement conditions and structured still-needed metadata through validation', () => {
    const parsed = DegreeNavigatorCaptureSchema.parse(createCapture({
      audits: [
        {
          title: 'Computer Science Major',
          conditions: ['No more than 1 course with a grade equal to D may be used.'],
          requirements: [
            {
              title: 'Requirement R4 : Physics or Chemistry Courses',
              status: 'incomplete',
              conditions: ['No more than 1 course with a grade equal to D may be used.'],
              requirementOptions: [
                {
                  label: 'Physics sequence',
                  requiredCount: 4,
                  completedCount: 2,
                  neededCount: 2,
                  description: '4 courses from Physics sequence',
                  courseOptions: ['01:750:203', '01:750:204', '01:750:205', '01:750:206'],
                },
              ],
            },
          ],
        },
      ],
    }));

    assert.strictEqual(parsed.audits[0].requirements[0].conditions?.[0], 'No more than 1 course with a grade equal to D may be used.');
    assert.strictEqual(parsed.audits[0].requirements[0].requirementOptions?.[0].requiredCount, 4);
    assert.strictEqual(parsed.audits[0].requirements[0].requirementOptions?.[0].neededCount, 2);
  });

  it('normalizes requirement options separately from true still-needed groups', async () => {
    let savedCapture: DegreeNavigatorCapture | null = null;

    await runSaveDegreeNavigatorProfile(
      createCapture({
        audits: [
          {
            title: 'Computer Science Major',
            requirements: [
              {
                title: 'Requirement R1 : Computer Science Core',
                status: 'complete',
                courses: [{ courseCode: '01:198:111', title: 'Intro Computer Science', status: 'completed' }],
                stillNeeded: [
                  {
                    label: 'Intro to Computer Science',
                    requiredCount: 1,
                    courseOptions: ['01:198:111'],
                  },
                ],
              },
              {
                title: 'Requirement R2 : Data Science Context',
                status: 'incomplete',
                courses: [],
                stillNeeded: [
                  {
                    label: 'Data in Context',
                    requiredCount: 1,
                    courseOptions: ['04:547:225'],
                  },
                ],
              },
            ],
          },
        ],
      }),
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        enrichCapture: async (capture) => capture,
        upsertProfile: async (userId, capture) => {
          savedCapture = capture;
          return createProfileRow(userId, capture);
        },
      },
    );

    const [completeRequirement, incompleteRequirement] = savedCapture!.audits[0].requirements;
    assert.strictEqual(completeRequirement.requirementOptions?.length, 1);
    assert.deepStrictEqual(completeRequirement.stillNeeded, []);
    assert.strictEqual(incompleteRequirement.requirementOptions?.length, 1);
    assert.strictEqual(incompleteRequirement.stillNeeded?.[0].courseOptions?.[0], '04:547:225');
  });

  it('rejects obviously duplicated program saves before enrichment or persistence', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture({
          programs: Array.from({ length: 40 }, (_, index) => ({
            title: `Duplicated Program ${index}`,
          })),
        }),
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /40 programs/,
    );

    assert.strictEqual(called, false);
  });

  it('rejects transcript course counts that match the bad fast-sync duplication pattern', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture({
          transcriptTerms: [
            {
              label: 'Duplicated Transcript',
              source: 'transcript',
              courses: Array.from({ length: 392 }, (_, index) => ({
                courseCode: `01:198:${String(100 + (index % 899)).padStart(3, '0')}`,
              })),
            },
          ],
        }),
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /392 transcript courses/,
    );

    assert.strictEqual(called, false);
  });

  it('rejects profile names parsed from RUID labels', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture({
          profile: {
            name: 'RUID: 123456789',
          },
        }),
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /malformed student name/,
    );

    assert.strictEqual(called, false);
  });

  it('rejects malformed NetID placeholders produced by broad text scraping', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture({
          profile: {
            name: 'Jane Student',
            netid: ':',
          },
        }),
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /malformed NetID/,
    );

    assert.strictEqual(called, false);
  });

  it('rejects course-code placeholder titles that remain after enrichment', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture({
          transcriptTerms: [
            {
              label: 'Fall 2024',
              source: 'transcript',
              courses: Array.from({ length: 6 }, (_, index) => ({
                courseCode: `01:198:${String(111 + index).padStart(3, '0')}`,
                title: `01:198:${String(111 + index).padStart(3, '0')}`,
              })),
            },
          ],
        }),
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /placeholder titles/,
    );

    assert.strictEqual(called, false);
  });

  it('rejects audit-level conditions that are not copied to requirements', async () => {
    let called = false;

    await assert.rejects(
      runSaveDegreeNavigatorProfile(
        createCapture({
          audits: [
            {
              title: 'Computer Science Major',
              conditions: ['No more than 1 course with a grade equal to D may be used.'],
              requirements: [
                {
                  title: 'Requirement R1 : Computer Science Core',
                  status: 'complete',
                },
              ],
            },
          ],
        }),
        { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
        {
          enrichCapture: async (capture) => capture,
          upsertProfile: async (userId, capture) => {
            called = true;
            return createProfileRow(userId, capture);
          },
        },
      ),
      /audit conditions/,
    );

    assert.strictEqual(called, false);
  });

  it('allows requirement summaries that use ordinary count language', async () => {
    let called = false;

    await runSaveDegreeNavigatorProfile(
      createCapture({
        audits: [
          {
            title: 'Computer Science Major',
            requirements: [
              {
                title: 'Requirement R3 : Computer Science Electives',
                status: 'projected',
                summary: 'A total of 7 courses with at least 5 courses from Computer Science electives.',
                courses: [
                  {
                    courseCode: '01:198:439',
                    title: 'Intro Data Science',
                    status: 'completed',
                  },
                ],
              },
            ],
          },
        ],
      }),
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        enrichCapture: async (capture) => capture,
        upsertProfile: async (userId, capture) => {
          called = true;
          return createProfileRow(userId, capture);
        },
      },
    );

    assert.strictEqual(called, true);
  });

  it('moves learning-goal text from conditions into notes before saving', async () => {
    let savedCapture: DegreeNavigatorCapture | null = null;
    const learningGoal = 'Students will be able to apply basic principles and concepts in the physical sciences.';

    await runSaveDegreeNavigatorProfile(
      createCapture({
        audits: [
          {
            title: 'SAS Core',
            requirements: [
              {
                title: 'Requirement R2 : Natural Sciences',
                status: 'incomplete',
                conditions: [learningGoal],
              },
            ],
          },
        ],
      }),
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        enrichCapture: async (capture) => capture,
        upsertProfile: async (userId, capture) => {
          savedCapture = capture;
          return createProfileRow(userId, capture);
        },
      },
    );

    assert.deepStrictEqual(savedCapture?.audits[0].requirements[0].conditions, undefined);
    assert.deepStrictEqual(savedCapture?.audits[0].requirements[0].notes, [learningGoal]);
  });
});
