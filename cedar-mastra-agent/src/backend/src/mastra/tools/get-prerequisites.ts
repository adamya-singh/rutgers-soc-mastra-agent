import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase as defaultSupabase } from '../../lib/supabase.js';
import { getDefaultTerm, getTermName, parseCourseString } from '../../lib/utils.js';

/**
 * getPrerequisites - Analyze prerequisite requirements for a course
 * 
 * Returns both what courses are required for this course and
 * what courses this course unlocks (reverse lookup).
 */
export const GET_PREREQUISITES_DESCRIPTION = `Get prerequisite information for a course - what courses are required and what courses it unlocks.
Use this tool to understand course sequences and requirements.
Examples: "What are the prerequisites for CS 211?", "What can I take after Calc 1?", "Show me the prereq chain for Data Structures"`;

export const getPrerequisitesInputSchema = z.object({
    courseString: z.string()
      .describe('Course to analyze (e.g., "01:198:211")'),
    
    includeUnlocks: z.boolean().default(true)
      .describe('Also return courses that require this course as a prerequisite'),
    
    year: z.number().optional(),
    term: z.enum(['0', '1', '7', '9']).optional(),
    campus: z.enum(['NB', 'NK', 'CM']).default('NB'),
  });

export const getPrerequisitesOutputSchema = z.object({
    course: z.object({
      courseString: z.string(),
      title: z.string(),
    }),
    prerequisites: z.array(z.object({
      courseString: z.string(),
      title: z.string().nullable(),
      logicGroup: z.number(),
      isOr: z.boolean(),
      existsInDatabase: z.boolean(),
    })),
    prereqNotes: z.string().nullable(),
    prereqSummary: z.string(),
    unlocks: z.array(z.object({
      courseString: z.string(),
      title: z.string(),
    })).optional(),
  });

export type GetPrerequisitesInput = z.infer<typeof getPrerequisitesInputSchema>;
export type GetPrerequisitesOutput = z.infer<typeof getPrerequisitesOutputSchema>;

export async function runGetPrerequisites(
  context: GetPrerequisitesInput,
  deps: {
    supabaseClient?: typeof defaultSupabase;
    now?: () => Date;
  } = {},
): Promise<GetPrerequisitesOutput> {
  const supabase = deps.supabaseClient ?? defaultSupabase;
    const {
      courseString,
      includeUnlocks = true,
      year: inputYear,
      term: inputTerm,
      campus = 'NB',
    } = context;

    // Validate course string format
    const parsed = parseCourseString(courseString);
    if (!parsed) {
      throw new Error(`Invalid course format. Use XX:XXX:XXX (e.g., 01:198:111) or XXX:XXX (e.g., 198:111)`);
    }

    // Auto-detect term if not provided
    const defaultTerm = getDefaultTerm(deps.now?.());
    const year = inputYear ?? defaultTerm.year;
    const term = inputTerm ?? defaultTerm.term;
    const termName = getTermName(term);

    try {
      // Build campus filter
      const campusFilters = [campus, `ONLINE_${campus}`];

      // Find the course
      let courseQuery = supabase
        .from('v_course_search')
        .select('id, course_string, title, prereq_notes')
        .eq('year', year)
        .eq('term', term)
        .in('campus', campusFilters);

      // Handle both full (01:198:111) and short (198:111) formats
      if (parsed.unitCode) {
        courseQuery = courseQuery.eq('course_string', courseString);
      } else {
        courseQuery = courseQuery.ilike('course_string', `%:${parsed.subjectCode}:${parsed.courseNumber}`);
      }

      const { data: courseData, error: courseError } = await courseQuery.limit(1).single();

      if (courseError) {
        if (courseError.code === 'PGRST116') {
          throw new Error(`Course ${courseString} not found for ${termName} ${year}`);
        }
        throw new Error(`Failed to get course: ${courseError.message}`);
      }

      if (!courseData || !courseData.id) {
        throw new Error(`Course ${courseString} not found for ${termName} ${year}`);
      }

      // Get prerequisites for this course
      const { data: prereqsData, error: prereqsError } = await supabase
        .from('prerequisites')
        .select('*')
        .eq('course_id', courseData.id)
        .order('logic_group')
        .order('id');

      if (prereqsError) {
        throw new Error(`Failed to get prerequisites: ${prereqsError.message}`);
      }

      // Check which prerequisite courses exist in the database
      const prereqCourseStrings = prereqsData?.map(p => p.required_course_string) || [];
      const existingCourses = new Set<string>();

      if (prereqCourseStrings.length > 0) {
        const { data: existingData, error: existingError } = await supabase
          .from('v_course_search')
          .select('course_string')
          .eq('year', year)
          .eq('term', term)
          .in('campus', campusFilters)
          .in('course_string', prereqCourseStrings);

        if (existingError) {
          // Non-fatal, just log
          console.warn(`Failed to check existing courses: ${existingError.message}`);
        } else {
          existingData?.forEach(c => {
            if (c.course_string) {
              existingCourses.add(c.course_string);
            }
          });
        }
      }

      // Format prerequisites
      const prerequisites = (prereqsData || []).map(p => ({
        courseString: p.required_course_string,
        title: p.required_course_title,
        logicGroup: p.logic_group,
        isOr: p.is_or || false,
        existsInDatabase: existingCourses.has(p.required_course_string),
      }));

      // Generate human-readable summary
      const prereqSummary = generatePrereqSummary(prerequisites.map(p => ({
        ...p,
        title: p.title || '',
      })));

      // Get courses that this course unlocks (courses that have this as a prerequisite)
      let unlocks: Array<{ courseString: string; title: string }> | undefined;

      if (includeUnlocks && courseData.course_string) {
        const actualCourseString = courseData.course_string;
        
        // Find courses where this course is a prerequisite
        const { data: unlocksData, error: unlocksError } = await supabase
          .from('prerequisites')
          .select('course_id')
          .eq('required_course_string', actualCourseString);

        if (unlocksError) {
          // Non-fatal
          console.warn(`Failed to get unlocks: ${unlocksError.message}`);
        } else if (unlocksData && unlocksData.length > 0) {
          const unlockCourseIds = [...new Set(unlocksData.map(u => u.course_id))];
          
          // Get course details
          const { data: unlockCoursesData, error: unlockCoursesError } = await supabase
            .from('v_course_search')
            .select('course_string, title')
            .eq('year', year)
            .eq('term', term)
            .in('campus', campusFilters)
            .in('id', unlockCourseIds);

          if (unlockCoursesError) {
            console.warn(`Failed to get unlock course details: ${unlockCoursesError.message}`);
          } else {
            unlocks = (unlockCoursesData || []).map(c => ({
              courseString: c.course_string || '',
              title: c.title || '',
            }));
          }
        } else {
          unlocks = [];
        }
      }

      return {
        course: {
          courseString: courseData.course_string || courseString,
          title: courseData.title || '',
        },
        prerequisites,
        prereqNotes: courseData.prereq_notes,
        prereqSummary,
        unlocks,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to get prerequisites: Unknown error`);
    }
}

export const getPrerequisites = createTool({
  id: 'getPrerequisites',
  description: GET_PREREQUISITES_DESCRIPTION,
  inputSchema: getPrerequisitesInputSchema,
  outputSchema: getPrerequisitesOutputSchema,
  execute: async ({ context }) => runGetPrerequisites(context),
});

/**
 * Generate a human-readable summary of prerequisites
 */
function generatePrereqSummary(
  prerequisites: Array<{
    courseString: string;
    title: string;
    logicGroup: number;
    isOr: boolean;
  }>
): string {
  if (prerequisites.length === 0) {
    return 'No prerequisites required';
  }

  // Group by logic group
  const groups = new Map<number, typeof prerequisites>();
  prerequisites.forEach(p => {
    const existing = groups.get(p.logicGroup) || [];
    existing.push(p);
    groups.set(p.logicGroup, existing);
  });

  // Format each group
  const groupStrings: string[] = [];
  groups.forEach((groupPrereqs) => {
    if (groupPrereqs.length === 1) {
      const p = groupPrereqs[0];
      const name = p.title || p.courseString;
      groupStrings.push(`${name} (${p.courseString})`);
    } else {
      // Multiple items in group - check if OR relationship
      const hasOr = groupPrereqs.some(p => p.isOr);
      const connector = hasOr ? ' OR ' : ' AND ';
      const items = groupPrereqs.map(p => {
        const name = p.title || p.courseString;
        return `${name} (${p.courseString})`;
      });
      
      if (hasOr) {
        groupStrings.push(`(${items.join(connector)})`);
      } else {
        groupStrings.push(items.join(connector));
      }
    }
  });

  if (groupStrings.length === 1) {
    return `Requires ${groupStrings[0]}`;
  }

  return `Requires ${groupStrings.join(' AND ')}`;
}
