import { getDefaultTerm, parseCourseString } from '../lib/utils.js';
import { getSupabaseServiceClient } from '../lib/supabase.js';
import type { DegreeNavigatorCapture } from './schemas.js';

type SupabaseClientLike = ReturnType<typeof getSupabaseServiceClient>;

type EnrichCourseTitlesOptions = {
  supabaseClient?: SupabaseClientLike;
  year?: number;
  term?: '0' | '1' | '7' | '9';
  campus?: 'NB' | 'NK' | 'CM';
  now?: () => Date;
};

type CourseRef = DegreeNavigatorCapture['transcriptTerms'][number]['courses'][number];

type CourseTitleRow = {
  course_string: string | null;
  title: string | null;
  year?: number | null;
  term?: string | null;
  campus?: string | null;
};

const hasTitle = (course: CourseRef): boolean => {
  const title = course.title?.trim();
  return Boolean(title && title !== course.courseCode.trim());
};

const normalizeCourseCode = (courseCode: string): string | null => {
  const trimmed = courseCode.trim();
  return parseCourseString(trimmed) ? trimmed : null;
};

function collectCourseRefs(capture: DegreeNavigatorCapture): CourseRef[] {
  const courses: CourseRef[] = [];

  for (const audit of capture.audits) {
    for (const requirement of audit.requirements) {
      courses.push(...(requirement.courses ?? []));
    }
    courses.push(...(audit.unusedCourses ?? []));
  }

  for (const transcriptTerm of capture.transcriptTerms) {
    courses.push(...transcriptTerm.courses);
  }

  return courses;
}

function termFromLabel(label: string | undefined): { year: number; term: string } | null {
  const match = label?.match(/\b(Fall|Spring|Summer|Winter)\s+(\d{4})\b/i);
  if (!match) return null;
  const termName = match[1].toLowerCase();
  return {
    year: Number(match[2]),
    term: termName.startsWith('spring')
      ? '1'
      : termName.startsWith('summer')
        ? '7'
        : termName.startsWith('fall')
          ? '9'
          : '0',
  };
}

function scoreTitleRow(
  row: CourseTitleRow,
  preferredTerms: Array<{ year: number; term: string }>,
  defaultTerm: { year: number; term: string },
): number {
  const rowYear = typeof row.year === 'number' ? row.year : undefined;
  const rowTerm = row.term ?? undefined;
  if (preferredTerms.some((term) => term.year === rowYear && term.term === rowTerm)) {
    return 100_000 + (rowYear ?? 0);
  }
  if (rowYear === defaultTerm.year && rowTerm === defaultTerm.term) {
    return 50_000 + rowYear;
  }
  return rowYear ?? 0;
}

async function fetchCourseTitles(
  courseRefs: CourseRef[],
  options: EnrichCourseTitlesOptions,
): Promise<Map<string, string>> {
  const courseCodes = uniqueCourseCodes(courseRefs);
  if (courseCodes.length === 0) return new Map();

  const defaultTerm = getDefaultTerm(options.now?.());
  const term = options.term ?? defaultTerm.term;
  const year = options.year ?? defaultTerm.year;
  const lookupDefaultTerm = { year, term };
  const campus = options.campus ?? 'NB';
  const campusFilters = [campus, `ONLINE_${campus}`];
  const supabase = options.supabaseClient ?? getSupabaseServiceClient();
  const preferredTermsByCode = new Map<string, Array<{ year: number; term: string }>>();
  for (const course of courseRefs) {
    const normalizedCourseCode = normalizeCourseCode(course.courseCode);
    const preferredTerm = termFromLabel(course.termLabel);
    if (!normalizedCourseCode || !preferredTerm) continue;
    preferredTermsByCode.set(normalizedCourseCode, [
      ...(preferredTermsByCode.get(normalizedCourseCode) ?? []),
      preferredTerm,
    ]);
  }

  const { data, error } = await supabase
    .from('v_course_search')
    .select('course_string, title, year, term, campus')
    .in('campus', campusFilters)
    .in('course_string', courseCodes);

  if (error) {
    throw new Error(`Failed to enrich Degree Navigator course titles: ${error.message}`);
  }

  const bestRowsByCode = new Map<string, { score: number; title: string }>();
  for (const row of (data ?? []) as CourseTitleRow[]) {
    if (!row.course_string || !row.title) continue;
    const preferredTerms = preferredTermsByCode.get(row.course_string) ?? [];
    const score = scoreTitleRow(row, preferredTerms, lookupDefaultTerm);
    const existing = bestRowsByCode.get(row.course_string);
    if (!existing || score > existing.score) {
      bestRowsByCode.set(row.course_string, { score, title: row.title });
    }
  }

  return new Map([...bestRowsByCode].map(([code, row]) => [code, row.title]));
}

function uniqueCourseCodes(courseRefs: CourseRef[]): string[] {
  return [...new Set(
    courseRefs
      .map((course) => normalizeCourseCode(course.courseCode))
      .filter((courseCode): courseCode is string => Boolean(courseCode)),
  )];
}

function mapCourseRef(course: CourseRef, titlesByCode: Map<string, string>): CourseRef {
  if (hasTitle(course)) return course;

  const normalizedCourseCode = normalizeCourseCode(course.courseCode);
  const title = normalizedCourseCode ? titlesByCode.get(normalizedCourseCode) : undefined;
  return title ? { ...course, title } : course;
}

export async function enrichDegreeNavigatorCourseTitles(
  capture: DegreeNavigatorCapture,
  options: EnrichCourseTitlesOptions = {},
): Promise<DegreeNavigatorCapture> {
  const existingTitlesByCode = new Map<string, string>();
  const codesNeedingLookup = new Set<string>();

  for (const course of collectCourseRefs(capture)) {
    const normalizedCourseCode = normalizeCourseCode(course.courseCode);
    if (!normalizedCourseCode) continue;

    if (hasTitle(course)) {
      existingTitlesByCode.set(normalizedCourseCode, course.title!.trim());
    } else if (!existingTitlesByCode.has(normalizedCourseCode)) {
      codesNeedingLookup.add(normalizedCourseCode);
    }
  }

  for (const code of existingTitlesByCode.keys()) {
    codesNeedingLookup.delete(code);
  }

  let fetchedTitlesByCode = new Map<string, string>();
  try {
    fetchedTitlesByCode = await fetchCourseTitles(
      collectCourseRefs(capture).filter((course) => {
        const normalizedCourseCode = normalizeCourseCode(course.courseCode);
        return normalizedCourseCode ? codesNeedingLookup.has(normalizedCourseCode) : false;
      }),
      options,
    );
  } catch {
    fetchedTitlesByCode = new Map();
  }

  const titlesByCode = new Map([...fetchedTitlesByCode, ...existingTitlesByCode]);

  return {
    ...capture,
    audits: capture.audits.map((audit) => ({
      ...audit,
      requirements: audit.requirements.map((requirement) => ({
        ...requirement,
        courses: requirement.courses?.map((course) => mapCourseRef(course, titlesByCode)),
      })),
      unusedCourses: audit.unusedCourses?.map((course) => mapCourseRef(course, titlesByCode)),
    })),
    transcriptTerms: capture.transcriptTerms.map((transcriptTerm) => ({
      ...transcriptTerm,
      courses: transcriptTerm.courses.map((course) => mapCourseRef(course, titlesByCode)),
    })),
  };
}
