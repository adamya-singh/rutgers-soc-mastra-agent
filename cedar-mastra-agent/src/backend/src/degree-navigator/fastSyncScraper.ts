import {
  DegreeNavigatorExtractionPageKind,
  DegreeNavigatorExtractionPayload,
  DegreeNavigatorExtractionSummary,
  DegreeNavigatorExtractionPayloadSchema,
} from './schemas.js';

export const DEGREE_NAVIGATOR_MY_DEGREES_URL =
  'https://dn.rutgers.edu/DN/Audit/MyDegrees.aspx?pageid=MyDegrees';
export const DEGREE_NAVIGATOR_TRANSCRIPT_URL =
  'https://dn.rutgers.edu/DN/Transcript.aspx?pageid=mytranscript';

const DEGREE_AUDIT_PATH = '/DN/Audit/DegreeAudit.aspx';
const TRANSCRIPT_PATH = '/DN/Transcript.aspx';
const COURSE_CODE_PATTERN = /\b\d{2}:\d{3}:\d{3}\b/g;
const TRANSCRIPT_COURSE_CODE_PATTERN = /^([0-9]{2}|[A-Z]{2}):[0-9A-Z]{3}:[0-9A-Z]{3}$/;
const TERM_PATTERN = /\b(Fall|Spring|Summer|Winter)\s+(\d{4})\b/i;
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
type CourseHint = NonNullable<DegreeNavigatorEvidencePage['transcriptTermHints']>[number]['courses'][number];
type RequirementHint = NonNullable<DegreeNavigatorEvidencePage['auditHint']>['requirements'][number];
type CourseOptionGroup = RequirementHint['courseOptionGroups'][number];

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

function extractCourseCodesFromText(text: string): string[] {
  COURSE_CODE_PATTERN.lastIndex = 0;
  return uniqueBy(text.match(COURSE_CODE_PATTERN) ?? [], (code) => code);
}

function extractCourseCodesFromBracedText(text: string): string[] {
  return uniqueBy(
    Array.from(text.matchAll(/\{([^}]+)\}/g))
      .flatMap((match) => extractCourseCodesFromText(match[1])),
    (code) => code,
  );
}

function extractFirstNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function getAllEvidenceText(page: Pick<DegreeNavigatorEvidencePage, 'title' | 'headings' | 'tables' | 'sections' | 'links'>): string {
  return [
    page.title,
    ...page.headings,
    ...page.tables.flat(2),
    ...page.sections.map((section) => `${section.heading ?? ''} ${section.text}`),
    ...page.links.map((link) => link.text),
  ].join(' ');
}

function pageKindFromUrl(url: string): DegreeNavigatorExtractionPageKind {
  if (url.includes('MyDegrees.aspx')) {
    return 'my_degrees';
  }
  if (url.includes('DegreeAudit.aspx')) {
    return 'degree_audit';
  }
  if (url.includes('Transcript.aspx')) {
    return 'transcript';
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

function isTranscriptUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith(TRANSCRIPT_PATH);
  } catch {
    return false;
  }
}

function parseProfileHint(text: string): DegreeNavigatorEvidencePage['profileHint'] {
  const detailsMatch = text.match(/\[x\]\s*([A-Z][A-Z\s'-]+?)\s*\((\d{9})\)/);
  const ruidMatch = text.match(/(?:Student\s+)?RUID:\s*(\d{9})/i) ?? text.match(/\((\d{9})\)/);
  const schoolMatch = text.match(/School Code:\s*([A-Z0-9]+)\s*\(([^)]+)\)/i);
  const gradYearMatch = text.match(/Year Of Graduation:\s*(\d{2,4})/i);
  const gradMonthMatch = text.match(/Month Of Graduation:\s*([A-Za-z]+)/i);
  const netidMatch = text.match(/NetID:\s*([A-Za-z0-9_-]+)/i);
  const plannedMatch = text.match(/You have\s+(\d+)\s+courses?\s+in your course plan/i);
  const name = detailsMatch?.[1]?.trim() ?? text.match(/Date:\s+[A-Za-z]+\s+\d{2}\s+\d{4}\s+([A-Z][A-Z\s'-]+?)\s+Student RUID:/)?.[1]?.trim();
  const graduationYear = gradYearMatch?.[1]
    ? (gradYearMatch[1].length === 2 ? `20${gradYearMatch[1]}` : gradYearMatch[1])
    : undefined;

  const hint = {
    ...(name ? { name } : {}),
    ...(ruidMatch?.[1] ? { ruid: ruidMatch[1] } : {}),
    ...(netidMatch?.[1] ? { netid: netidMatch[1] } : {}),
    ...(schoolMatch?.[1] ? { schoolCode: schoolMatch[1] } : {}),
    ...(schoolMatch?.[2] ? { schoolName: schoolMatch[2] } : {}),
    ...(graduationYear ? { graduationYear } : {}),
    ...(gradMonthMatch?.[1] ? { graduationMonth: gradMonthMatch[1] } : {}),
    ...(plannedMatch?.[1] ? { plannedCourseCount: Number(plannedMatch[1]) } : {}),
  };

  return Object.keys(hint).length > 0 ? hint : undefined;
}

function inferProgramKind(title: string): 'core' | 'major' | 'minor' | 'certificate' | 'other' {
  if (/\bcore\b/i.test(title)) return 'core';
  if (/\bmajor\b/i.test(title)) return 'major';
  if (/\bminor\b/i.test(title)) return 'minor';
  if (/\bcertificate\b/i.test(title)) return 'certificate';
  return 'other';
}

function parseProgramHints(page: Pick<DegreeNavigatorEvidencePage, 'tables' | 'links'>): DegreeNavigatorEvidencePage['programHints'] {
  const auditUrls = page.links.filter((link) => isDegreeAuditUrl(link.href)).map((link) => link.href);
  const programs: DegreeNavigatorEvidencePage['programHints'] = [];
  for (const table of page.tables) {
    for (const row of table) {
      if (row.length < 2) continue;
      const [code, title] = row.map(cleanText);
      if (!/^[A-Z0-9]{2,}$/.test(code) || /^name$/i.test(title) || title.length < 4) continue;
      programs.push({
        code,
        title,
        kind: inferProgramKind(title),
        ...(title.match(/\((NB|NK|CM)\)/)?.[1] ? { campus: title.match(/\((NB|NK|CM)\)/)![1] } : {}),
        ...(auditUrls[programs.length] ? { auditUrl: auditUrls[programs.length] } : {}),
      });
    }
  }
  return uniqueBy(programs, (program) => `${program.code ?? ''}:${program.title}`).slice(0, 20);
}

function parseCourseHints(text: string): CourseHint[] {
  const hints: CourseHint[] = [];
  const completedPattern = /(\d{2}:\d{3}:\d{3})\(\s*([^)]*?)\)/g;
  for (const match of text.matchAll(completedPattern)) {
    const details = match[2].split(',').map((part) => cleanText(part)).filter(Boolean);
    const credits = extractFirstNumber(details[0]);
    const termLabel = details.find((part) => TERM_PATTERN.test(part));
    const usedAs = details.join(', ').match(/used as\s+(\d{2}:\d{3}:\d{3})/i)?.[1];
    const grade = details.find((part) =>
      /^(A|B|C|D|F)[+-]?$|^current$|^planned$|^transfer$|^ap$/i.test(part),
    );
    const specialCode = details.find((part) => /^[A-Z]$/.test(part) && part !== grade);
    hints.push({
      courseCode: match[1],
      ...(credits !== undefined ? { credits } : {}),
      ...(termLabel ? { termLabel } : {}),
      ...(grade ? { grade, status: /^current$/i.test(grade) ? 'current' : 'completed' } : {}),
      ...(specialCode ? { specialCode } : {}),
      ...(usedAs ? { usedAs } : {}),
      rawText: match[0],
    });
  }

  for (const courseCode of extractCourseCodesFromText(text)) {
    if (!hints.some((hint) => hint.courseCode === courseCode)) {
      hints.push({ courseCode });
    }
  }

  return uniqueBy(hints, (hint) => `${hint.courseCode}:${hint.termLabel ?? ''}:${hint.grade ?? ''}:${hint.usedAs ?? ''}`)
    .slice(0, 120);
}

function parseCourseOptionGroups(text: string | undefined): CourseOptionGroup[] {
  if (!text) return [];
  const groups: CourseOptionGroup[] = [];
  const normalized = cleanText(text);
  const groupPattern = /(?:\band\s+)?(?:(\d+)\s+courses?\s+from\s+)?(?:([^:{}]+):\s*)?\{([^}]+)\}/gi;

  for (const match of normalized.matchAll(groupPattern)) {
    const courseOptions = extractCourseCodesFromText(match[3]);
    if (courseOptions.length === 0) continue;
    const requiredCount = match[1] ? Number(match[1]) : undefined;
    const label = cleanText(match[2]) || (requiredCount ? `${requiredCount} course${requiredCount === 1 ? '' : 's'}` : 'Options');
    groups.push({
      label,
      courseOptions,
      ...(requiredCount !== undefined ? { requiredCount } : {}),
      ...(requiredCount !== undefined ? { neededCount: requiredCount } : {}),
      description: truncateText(cleanText(match[0]), 500),
    });
  }

  return uniqueBy(groups, (group) => `${group.label}:${group.courseOptions.join(',')}`).slice(0, 40);
}

function parseRequirementHeading(text: string): Pick<RequirementHint, 'code' | 'title'> | null {
  const requirementMatch = text.match(/Requirement\s+(R\d+)\s*:\s*([^-]+?)(?:\s+-\s+|$)/i);
  if (!requirementMatch) return null;
  const code = requirementMatch[1].toUpperCase();
  return {
    code,
    title: `Requirement ${code} : ${cleanText(requirementMatch[2])}`,
  };
}

function parseRequirementHint(text: string): RequirementHint | null {
  const heading = parseRequirementHeading(text);
  if (!heading) return null;
  const statusText = text.match(/Status\s+Total Courses:\s*(\d+)\s+Completed:\s*(\d+)\s+Needs:\s*([^]*?)(?:Requirement\s+[RV]\d|\s+-\s+Description|$)/i);
  const totalCount = statusText?.[1] ? Number(statusText[1]) : undefined;
  const completedCount = statusText?.[2] ? Number(statusText[2]) : undefined;
  const summary = statusText?.[3] ? cleanText(statusText[3]) : undefined;
  const description = text.match(/-\s+Description\s+([^]*?)(?:\s+Requirement\s+V\d|\s+Requirement\s+R\d\s*:|\s+Condition\s+C\d|$)/i)?.[1];
  const notes = Array.from(text.matchAll(/-\s+Notes:\s*([^]*?)(?=\s+Requirement\s+[RV]\d|\s+Requirement\s+R\d\s*:|\s+Condition\s+C\d|\s+-\s+Conditions:|$)/gi))
    .map((match) => truncateText(cleanText(match[1]), 1_000));
  const conditions = Array.from(text.matchAll(/(?:-\s+Conditions:|Condition\s+C\d[^-]*-\s+Description)\s*([^]*?)(?=\s+Requirement\s+[RV]\d|\s+Requirement\s+R\d\s*:|\s+Condition\s+C\d|$)/gi))
    .map((match) => truncateText(cleanText(match[1]), 1_000));
  const completedCoursesText = text.match(/Completed Courses:\s*([^]*?)(?:\s+Requirement\s+R\d|\s+Condition\s+C\d|$)/i)?.[1] ?? '';
  const courseOptionGroups = parseCourseOptionGroups(description);
  const courseOptions = uniqueBy(
    [
      ...courseOptionGroups.flatMap((group) => group.courseOptions),
      ...extractCourseCodesFromBracedText(description ?? text),
    ],
    (code) => code,
  );
  const completedCourses = parseCourseHints(completedCoursesText);
  const neededCount = totalCount !== undefined && completedCount !== undefined
    ? Math.max(totalCount - completedCount, 0)
    : undefined;

  return {
    ...heading,
    ...(summary ? { summary } : {}),
    ...(summary ? {
      status: /satisfied|fulfilled/i.test(summary)
        ? 'complete'
        : /in progress|will be/i.test(summary)
          ? 'in_progress'
          : /needed|not|incomplete/i.test(summary)
            ? 'incomplete'
            : 'unknown',
    } : {}),
    ...(completedCount !== undefined ? { completedCount } : {}),
    ...(totalCount !== undefined ? { totalCount } : {}),
    ...(neededCount !== undefined ? { neededCount } : {}),
    ...(description ? { description: truncateText(cleanText(description), 1_500) } : {}),
    notes,
    conditions,
    courseOptions: courseOptions.slice(0, 80),
    courseOptionGroups,
    completedCourses,
    rawText: truncateText(text, 3_000),
  };
}

function parseSpecialRequirementHints(text: string): RequirementHint[] {
  const hints: RequirementHint[] = [];
  const residencyMatch = text.match(/(Residency Requirement(?:\s+in\s+RU-NB)?)([^]*?)(?=Requirement\s+R\d\s*:|$)/i);
  if (residencyMatch) {
    const residencyText = cleanText(residencyMatch[0]);
    const conditionText = residencyText.match(/(You must achieve[^.]+\.)/i)?.[1];
    hints.push({
      code: 'residency',
      title: cleanText(residencyMatch[1]),
      status: /satisfied|complete/i.test(residencyText) ? 'complete' : undefined,
      summary: truncateText(residencyText, 700),
      notes: [],
      conditions: conditionText ? [cleanText(conditionText)] : [],
      courseOptions: [],
      courseOptionGroups: [],
      completedCourses: parseCourseHints(residencyText),
      rawText: truncateText(residencyText, 2_000),
    });
  }
  return hints;
}

function parseAuditHint(page: DegreeNavigatorEvidencePage): DegreeNavigatorEvidencePage['auditHint'] {
  if (page.kind !== 'degree_audit') return undefined;
  const text = getAllEvidenceText(page);
  const subjectMatch = text.match(/Report for Subject:\s*(.+?)\s+\(([^()]+ \d{4})\)/i);
  const completedRequirementsMatch = text.match(/Completed Requirements:\s*(\d+)\s+of\s+(\d+)/i);
  const gpaMatch = text.match(/((?:Major\s+)?GPA(?: Calculation)?):\s*([0-9.]+)/i);
  const completedCreditsText = text.match(/Completed Credits:\s*(N\/A|[0-9.]+)/i)?.[1];
  const requirementHints = uniqueBy(
    [
      ...page.sections
        .map((section) => parseRequirementHint(section.text))
        .filter((hint): hint is RequirementHint => Boolean(hint)),
      ...parseSpecialRequirementHints(text),
      ...page.headings
        .map((heading) => parseRequirementHeading(heading))
        .filter((heading): heading is Pick<RequirementHint, 'code' | 'title'> => Boolean(heading))
        .map((heading) => ({
          ...heading,
          notes: [],
          conditions: [],
          courseOptions: [],
          courseOptionGroups: [],
          completedCourses: [],
        })),
    ],
    (hint) => hint.code ?? hint.title,
  );
  const programCode = new URL(page.url).searchParams.get('degreeID') ?? undefined;

  return {
    ...(programCode ? { programCode } : {}),
    ...(subjectMatch?.[1] ? { title: cleanText(subjectMatch[1]) } : {}),
    ...(subjectMatch?.[2] ? { versionTerm: subjectMatch[2] } : {}),
    ...(completedCreditsText
      ? { completedCredits: /^N\/A$/i.test(completedCreditsText) ? null : Number(completedCreditsText) }
      : {}),
    ...(completedRequirementsMatch
      ? {
          completedRequirements: {
            completed: Number(completedRequirementsMatch[1]),
            total: Number(completedRequirementsMatch[2]),
          },
        }
      : {}),
    ...(gpaMatch
      ? { gpa: { label: cleanText(gpaMatch[1]), value: Number(gpaMatch[2]) } }
      : {}),
    requirements: requirementHints,
    conditions: uniqueBy(
      requirementHints.flatMap((requirement) => requirement.conditions),
      (condition) => condition,
    ).slice(0, 40),
  };
}

function parseTranscriptTermHints(page: DegreeNavigatorEvidencePage): DegreeNavigatorEvidencePage['transcriptTermHints'] {
  if (page.kind !== 'transcript') return [];
  const terms = new Map<string, NonNullable<DegreeNavigatorEvidencePage['transcriptTermHints']>[number]>();

  for (const row of page.tables.flat()) {
    if (row.length < 4) continue;
    const [labelCell, courseCodeCell, creditsCell, gradeCell, specialCodeCell] = row.map(cleanText);
    if (!TRANSCRIPT_COURSE_CODE_PATTERN.test(courseCodeCell)) continue;

    const termMatch = labelCell.match(TERM_PATTERN);
    const source = /^placement$/i.test(labelCell)
      ? 'placement'
      : /^AP$/i.test(gradeCell) || /^AP$/i.test(specialCodeCell) || /^\d{4}$/.test(labelCell)
        ? 'ap_credit'
        : 'transcript';
    const label = source === 'ap_credit' && /^\d{4}$/.test(labelCell) ? `${labelCell} AP` : labelCell;
    const credits = extractFirstNumber(creditsCell);
    const course: CourseHint = {
      courseCode: courseCodeCell,
      ...(credits !== undefined ? { credits } : {}),
      ...(gradeCell ? { grade: gradeCell } : {}),
      ...(specialCodeCell ? { specialCode: specialCodeCell } : {}),
      status: source === 'placement'
        ? 'placement'
        : source === 'ap_credit'
          ? 'ap'
          : /^current$/i.test(gradeCell)
            ? 'current'
            : 'completed',
      rawText: row.join(' | '),
    };

    const existing = terms.get(label);
    const baseTerm = existing ?? {
      label,
      ...(termMatch?.[2] ? { year: Number(termMatch[2]) } : /^\d{4}$/.test(labelCell) ? { year: Number(labelCell) } : {}),
      ...(termMatch?.[1] ? { termName: termMatch[1] } : {}),
      ...(termMatch?.[1]
        ? {
            termCode: termMatch[1].toLowerCase().startsWith('spring')
              ? '1'
              : termMatch[1].toLowerCase().startsWith('fall')
                ? '9'
                : termMatch[1].toLowerCase().startsWith('summer')
                  ? '7'
                  : '0',
          }
        : {}),
      source,
      courses: [],
    };

    terms.set(label, {
      ...baseTerm,
      courses: uniqueBy([...baseTerm.courses, course], (item) =>
        `${item.courseCode}:${item.credits ?? ''}:${item.grade ?? ''}:${item.specialCode ?? ''}`,
      ),
    });
  }

  return [...terms.values()].slice(0, 30);
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
  return /\b\d{2}:\d{3}:\d{3}\b|requirement|course|credits?|gpa|program|major|minor|certificate|core|school|ruid|netid|completed|needed/i.test(text);
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
  const compactRequirements = page.auditHint?.requirements
    .slice(0, 80)
    .map((requirement) => ({
      ...requirement,
      summary: requirement.summary ? truncateText(requirement.summary, 300) : undefined,
      description: requirement.description ? truncateText(requirement.description, 800) : undefined,
      notes: requirement.notes.slice(0, 5).map((note) => truncateText(note, 500)),
      conditions: requirement.conditions.slice(0, 5).map((condition) => truncateText(condition, 500)),
      courseOptions: requirement.courseOptions.slice(0, 80),
      courseOptionGroups: requirement.courseOptionGroups.slice(0, 40).map((group) => ({
        ...group,
        courseOptions: group.courseOptions.slice(0, 80),
        description: group.description ? truncateText(group.description, 300) : undefined,
      })),
      completedCourses: requirement.completedCourses.slice(0, 80),
      rawText: requirement.rawText ? truncateText(requirement.rawText, 1_200) : undefined,
    }));

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
    programHints: page.programHints
      .map((program) => ({
        ...program,
        title: truncateText(cleanText(program.title), 160),
      }))
      .slice(0, 20),
    auditHint: page.auditHint
      ? {
          ...page.auditHint,
          title: page.auditHint.title ? truncateText(page.auditHint.title, 160) : undefined,
          requirements: compactRequirements ?? [],
          conditions: page.auditHint.conditions.slice(0, 40).map((condition) => truncateText(condition, 500)),
        }
      : undefined,
    transcriptTermHints: page.transcriptTermHints
      .map((term) => ({
        ...term,
        courses: term.courses.slice(0, 80).map((course) => ({
          ...course,
          rawText: course.rawText ? truncateText(course.rawText, 200) : undefined,
        })),
      }))
      .slice(0, 30),
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

  const basePage: DegreeNavigatorEvidencePage = {
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
    courseCodes: uniqueBy(
      [
        ...raw.courseCodes.map(cleanText).filter(Boolean),
        ...extractCourseCodesFromText([
          ...raw.headings,
          ...raw.tables.flat(2),
          ...sections.map((section) => section.text),
          ...raw.links.map((link) => link.text),
        ].join(' ')),
      ],
      (code) => code,
    ),
  };

  return {
    ...basePage,
    profileHint: parseProfileHint(getAllEvidenceText(basePage)),
    programHints: basePage.kind === 'my_degrees' ? parseProgramHints(basePage) : [],
    auditHint: parseAuditHint(basePage),
    transcriptTermHints: parseTranscriptTermHints(basePage),
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

function discoverTranscriptUrlsFromEvidence(pages: DegreeNavigatorEvidencePage[]): string[] {
  return uniqueBy(
    pages
      .flatMap((evidencePage) => [
        evidencePage.kind === 'transcript' ? evidencePage.url : null,
        ...evidencePage.links.map((link) => link.href),
      ])
      .filter((url): url is string => Boolean(url))
      .filter(isTranscriptUrl),
    (url) => url,
  ).slice(0, 3);
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

  const transcriptUrls = discoverTranscriptUrlsFromEvidence(capturedPages);
  for (const transcriptUrl of transcriptUrls) {
    await page.goto(transcriptUrl, {
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
