import { describe, it } from 'node:test';
import assert from 'node:assert';

import { enrichDegreeNavigatorCourseTitles } from '../degree-navigator/courseTitleEnrichment.js';
import type { DegreeNavigatorCapture } from '../degree-navigator/schemas.js';

type CourseTitleRow = {
  course_string: string | null;
  title: string | null;
  year?: number | null;
  term?: string | null;
  campus?: string | null;
};

type QueryCall =
  | { method: 'from'; table: string }
  | { method: 'select'; columns: string }
  | { method: 'eq'; column: string; value: unknown }
  | { method: 'in'; column: string; values: unknown[] };

function createCapture(
  courses: DegreeNavigatorCapture['transcriptTerms'][number]['courses'],
  options: {
    unusedCourses?: DegreeNavigatorCapture['audits'][number]['unusedCourses'];
  } = {},
): DegreeNavigatorCapture {
  return {
    schemaVersion: 1,
    profile: {},
    programs: [],
    audits: [
      {
        title: 'Math Major',
        requirements: [
          {
            title: 'Required Courses',
            courses,
          },
        ],
        unusedCourses: options.unusedCourses,
      },
    ],
    transcriptTerms: [
      {
        label: 'Fall 2024',
        source: 'transcript',
        courses,
      },
    ],
    runNotes: {},
    source: 'degree_navigator',
  };
}

function createSupabaseClient(result: {
  data: CourseTitleRow[] | null;
  error: { message: string } | null;
}) {
  const calls: QueryCall[] = [];
  const query = {
    select(columns: string) {
      calls.push({ method: 'select', columns });
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', column, value });
      return query;
    },
    in(column: string, values: unknown[]) {
      calls.push({ method: 'in', column, values });
      return query;
    },
    then<TResult1 = typeof result, TResult2 = never>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: 'from', table });
        return query;
      },
    },
  };
}

describe('Degree Navigator course title enrichment', () => {
  it('fills missing titles from SOC data with a deduped lookup', async () => {
    const { client, calls } = createSupabaseClient({
      data: [
        {
          course_string: '01:640:250',
          title: 'Linear Algebra',
        },
      ],
      error: null,
    });

    const result = await enrichDegreeNavigatorCourseTitles(
      createCapture(
        [
          {
            courseCode: '01:640:250',
            credits: 3,
          },
          {
            courseCode: '01:640:250',
            status: 'completed',
          },
        ],
        {
          unusedCourses: [
            {
              courseCode: '01:640:250',
              status: 'unused',
            },
          ],
        },
      ),
      {
        supabaseClient: client as never,
        year: 2026,
        term: '1',
      },
    );

    assert.strictEqual(result.audits[0].requirements[0].courses?.[0].title, 'Linear Algebra');
    assert.strictEqual(result.audits[0].unusedCourses?.[0].title, 'Linear Algebra');
    assert.strictEqual(result.transcriptTerms[0].courses[1].title, 'Linear Algebra');
    assert.deepStrictEqual(
      calls.filter(
        (call): call is Extract<QueryCall, { method: 'in' }> =>
          call.method === 'in' && call.column === 'course_string',
      ),
      [{ method: 'in', column: 'course_string', values: ['01:640:250'] }],
    );
    assert.strictEqual(calls.some((call) => call.method === 'eq'), false);
  });

  it('preserves existing titles and reuses them for duplicate course refs', async () => {
    const { client, calls } = createSupabaseClient({
      data: null,
      error: new Error('should not query') as never,
    });

    const result = await enrichDegreeNavigatorCourseTitles(
      createCapture([
        {
          courseCode: '01:640:250',
          title: 'Linear Algebra',
        },
        {
          courseCode: '01:640:250',
        },
      ]),
      {
        supabaseClient: client as never,
      },
    );

    assert.strictEqual(result.audits[0].requirements[0].courses?.[0].title, 'Linear Algebra');
    assert.strictEqual(result.audits[0].requirements[0].courses?.[1].title, 'Linear Algebra');
    assert.strictEqual(calls.length, 0);
  });

  it('replaces course-code placeholder titles from SOC data', async () => {
    const { client, calls } = createSupabaseClient({
      data: [
        {
          course_string: '01:198:111',
          title: 'Intro Computer Science',
        },
      ],
      error: null,
    });

    const result = await enrichDegreeNavigatorCourseTitles(
      createCapture([
        {
          courseCode: '01:198:111',
          title: '01:198:111',
        },
      ]),
      {
        supabaseClient: client as never,
        year: 2026,
        term: '1',
      },
    );

    assert.strictEqual(result.transcriptTerms[0].courses[0].title, 'Intro Computer Science');
    assert.ok(calls.some((call) => call.method === 'in' && call.column === 'course_string'));
  });

  it('uses a matching future term title when default term has no row', async () => {
    const { client } = createSupabaseClient({
      data: [
        {
          course_string: '04:547:225',
          title: 'DATA IN CONTEXT',
          year: 2026,
          term: '9',
          campus: 'NB',
        },
      ],
      error: null,
    });

    const result = await enrichDegreeNavigatorCourseTitles(
      createCapture([
        {
          courseCode: '04:547:225',
          termLabel: 'Fall 2026',
          status: 'current',
        },
      ]),
      {
        supabaseClient: client as never,
        year: 2026,
        term: '1',
      },
    );

    assert.strictEqual(result.transcriptTerms[0].courses[0].title, 'DATA IN CONTEXT');
  });

  it('ignores invalid course codes without querying', async () => {
    const { client, calls } = createSupabaseClient({
      data: null,
      error: new Error('should not query') as never,
    });
    const capture = createCapture([
      {
        courseCode: 'MATH 250',
      },
    ]);

    const result = await enrichDegreeNavigatorCourseTitles(capture, {
      supabaseClient: client as never,
    });

    assert.strictEqual(result.audits[0].requirements[0].courses?.[0].title, undefined);
    assert.strictEqual(calls.length, 0);
  });

  it('leaves course refs unchanged when SOC has no matching title', async () => {
    const { client } = createSupabaseClient({
      data: [],
      error: null,
    });

    const result = await enrichDegreeNavigatorCourseTitles(
      createCapture([
        {
          courseCode: '01:640:250',
        },
      ]),
      {
        supabaseClient: client as never,
      },
    );

    assert.strictEqual(result.audits[0].requirements[0].courses?.[0].title, undefined);
  });

  it('does not fail profile saves when the SOC lookup errors', async () => {
    const { client } = createSupabaseClient({
      data: null,
      error: {
        message: 'database unavailable',
      },
    });

    const result = await enrichDegreeNavigatorCourseTitles(
      createCapture([
        {
          courseCode: '01:640:250',
        },
      ]),
      {
        supabaseClient: client as never,
      },
    );

    assert.strictEqual(result.audits[0].requirements[0].courses?.[0].title, undefined);
  });
});
