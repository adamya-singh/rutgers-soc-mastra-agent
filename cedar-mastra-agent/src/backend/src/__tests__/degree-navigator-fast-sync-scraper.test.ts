import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  collectDegreeNavigatorEvidencePage,
  scrapeDegreeNavigatorFast,
  type DegreeNavigatorScrapePage,
} from '../degree-navigator/fastSyncScraper.js';

type RawEvidence = {
  url: string;
  title?: string;
  headings: string[];
  tables: string[][][];
  sections: Array<{ heading?: string; text: string }>;
  links: Array<{ text: string; href: string }>;
  courseCodes: string[];
};

function createPage(rawPages: Record<string, RawEvidence>, initialUrl: string): DegreeNavigatorScrapePage {
  let currentUrl = initialUrl;
  return {
    url: () => currentUrl,
    title: async () => String((rawPages[currentUrl] as { title?: string }).title ?? 'Degree Navigator'),
    goto: async (url: string) => {
      currentUrl = url;
    },
    waitForTimeout: async () => undefined,
    evaluate: async <T>() => rawPages[currentUrl] as T,
  } as DegreeNavigatorScrapePage;
}

describe('Degree Navigator fast sync scraper', () => {
  it('collects bounded evidence instead of canonical profile data', async () => {
    const page = createPage(
      {
        'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=2721': {
          url: 'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=2721',
          title: 'Degree Audit',
          headings: ['Computer Science Major Audit', 'Requirement Legend'],
          tables: [[['Course', 'Title', 'Credits'], ['01:198:111', 'Intro Computer Science', '4']]],
          sections: [
            {
              heading: 'Computer Science Major Audit',
              text: 'Requirement R1 : Computer Science Foundation - Description 1 course from Intro to Computer Science: {01:198:111} Requirement V1 : Computer Science Foundation - Completed Courses: 01:198:111( 4, Fall 2024, A) Condition C1 - Description You must achieve a minimum grade of C for {01:198:111}. Residency Requirement in RU-NB Complete 01:198:111( 4, Fall 2024, A) You must achieve a minimum grade of C for {01:198:111}.',
            },
          ],
          links: [],
          courseCodes: ['01:198:111'],
        },
      },
      'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=2721',
    );

    const evidence = await collectDegreeNavigatorEvidencePage(page);

    assert.strictEqual(evidence.kind, 'degree_audit');
    assert.strictEqual(evidence.tables.length, 1);
    assert.strictEqual(evidence.courseCodes[0], '01:198:111');
    assert.strictEqual(evidence.auditHint?.requirements[0].code, 'R1');
    assert.deepStrictEqual(evidence.auditHint?.requirements[0].courseOptions, ['01:198:111']);
    assert.deepStrictEqual(evidence.auditHint?.requirements[0].courseOptionGroups[0], {
      label: 'Intro to Computer Science',
      courseOptions: ['01:198:111'],
      requiredCount: 1,
      neededCount: 1,
      description: '1 course from Intro to Computer Science: {01:198:111}',
    });
    assert.match(evidence.auditHint?.requirements[0].conditions[0] ?? '', /minimum grade of C/);
    const residency = evidence.auditHint?.requirements.find((requirement) => requirement.code === 'residency');
    assert.strictEqual(residency?.title, 'Residency Requirement in RU-NB');
    assert.strictEqual(residency?.completedCourses[0].courseCode, '01:198:111');
    assert.strictEqual(Object.hasOwn(evidence, 'requirements'), false);
    assert.strictEqual(Object.hasOwn(evidence, 'transcriptTerms'), false);
  });

  it('discovers audit and transcript pages and returns an extraction run payload summary', async () => {
    const myDegreesUrl = 'https://dn.rutgers.edu/DN/Audit/MyDegrees.aspx?pageid=MyDegrees';
    const auditUrl = 'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=2721';
    const transcriptUrl = 'https://dn.rutgers.edu/DN/Transcript.aspx?pageid=mytranscript';
    const page = createPage(
      {
        [myDegreesUrl]: {
          url: myDegreesUrl,
          title: 'My Degrees',
          headings: ['My Degrees'],
          tables: [[['Code', 'Name', 'Audit'], ['NB198SJ', 'Major in Computer Science - B.S. (NB)']]],
          sections: [{ text: 'My Degrees Computer Science Major' }],
          links: [
            { text: 'Computer Science Major', href: auditUrl },
            { text: 'My Course List', href: transcriptUrl },
          ],
          courseCodes: [],
        },
        [auditUrl]: {
          url: auditUrl,
          title: 'Degree Audit',
          headings: ['Computer Science Major Audit'],
          tables: [[['Course', 'Title'], ['01:198:111', 'Intro Computer Science']]],
          sections: [{ text: 'Degree Audit Requirement course credits GPA 01:198:111' }],
          links: [],
          courseCodes: ['01:198:111'],
        },
        [transcriptUrl]: {
          url: transcriptUrl,
          title: 'My Course List',
          headings: ['My Course List'],
          tables: [[
            ['Term', 'Course', 'Credits', 'Grade', 'Special Codes'],
            ['Fall 2024', '01:198:111', '4', 'A'],
            ['Spring 2025', '01:198:112', '4', 'B+'],
            ['2023', '01:198:110', '3', 'AP', 'AP'],
            ['Placement', 'CH:160:CHM', '0', 'PL', 'PL'],
          ]],
          sections: [{ text: 'Fall 2024 01:198:111( 4, Fall 2024, A) Spring 2025 01:198:112( 4, Spring 2025, B+)' }],
          links: [],
          courseCodes: ['01:198:111', '01:198:112'],
        },
      },
      myDegreesUrl,
    );

    const result = await scrapeDegreeNavigatorFast(page, {
      sessionId: 'session_fast_1',
      capturedAt: '2026-05-01T05:40:47.179Z',
    });

    assert.strictEqual(result.payload.sourceSessionId, 'session_fast_1');
    assert.strictEqual(result.summary.pageCount, 3);
    assert.strictEqual(result.summary.auditPageCount, 1);
    assert.strictEqual(result.payload.pages.find((page) => page.kind === 'my_degrees')?.programHints[0].code, 'NB198SJ');
    const transcriptHints = result.payload.pages.find((page) => page.kind === 'transcript')?.transcriptTermHints ?? [];
    assert.deepStrictEqual(
      transcriptHints.map((term) => [term.label, term.source, term.courses.length]),
      [
        ['Fall 2024', 'transcript', 1],
        ['Spring 2025', 'transcript', 1],
        ['2023 AP', 'ap_credit', 1],
        ['Placement', 'placement', 1],
      ],
    );
    assert.strictEqual(result.summary.courseCodeCount, 3);
  });

  it('shrinks large multi-audit evidence payloads under the storage limit', async () => {
    const myDegreesUrl = 'https://dn.rutgers.edu/DN/Audit/MyDegrees.aspx?pageid=MyDegrees';
    const auditUrls = Array.from(
      { length: 20 },
      (_, index) => `https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=${index + 1}`,
    );
    const largeTable = Array.from({ length: 100 }, (_, rowIndex) =>
      Array.from({ length: 12 }, (_, cellIndex) =>
        `Requirement course credits GPA 01:198:${String(100 + (rowIndex % 100)).padStart(3, '0')} repeated cell ${cellIndex} `.repeat(4),
      ),
    );
    const largeSectionText = 'Degree Audit Requirement course credits GPA 01:198:111 '.repeat(1200);
    const page = createPage(
      {
        [myDegreesUrl]: {
          url: myDegreesUrl,
          title: 'My Degrees',
          headings: ['My Degrees'],
          tables: [[['Program', 'Computer Science Major']]],
          sections: [{ text: 'My Degrees Computer Science Major' }],
          links: auditUrls.map((href) => ({ text: 'Computer Science Major', href })),
          courseCodes: [],
        },
        ...Object.fromEntries(auditUrls.map((url) => [
          url,
          {
            url,
            title: 'Degree Audit',
            headings: ['Computer Science Major Audit'],
            tables: Array.from({ length: 20 }, () => largeTable),
            sections: Array.from({ length: 30 }, () => ({ text: largeSectionText })),
            links: [],
            courseCodes: ['01:198:111'],
          },
        ])),
      },
      myDegreesUrl,
    );

    const result = await scrapeDegreeNavigatorFast(page, {
      sessionId: 'session_fast_1',
      capturedAt: '2026-05-01T05:40:47.179Z',
    });

    assert.ok(Buffer.byteLength(JSON.stringify(result.payload), 'utf8') <= 700_000);
    assert.strictEqual(result.summary.auditPageCount, 20);
  });

  it('also shrinks oversized headings, links, and course-code evidence', async () => {
    const myDegreesUrl = 'https://dn.rutgers.edu/DN/Audit/MyDegrees.aspx?pageid=MyDegrees';
    const auditUrl = 'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=1';
    const hugeText = 'Degree Audit Requirement course credits GPA 01:198:111 '.repeat(5000);
    const page = createPage(
      {
        [myDegreesUrl]: {
          url: myDegreesUrl,
          title: hugeText,
          headings: Array.from({ length: 500 }, () => hugeText),
          tables: [[['Program', 'Computer Science Major']]],
          sections: [{ text: hugeText }],
          links: Array.from({ length: 500 }, (_, index) => ({
            text: hugeText,
            href: index === 0 ? auditUrl : `${myDegreesUrl}#${index}`,
          })),
          courseCodes: Array.from({ length: 5000 }, (_, index) =>
            `01:198:${String(index % 1000).padStart(3, '0')}`,
          ),
        },
        [auditUrl]: {
          url: auditUrl,
          title: hugeText,
          headings: Array.from({ length: 500 }, () => hugeText),
          tables: Array.from({ length: 50 }, () => [[hugeText, hugeText, hugeText]]),
          sections: Array.from({ length: 500 }, () => ({ text: hugeText })),
          links: [],
          courseCodes: Array.from({ length: 5000 }, (_, index) =>
            `01:198:${String(index % 1000).padStart(3, '0')}`,
          ),
        },
      },
      myDegreesUrl,
    );

    const result = await scrapeDegreeNavigatorFast(page, {
      sessionId: 'session_fast_1',
      capturedAt: '2026-05-01T05:40:47.179Z',
    });

    assert.ok(Buffer.byteLength(JSON.stringify(result.payload), 'utf8') <= 700_000);
    assert.strictEqual(result.summary.auditPageCount, 1);
  });
});
