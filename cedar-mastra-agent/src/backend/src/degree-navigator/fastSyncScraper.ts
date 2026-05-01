import {
  DegreeNavigatorExtractionPageKind,
  DegreeNavigatorExtractionPayload,
  DegreeNavigatorExtractionSummary,
  DegreeNavigatorExtractionPayloadSchema,
} from './schemas.js';

export const DEGREE_NAVIGATOR_MY_DEGREES_URL =
  'https://dn.rutgers.edu/DN/Audit/MyDegrees.aspx?pageid=MyDegrees';

const DEGREE_AUDIT_PATH = '/DN/Audit/DegreeAudit.aspx';
const MAX_PAYLOAD_BYTES = 700_000;
const MAX_HEADING_COUNT = 60;
const MAX_LINK_COUNT = 80;
const MAX_TABLE_COUNT = 18;
const MAX_TABLE_ROWS = 70;
const MAX_TABLE_CELLS = 10;
const MAX_TABLE_CELL_LENGTH = 180;
const MAX_SECTION_COUNT = 24;
const MAX_SECTION_TEXT_LENGTH = 1_200;
const MAX_SECTION_TOTAL_LENGTH = 15_000;
const MAX_DISCOVERED_AUDITS = 20;
const MAX_COURSE_CODE_COUNT_PER_PAGE = 250;

export type DegreeNavigatorScrapePage = {
  url: () => string;
  title: () => Promise<string>;
  goto: (url: string, options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle'; timeout?: number }) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
};

type DegreeNavigatorEvidencePage = DegreeNavigatorExtractionPayload['pages'][number];

type BrowserPageEvidence = {
  url: string;
  title?: string;
  headings: string[];
  tables: string[][][];
  sections: Array<{ heading?: string; text: string }>;
  links: Array<{ text: string; href: string }>;
  courseCodes: string[];
};

type ScrapeOptions = {
  sessionId: string;
  capturedAt: string;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}...` : value;
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function pageKindFromUrl(url: string): DegreeNavigatorExtractionPageKind {
  if (url.includes('MyDegrees.aspx')) {
    return 'my_degrees';
  }
  if (url.includes('DegreeAudit.aspx')) {
    return 'degree_audit';
  }
  return 'unknown';
}

function isDegreeAuditUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith(DEGREE_AUDIT_PATH) && parsed.searchParams.has('degreeID');
  } catch {
    return false;
  }
}

function normalizeUrl(baseUrl: string, href: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function summarizePayload(payload: DegreeNavigatorExtractionPayload): DegreeNavigatorExtractionSummary {
  const courseCodes = new Set(payload.pages.flatMap((page) => page.courseCodes));
  return {
    pageCount: payload.pages.length,
    auditPageCount: payload.pages.filter((page) => page.kind === 'degree_audit').length,
    myDegreesPageCount: payload.pages.filter((page) => page.kind === 'my_degrees').length,
    linkCount: payload.pages.reduce((total, page) => total + page.links.length, 0),
    tableCount: payload.pages.reduce((total, page) => total + page.tables.length, 0),
    sectionCount: payload.pages.reduce((total, page) => total + page.sections.length, 0),
    courseCodeCount: courseCodes.size,
  };
}

function getPayloadSize(payload: DegreeNavigatorExtractionPayload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

function tableHasUsefulText(table: string[][]): boolean {
  const text = table.flat().join(' ');
  return /\b\d{2}:\d{3}:\d{3}\b|requirement|course|credits?|gpa|program|school|ruid|netid|completed|needed/i.test(text);
}

function compactTable(table: string[][], maxRows: number, maxCells: number, maxCellLength: number): string[][] {
  return table
    .slice(0, maxRows)
    .map((row) => row
      .slice(0, maxCells)
      .map((cell) => truncateText(cleanText(cell), maxCellLength))
      .filter(Boolean))
    .filter((row) => row.length > 0);
}

function compactPage(
  page: DegreeNavigatorEvidencePage,
  options: {
    headingCount: number;
    headingLength: number;
    linkCount: number;
    linkTextLength: number;
    sectionCount: number;
    sectionLength: number;
    tableCount: number;
    tableRows: number;
    tableCells: number;
    tableCellLength: number;
    courseCodeCount: number;
    auditLinksOnly?: boolean;
  },
): DegreeNavigatorEvidencePage {
  return {
    ...page,
    title: page.title ? truncateText(page.title, 120) : undefined,
    headings: page.headings
      .map((heading) => truncateText(cleanText(heading), options.headingLength))
      .filter(Boolean)
      .slice(0, options.headingCount),
    tables: page.tables
      .filter(tableHasUsefulText)
      .slice(0, options.tableCount)
      .map((table) => compactTable(
        table,
        options.tableRows,
        options.tableCells,
        options.tableCellLength,
      ))
      .filter((table) => table.length > 0),
    sections: page.sections
      .map((section) => ({
        heading: section.heading ? truncateText(cleanText(section.heading), 100) : undefined,
        text: truncateText(cleanText(section.text), options.sectionLength),
      }))
      .filter((section) => section.text.length > 0)
      .slice(0, options.sectionCount),
    links: page.links
      .filter((link) => !options.auditLinksOnly || isDegreeAuditUrl(link.href))
      .map((link) => ({
        text: truncateText(cleanText(link.text), options.linkTextLength),
        href: link.href,
      }))
      .slice(0, options.linkCount),
    courseCodes: uniqueBy(
      page.courseCodes.map(cleanText).filter(Boolean),
      (code) => code,
    ).slice(0, options.courseCodeCount),
  };
}

function trimPayloadToLimit(
  payload: DegreeNavigatorExtractionPayload,
  maxBytes = MAX_PAYLOAD_BYTES,
): DegreeNavigatorExtractionPayload {
  let trimmed = DegreeNavigatorExtractionPayloadSchema.parse({
    ...payload,
    pages: payload.pages.map((page) => compactPage(page, {
      headingCount: MAX_HEADING_COUNT,
      headingLength: 160,
      linkCount: MAX_LINK_COUNT,
      linkTextLength: 120,
      sectionCount: MAX_SECTION_COUNT,
      sectionLength: MAX_SECTION_TEXT_LENGTH,
      tableCount: MAX_TABLE_COUNT,
      tableRows: MAX_TABLE_ROWS,
      tableCells: MAX_TABLE_CELLS,
      tableCellLength: MAX_TABLE_CELL_LENGTH,
      courseCodeCount: MAX_COURSE_CODE_COUNT_PER_PAGE,
    })),
  });

  const passes: Array<(page: DegreeNavigatorEvidencePage) => DegreeNavigatorEvidencePage> = [
    (page) => compactPage(page, {
      headingCount: 40,
      headingLength: 120,
      linkCount: 60,
      linkTextLength: 100,
      sectionCount: 12,
      sectionLength: 800,
      tableCount: 12,
      tableRows: 55,
      tableCells: 8,
      tableCellLength: 140,
      courseCodeCount: 180,
    }),
    (page) => compactPage(page, {
      headingCount: 30,
      headingLength: 100,
      linkCount: 40,
      linkTextLength: 80,
      sectionCount: 6,
      sectionLength: 500,
      tableCount: 8,
      tableRows: 40,
      tableCells: 8,
      tableCellLength: 120,
      courseCodeCount: 120,
    }),
    (page) => compactPage(page, {
      headingCount: 20,
      headingLength: 80,
      linkCount: 30,
      linkTextLength: 60,
      sectionCount: 3,
      sectionLength: 350,
      tableCount: 5,
      tableRows: 30,
      tableCells: 6,
      tableCellLength: 100,
      courseCodeCount: 80,
      auditLinksOnly: true,
    }),
    (page) => compactPage(page, {
      headingCount: 12,
      headingLength: 70,
      linkCount: 20,
      linkTextLength: 50,
      sectionCount: 0,
      sectionLength: 0,
      tableCount: 2,
      tableRows: 15,
      tableCells: 6,
      tableCellLength: 80,
      courseCodeCount: 60,
      auditLinksOnly: true,
    }),
    (page) => compactPage(page, {
      headingCount: 8,
      headingLength: 60,
      linkCount: 20,
      linkTextLength: 40,
      sectionCount: 0,
      sectionLength: 0,
      tableCount: 1,
      tableRows: 8,
      tableCells: 4,
      tableCellLength: 60,
      courseCodeCount: 40,
      auditLinksOnly: true,
    }),
  ];

  for (const pass of passes) {
    if (getPayloadSize(trimmed) <= maxBytes) {
      return trimmed;
    }

    trimmed = DegreeNavigatorExtractionPayloadSchema.parse({
      ...trimmed,
      pages: trimmed.pages.map(pass),
    });
  }

  if (getPayloadSize(trimmed) > maxBytes) {
    trimmed = DegreeNavigatorExtractionPayloadSchema.parse({
      ...trimmed,
      pages: trimmed.pages.map((page) => ({
        ...page,
        headings: page.headings.slice(0, 4).map((heading) => truncateText(heading, 50)),
        tables: [],
        sections: [],
        links: page.links.filter((link) => isDegreeAuditUrl(link.href)).slice(0, 10),
        courseCodes: page.courseCodes.slice(0, 30),
      })),
    });
  }

  return trimmed;
}

function assertValidPayload(payload: DegreeNavigatorExtractionPayload): void {
  const summary = summarizePayload(payload);
  const serializedSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  const auditUrls = payload.pages.filter((page) => page.kind === 'degree_audit').map((page) => page.url);
  const hasAuditMarkers = payload.pages.some((page) => {
    const text = [
      page.title,
      ...page.headings,
      ...page.sections.map((section) => section.text),
      ...page.tables.flat(2),
    ].join(' ');
    return /degree audit|requirement|course|credits|gpa/i.test(text);
  });

  if (summary.auditPageCount < 1) {
    throw new Error('Degree Navigator extraction did not find any degree audit pages.');
  }
  if (!auditUrls.some(isDegreeAuditUrl)) {
    throw new Error('Degree Navigator extraction did not find a valid DegreeAudit.aspx URL.');
  }
  if (!hasAuditMarkers) {
    throw new Error('Degree Navigator extraction did not include recognizable audit content.');
  }
  if (serializedSize > MAX_PAYLOAD_BYTES) {
    throw new Error(`Degree Navigator extraction payload is too large (${serializedSize} bytes).`);
  }
}

async function waitForStablePage(page: DegreeNavigatorScrapePage): Promise<void> {
  await page.waitForTimeout(750);
}

export async function collectDegreeNavigatorEvidencePage(
  page: DegreeNavigatorScrapePage,
): Promise<DegreeNavigatorEvidencePage> {
  const title = cleanText(await page.title());
  const raw = await page.evaluate<BrowserPageEvidence>(() => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const max = <T>(items: T[], count: number) => items.slice(0, count);
    const currentUrl = window.location.href;
    const coursePattern = /\b\d{2}:\d{3}:\d{3}\b/g;

    const headings = max(
      Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],legend'))
        .map((element) => clean(element.textContent))
        .filter(Boolean),
      60,
    );

    const links = max(
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((link) => ({
          text: clean(link.textContent),
          href: new URL(link.getAttribute('href') ?? '', currentUrl).toString(),
        }))
        .filter((link) => link.text.length > 0 || link.href.includes('DegreeAudit.aspx')),
      80,
    );

    const tables = max(
      Array.from(document.querySelectorAll('table')).map((table) =>
        max(
          Array.from(table.querySelectorAll('tr')).map((row) =>
            max(
              Array.from(row.querySelectorAll('th,td'))
                .map((cell) => clean(cell.textContent).slice(0, 180))
                .filter(Boolean),
              10,
            ),
          ).filter((row) => row.length > 0),
          70,
        ),
      ).filter((table) => table.length > 0),
      18,
    );

    const sectionNodes = Array.from(
      document.querySelectorAll('main,article,section,fieldset,.requirement,.audit,.program,.transcript,[id*="requirement"],[class*="requirement"]'),
    );
    const fallbackNodes = sectionNodes.length > 0
      ? sectionNodes
      : Array.from(document.querySelectorAll('form,body'));
    const sections = max(
      fallbackNodes
        .map((element) => {
          const heading = clean(
            element.querySelector('h1,h2,h3,h4,h5,h6,legend,[role="heading"]')?.textContent,
          );
          return {
            heading: heading || undefined,
            text: clean(element.textContent),
          };
        })
        .filter((section) => section.text.length > 0),
      24,
    );

    const courseCodes = Array.from(
      new Set((document.body.innerText.match(coursePattern) ?? []).map((code) => code.trim())),
    );

    return {
      url: currentUrl,
      title: document.title,
      headings,
      tables,
      sections,
      links,
      courseCodes,
    };
  });

  let totalSectionLength = 0;
  const sections = uniqueBy(
    raw.sections
      .map((section) => ({
        heading: cleanText(section.heading) || undefined,
        text: truncateText(cleanText(section.text), MAX_SECTION_TEXT_LENGTH),
      }))
      .filter((section) => section.text.length > 0),
    (section) => section.text,
  )
    .filter((section) => {
      if (section.text.length === 0 || totalSectionLength >= MAX_SECTION_TOTAL_LENGTH) {
        return false;
      }
      totalSectionLength += section.text.length;
      return true;
    })
    .slice(0, MAX_SECTION_COUNT);

  return {
    url: raw.url,
    title: title || cleanText(raw.title) || undefined,
    kind: pageKindFromUrl(raw.url),
    headings: uniqueBy(raw.headings.map(cleanText).filter(Boolean), (heading) => heading)
      .slice(0, MAX_HEADING_COUNT),
    tables: raw.tables
      .filter(tableHasUsefulText)
      .slice(0, MAX_TABLE_COUNT)
      .map((table) => table
        .slice(0, MAX_TABLE_ROWS)
        .map((row) => row
          .map((cell) => truncateText(cleanText(cell), MAX_TABLE_CELL_LENGTH))
          .filter(Boolean)
          .slice(0, MAX_TABLE_CELLS))
        .filter((row) => row.length > 0))
      .filter((table) => table.length > 0),
    sections,
    links: uniqueBy(
      raw.links
        .map((link) => {
          const href = normalizeUrl(raw.url, link.href);
          return href ? { text: cleanText(link.text), href } : null;
        })
        .filter((link): link is { text: string; href: string } => Boolean(link))
        .filter((link) => !link.href.startsWith('javascript:')),
      (link) => `${link.text}:${link.href}`,
    ).slice(0, MAX_LINK_COUNT),
    courseCodes: uniqueBy(raw.courseCodes.map(cleanText).filter(Boolean), (code) => code),
  };
}

function discoverAuditUrlsFromEvidence(pages: DegreeNavigatorEvidencePage[]): string[] {
  return uniqueBy(
    pages
      .flatMap((evidencePage) => [
        evidencePage.kind === 'degree_audit' ? evidencePage.url : null,
        ...evidencePage.links.map((link) => link.href),
      ])
      .filter((url): url is string => Boolean(url))
      .filter(isDegreeAuditUrl),
    (url) => url,
  ).slice(0, MAX_DISCOVERED_AUDITS);
}

export async function scrapeDegreeNavigatorFast(
  page: DegreeNavigatorScrapePage,
  options: ScrapeOptions,
): Promise<{ payload: DegreeNavigatorExtractionPayload; summary: DegreeNavigatorExtractionSummary }> {
  const capturedPages: DegreeNavigatorEvidencePage[] = [];

  await waitForStablePage(page);
  capturedPages.push(await collectDegreeNavigatorEvidencePage(page));

  if (!page.url().includes('MyDegrees.aspx')) {
    await page.goto(DEGREE_NAVIGATOR_MY_DEGREES_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await waitForStablePage(page);
    capturedPages.push(await collectDegreeNavigatorEvidencePage(page));
  }

  const auditUrls = discoverAuditUrlsFromEvidence(capturedPages);
  for (const auditUrl of auditUrls) {
    await page.goto(auditUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await waitForStablePage(page);
    capturedPages.push(await collectDegreeNavigatorEvidencePage(page));
  }

  const pages = uniqueBy(capturedPages, (evidencePage) => evidencePage.url);
  const payload = trimPayloadToLimit(DegreeNavigatorExtractionPayloadSchema.parse({
    capturedAt: options.capturedAt,
    sourceSessionId: options.sessionId,
    pages,
  }));
  assertValidPayload(payload);

  return {
    payload,
    summary: summarizePayload(payload),
  };
}
