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
              text: 'Requirement 1 of 2 Complete Computer Science Foundation 01:198:111 Intro Computer Science',
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
    assert.strictEqual(Object.hasOwn(evidence, 'requirements'), false);
    assert.strictEqual(Object.hasOwn(evidence, 'transcriptTerms'), false);
  });

  it('discovers audit pages and returns an extraction run payload summary', async () => {
    const myDegreesUrl = 'https://dn.rutgers.edu/DN/Audit/MyDegrees.aspx?pageid=MyDegrees';
    const auditUrl = 'https://dn.rutgers.edu/DN/Audit/DegreeAudit.aspx?pageid=audit&degreeID=2721';
    const page = createPage(
      {
        [myDegreesUrl]: {
          url: myDegreesUrl,
          title: 'My Degrees',
          headings: ['My Degrees'],
          tables: [[['Program', 'Computer Science Major']]],
          sections: [{ text: 'My Degrees Computer Science Major' }],
          links: [{ text: 'Computer Science Major', href: auditUrl }],
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
      },
      myDegreesUrl,
    );

    const result = await scrapeDegreeNavigatorFast(page, {
      sessionId: 'session_fast_1',
      capturedAt: '2026-05-01T05:40:47.179Z',
    });

    assert.strictEqual(result.payload.sourceSessionId, 'session_fast_1');
    assert.strictEqual(result.summary.pageCount, 2);
    assert.strictEqual(result.summary.auditPageCount, 1);
    assert.strictEqual(result.summary.courseCodeCount, 1);
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
