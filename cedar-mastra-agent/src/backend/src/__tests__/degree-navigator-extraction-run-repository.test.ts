import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createDegreeNavigatorExtractionRun,
  getDegreeNavigatorExtractionRun,
  setDegreeNavigatorExtractionRunSupabaseClientFactoryForTest,
} from '../degree-navigator/extractionRunRepository.js';
import type { DegreeNavigatorExtractionPayload, DegreeNavigatorExtractionSummary } from '../degree-navigator/schemas.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '22222222-2222-4222-8222-222222222222';

const payload: DegreeNavigatorExtractionPayload = {
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
};

const summary: DegreeNavigatorExtractionSummary = {
  pageCount: 1,
  auditPageCount: 1,
  myDegreesPageCount: 0,
  linkCount: 0,
  tableCount: 1,
  sectionCount: 1,
  courseCodeCount: 1,
};

function createSupabaseClient() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    client: {
      from(table: string) {
        assert.strictEqual(table, 'degree_navigator_extraction_runs');
        const filters: Record<string, unknown> = {};
        const query = {
          insert(row: Record<string, unknown>) {
            rows.push({
              id: RUN_ID,
              created_at: '2026-05-01T05:40:47.179Z',
              ...row,
            });
            return query;
          },
          select() {
            return query;
          },
          eq(column: string, value: unknown) {
            filters[column] = value;
            return query;
          },
          single: async () => ({
            data: rows[rows.length - 1],
            error: null,
          }),
          maybeSingle: async () => ({
            data: rows.find((row) =>
              Object.entries(filters).every(([column, value]) => row[column] === value),
            ) ?? null,
            error: null,
          }),
        };
        return query;
      },
    },
  };
}

describe('Degree Navigator extraction run repository', () => {
  afterEach(() => {
    setDegreeNavigatorExtractionRunSupabaseClientFactoryForTest(null);
  });

  it('creates and reads extraction runs scoped by owner', async () => {
    const supabase = createSupabaseClient();
    setDegreeNavigatorExtractionRunSupabaseClientFactoryForTest(() => supabase.client as never);

    const created = await createDegreeNavigatorExtractionRun({
      userId: USER_ID,
      browserSessionId: 'session_1',
      payload,
      summary,
      expiresAt: '2026-05-01T06:40:47.179Z',
    });
    const owned = await getDegreeNavigatorExtractionRun(USER_ID, created.id);
    const otherUser = await getDegreeNavigatorExtractionRun(OTHER_USER_ID, created.id);

    assert.strictEqual(created.id, RUN_ID);
    assert.strictEqual(created.userId, USER_ID);
    assert.strictEqual(owned?.payload.pages[0].kind, 'degree_audit');
    assert.strictEqual(otherUser, null);
  });
});
