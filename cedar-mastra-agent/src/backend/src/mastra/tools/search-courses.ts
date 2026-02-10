import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase as defaultSupabase } from '../../lib/supabase.js';
import { getDefaultTerm, getTermName } from '../../lib/utils.js';

/**
 * searchCourses - Flexible multi-criteria course discovery
 * 
 * Primary tool for finding courses. Supports searching by:
 * - Text query (title search)
 * - Subject code
 * - Academic level (U/G)
 * - Credits (exact or range)
 * - Campus
 * - Core curriculum codes
 * - Instructor name
 * - Open sections only
 */
export const SEARCH_COURSES_DESCRIPTION = `Search for courses in the Rutgers Schedule of Classes. 
Use this tool to find courses by subject, title, level, credits, core codes, instructor, or availability.
Examples: "Find CS courses", "Show 3-credit QQ courses", "Open sections for Math".`;

export const searchCoursesInputSchema = z.object({
    query: z.string().optional()
      .describe('Full-text search on course title (e.g., "machine learning", "calculus")'),
    
    subject: z.string().optional()
      .describe('Subject code (e.g., "198" for Computer Science, "640" for Mathematics)'),
    
    level: z.enum(['U', 'G']).optional()
      .describe('Academic level: U=Undergraduate, G=Graduate'),
    
    credits: z.number().optional()
      .describe('Exact credit hours (e.g., 3, 4)'),
    
    creditsMin: z.number().optional()
      .describe('Minimum credits for range search'),
    
    creditsMax: z.number().optional()
      .describe('Maximum credits for range search'),
    
    campus: z.enum(['NB', 'NK', 'CM']).default('NB')
      .describe('Campus: NB=New Brunswick, NK=Newark, CM=Camden. Defaults to NB'),
    
    includeOnline: z.boolean().default(true)
      .describe('Include ONLINE_{campus} results (e.g., ONLINE_NB). Defaults to true'),
    
    year: z.number().optional()
      .describe('Academic year (e.g., 2025). Auto-detected if not specified'),
    
    term: z.enum(['0', '1', '7', '9']).optional()
      .describe('Term: 0=Winter, 1=Spring, 7=Summer, 9=Fall. Auto-detected if not specified'),
    
    coreCode: z.string().optional()
      .describe('Core curriculum code (e.g., "QQ", "HST", "WCr", "WCd", "NS", "SCL")'),
    
    hasOpenSections: z.boolean().optional()
      .describe('If true, only return courses with at least one open section'),
    
    instructor: z.string().optional()
      .describe('Instructor name (partial match, case-insensitive)'),
    
    schoolCode: z.string().optional()
      .describe('School/offering unit code (e.g., "01" for SAS, "14" for Engineering)'),
    
    limit: z.number().min(1).max(100).default(25)
      .describe('Maximum results to return (1-100, default 25)'),
    
    offset: z.number().min(0).default(0)
      .describe('Pagination offset'),
  });

export const searchCoursesOutputSchema = z.object({
    courses: z.array(z.object({
      courseString: z.string(),
      title: z.string(),
      expandedTitle: z.string().nullable(),
      credits: z.number().nullable(),
      level: z.string(),
      subjectCode: z.string(),
      subjectName: z.string().nullable(),
      schoolCode: z.string().nullable(),
      schoolName: z.string().nullable(),
      openSections: z.number(),
      totalSections: z.number(),
      campus: z.string(),
      year: z.number(),
      term: z.string(),
      termName: z.string(),
      coreCodes: z.array(z.string()),
    })),
    totalCount: z.number(),
    hasMore: z.boolean(),
    searchContext: z.object({
      year: z.number(),
      term: z.string(),
      termName: z.string(),
      campus: z.string(),
    }),
  });

export type SearchCoursesInput = z.infer<typeof searchCoursesInputSchema>;
export type SearchCoursesOutput = z.infer<typeof searchCoursesOutputSchema>;

export async function runSearchCourses(
  context: SearchCoursesInput,
  deps: {
    supabaseClient?: typeof defaultSupabase;
    now?: () => Date;
  } = {},
): Promise<SearchCoursesOutput> {
  const supabase = deps.supabaseClient ?? defaultSupabase;
  const {
      query,
      subject,
      level,
      credits,
      creditsMin,
      creditsMax,
      campus = 'NB',
      includeOnline = true,
      year: inputYear,
      term: inputTerm,
      coreCode,
      hasOpenSections,
      instructor,
      schoolCode,
      limit = 25,
      offset = 0,
    } = context;

    // Auto-detect term if not provided
    const defaultTerm = getDefaultTerm(deps.now?.());
    const year = inputYear ?? defaultTerm.year;
    const term = inputTerm ?? defaultTerm.term;
    const termName = getTermName(term);

    try {
      // Build the campus filter values
      const campusFilters: string[] = [campus];
      if (includeOnline) {
        campusFilters.push(`ONLINE_${campus}`);
      }

      // Start with the v_course_search view
      let queryBuilder = supabase
        .from('v_course_search')
        .select('*', { count: 'exact' })
        .eq('year', year)
        .eq('term', term)
        .in('campus', campusFilters);

      // Apply optional filters
      if (subject) {
        queryBuilder = queryBuilder.eq('subject_code', subject);
      }

      if (level) {
        queryBuilder = queryBuilder.eq('level', level);
      }

      if (credits !== undefined) {
        queryBuilder = queryBuilder.eq('credits', credits);
      }

      if (creditsMin !== undefined) {
        queryBuilder = queryBuilder.gte('credits', creditsMin);
      }

      if (creditsMax !== undefined) {
        queryBuilder = queryBuilder.lte('credits', creditsMax);
      }

      if (hasOpenSections) {
        queryBuilder = queryBuilder.gt('open_sections', 0);
      }

      if (schoolCode) {
        queryBuilder = queryBuilder.eq('school_code', schoolCode);
      }

      if (query) {
        // Use ilike for title search (case-insensitive)
        queryBuilder = queryBuilder.ilike('title', `%${query}%`);
      }

      // Apply pagination and ordering
      queryBuilder = queryBuilder
        .order('subject_code')
        .order('course_string')
        .range(offset, offset + limit - 1);

      const { data: coursesData, error: coursesError, count } = await queryBuilder;

      if (coursesError) {
        throw new Error(`Failed to search courses: ${coursesError.message}`);
      }

      // If no courses found, return early
      if (!coursesData || coursesData.length === 0) {
        return {
          courses: [],
          totalCount: 0,
          hasMore: false,
          searchContext: { year, term, termName, campus },
        };
      }

      // Get course IDs for additional filtering
      const courseIds = coursesData.map(c => c.id).filter((id): id is number => id !== null);

      // Filter by core code if specified
      let filteredCourseIds = courseIds;
      if (coreCode && courseIds.length > 0) {
        const { data: coreCodeData, error: coreCodeError } = await supabase
          .from('course_core_codes')
          .select('course_id')
          .in('course_id', courseIds)
          .eq('core_code', coreCode);

        if (coreCodeError) {
          throw new Error(`Failed to filter by core code: ${coreCodeError.message}`);
        }

        filteredCourseIds = coreCodeData?.map(cc => cc.course_id) || [];
      }

      // Filter by instructor if specified
      if (instructor && filteredCourseIds.length > 0) {
        // Get sections for these courses
        const { data: sectionsData, error: sectionsError } = await supabase
          .from('sections')
          .select('course_id, id')
          .in('course_id', filteredCourseIds);

        if (sectionsError) {
          throw new Error(`Failed to get sections: ${sectionsError.message}`);
        }

        if (sectionsData && sectionsData.length > 0) {
          const sectionIds = sectionsData.map(s => s.id);

          // Get instructors for these sections
          const { data: instructorData, error: instructorError } = await supabase
            .from('section_instructors')
            .select('section_id, instructors!inner(name)')
            .in('section_id', sectionIds);

          if (instructorError) {
            throw new Error(`Failed to filter by instructor: ${instructorError.message}`);
          }

          // Filter sections that match instructor name
          const matchingSectionIds = new Set<number>();
          instructorData?.forEach((si: { section_id: number; instructors: { name: string } | null }) => {
            if (si.instructors?.name?.toLowerCase().includes(instructor.toLowerCase())) {
              matchingSectionIds.add(si.section_id);
            }
          });

          // Get course IDs from matching sections
          const matchingCourseIds = new Set<number>();
          sectionsData.forEach(s => {
            if (matchingSectionIds.has(s.id)) {
              matchingCourseIds.add(s.course_id);
            }
          });

          filteredCourseIds = filteredCourseIds.filter(id => matchingCourseIds.has(id));
        }
      }

      // Filter courses to only those matching all criteria
      const filteredCourses = coursesData.filter(c => 
        c.id !== null && filteredCourseIds.includes(c.id)
      );

      // Get core codes for filtered courses
      const { data: allCoreCodes, error: coreCodesError } = await supabase
        .from('course_core_codes')
        .select('course_id, core_code')
        .in('course_id', filteredCourseIds);

      if (coreCodesError) {
        throw new Error(`Failed to get core codes: ${coreCodesError.message}`);
      }

      // Group core codes by course
      const coreCodesByCourse = new Map<number, string[]>();
      allCoreCodes?.forEach(cc => {
        const existing = coreCodesByCourse.get(cc.course_id) || [];
        existing.push(cc.core_code);
        coreCodesByCourse.set(cc.course_id, existing);
      });

      // Get section counts for each course
      const { data: sectionCounts, error: sectionCountsError } = await supabase
        .from('sections')
        .select('course_id')
        .in('course_id', filteredCourseIds);

      if (sectionCountsError) {
        throw new Error(`Failed to get section counts: ${sectionCountsError.message}`);
      }

      // Count sections per course
      const totalSectionsByCourse = new Map<number, number>();
      sectionCounts?.forEach(s => {
        const current = totalSectionsByCourse.get(s.course_id) || 0;
        totalSectionsByCourse.set(s.course_id, current + 1);
      });

      // Transform to output format
      const courses = filteredCourses.map(course => ({
        courseString: course.course_string || '',
        title: course.title || '',
        expandedTitle: course.expanded_title,
        credits: course.credits,
        level: course.level || 'U',
        subjectCode: course.subject_code || '',
        subjectName: course.subject_name,
        schoolCode: course.school_code,
        schoolName: course.school_name,
        openSections: course.open_sections || 0,
        totalSections: totalSectionsByCourse.get(course.id!) || 0,
        campus: course.campus || campus,
        year: course.year || year,
        term: course.term || term,
        termName: course.term_name || termName,
        coreCodes: coreCodesByCourse.get(course.id!) || [],
      }));

      const totalCount = coreCode || instructor ? filteredCourses.length : (count || 0);
      const hasMore = offset + courses.length < totalCount;

      return {
        courses,
        totalCount,
        hasMore,
        searchContext: { year, term, termName, campus },
      };
    } catch (error) {
      throw new Error(`Failed to search courses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export const searchCourses = createTool({
  id: 'searchCourses',
  description: SEARCH_COURSES_DESCRIPTION,
  inputSchema: searchCoursesInputSchema,
  outputSchema: searchCoursesOutputSchema,
  execute: async ({ context }) => runSearchCourses(context),
});
