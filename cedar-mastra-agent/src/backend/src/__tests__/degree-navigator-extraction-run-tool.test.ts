import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  readDegreeNavigatorExtractionRun,
  runReadDegreeNavigatorExtractionRun,
} from '../mastra/tools/degree-navigator/read-extraction-run.js';
import type { DegreeNavigatorExtractionRun } from '../degree-navigator/schemas.js';

const AUTHENTICATED_USER_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';

function createRun(userId = AUTHENTICATED_USER_ID): DegreeNavigatorExtractionRun {
  return {
    id: RUN_ID,
    userId,
    browserSessionId: 'session_1',
    status: 'created',
    payload: {
      capturedAt: '2026-05-01T05:40:47.179Z',
      sourceSessionId: 'session_1',
      pages: [
        {
          url: 'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=1',
          title: 'Degree Audit',
          kind: 'degree_audit',
          headings: ['Degree Audit'],
          tables: [[['Course', 'Title'], ['01:198:111', 'Intro Computer Science']]],
          sections: [{ text: 'Degree Audit Requirement course credits GPA 01:198:111' }],
          links: [],
          courseCodes: ['01:198:111'],
        },
      ],
    },
    summary: {
      pageCount: 1,
      auditPageCount: 1,
      myDegreesPageCount: 0,
      linkCount: 0,
      tableCount: 1,
      sectionCount: 1,
      courseCodeCount: 1,
    },
    createdAt: '2026-05-01T05:40:47.179Z',
    expiresAt: '2026-05-01T06:40:47.179Z',
  };
}

describe('readDegreeNavigatorExtractionRun tool', () => {
  it('has the expected Mastra tool configuration', () => {
    assert.strictEqual(readDegreeNavigatorExtractionRun.id, 'readDegreeNavigatorExtractionRun');
    assert.ok(readDegreeNavigatorExtractionRun.description);
    assert.ok(readDegreeNavigatorExtractionRun.inputSchema);
    assert.ok(readDegreeNavigatorExtractionRun.outputSchema);
    assert.ok(typeof readDegreeNavigatorExtractionRun.execute === 'function');
  });

  it('requires authenticated runtime context', async () => {
    await assert.rejects(
      runReadDegreeNavigatorExtractionRun(
        { runId: RUN_ID },
        { get: () => undefined },
        { getExtractionRun: async () => createRun() },
      ),
      /Missing authenticated user context/,
    );
  });

  it('scopes reads to the runtime user id', async () => {
    let requestedUserId: string | null = null;
    const result = await runReadDegreeNavigatorExtractionRun(
      { runId: RUN_ID },
      { get: (key: string) => (key === 'authenticatedUserId' ? AUTHENTICATED_USER_ID : undefined) },
      {
        getExtractionRun: async (userId) => {
          requestedUserId = userId;
          return createRun(userId);
        },
      },
    );

    assert.strictEqual(requestedUserId, AUTHENTICATED_USER_ID);
    assert.strictEqual(result.run?.id, RUN_ID);
    assert.strictEqual(result.run?.payload.pages[0].kind, 'degree_audit');
  });
});
