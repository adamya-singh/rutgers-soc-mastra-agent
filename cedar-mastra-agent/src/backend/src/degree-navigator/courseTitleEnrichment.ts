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
};

const hasTitle = (course: CourseRef): boolean =>
  typeof course.title === 'string' && course.title.trim().length > 0;

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

async function fetchCourseTitles(
  courseCodes: string[],
  options: EnrichCourseTitlesOptions,
): Promise<Map<string, string>> {
  if (courseCodes.length === 0) return new Map();

  const defaultTerm = getDefaultTerm(options.now?.());
  const year = options.year ?? defaultTerm.year;
  const term = options.term ?? defaultTerm.term;
  const campus = options.campus ?? 'NB';
  const campusFilters = [campus, `ONLINE_${campus}`];
  const supabase = options.supabaseClient ?? getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('v_course_search')
    .select('course_string, title')
    .eq('year', year)
    .eq('term', term)
    .in('campus', campusFilters)
    .in('course_string', courseCodes);

  if (error) {
    throw new Error(`Failed to enrich Degree Navigator course titles: ${error.message}`);
  }

  const titlesByCode = new Map<string, string>();
  for (const row of (data ?? []) as CourseTitleRow[]) {
    if (row.course_string && row.title && !titlesByCode.has(row.course_string)) {
      titlesByCode.set(row.course_string, row.title);
    }
  }

  return titlesByCode;
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
    fetchedTitlesByCode = await fetchCourseTitles([...codesNeedingLookup], options);
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
