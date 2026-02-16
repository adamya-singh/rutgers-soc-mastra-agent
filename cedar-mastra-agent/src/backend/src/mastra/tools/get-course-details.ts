import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase as defaultSupabase } from '../../lib/supabase.js';
import {
  getDefaultTerm,
  getTermName,
  getLevelName,
  getSectionTypeName,
  getDayName,
  formatTime,
  isOnlineMeeting,
  parseCourseString,
} from '../../lib/utils.js';

/**
 * getCourseDetails - Get comprehensive details for a specific course
 * 
 * Returns full course info including all sections, meeting times,
 * instructors, and prerequisites.
 */
export const GET_COURSE_DETAILS_DESCRIPTION = `Get detailed information about a specific course including all sections, meeting times, instructors, and prerequisites.
Use this tool when you need complete course details, section availability, or meeting schedules.
Examples: "Tell me about CS 111", "What sections are available for Calc 1?", "Show details for 01:640:151"`;

export const getCourseDetailsInputSchema = z.object({
    courseString: z.string()
      .describe('Full course identifier (e.g., "01:198:111") OR subject:course format (e.g., "198:111")'),
    
    year: z.number().optional()
      .describe('Academic year. Auto-detected if not specified'),
    
    term: z.enum(['0', '1', '7', '9']).optional()
      .describe('Term code. Auto-detected if not specified'),
    
    campus: z.enum(['NB', 'NK', 'CM']).default('NB')
      .describe('Campus code'),
  });

export const getCourseDetailsOutputSchema = z.object({
    course: z.object({
      courseString: z.string(),
      title: z.string(),
      expandedTitle: z.string().nullable(),
      credits: z.number().nullable(),
      creditsDescription: z.string().nullable(),
      level: z.string(),
      levelName: z.string(),
      subject: z.object({
        code: z.string(),
        name: z.string().nullable(),
      }),
      school: z.object({
        code: z.string().nullable(),
        name: z.string().nullable(),
      }),
      description: z.string().nullable(),
      synopsisUrl: z.string().nullable(),
      courseNotes: z.string().nullable(),
      prereqNotes: z.string().nullable(),
      coreCodes: z.array(z.object({
        code: z.string(),
        description: z.string().nullable(),
      })),
      campusLocations: z.array(z.object({
        code: z.string(),
        name: z.string().nullable(),
      })),
      openSections: z.number(),
      totalSections: z.number(),
    }),
    sections: z.array(z.object({
      indexNumber: z.string(),
      sectionNumber: z.string(),
      isOpen: z.boolean(),
      statusText: z.string(),
      instructors: z.array(z.string()),
      meetingTimes: z.array(z.object({
        day: z.string(),
        dayName: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        startTimeMilitary: z.string().nullable(),
        endTimeMilitary: z.string().nullable(),
        building: z.string().nullable(),
        room: z.string().nullable(),
        campus: z.string().nullable(),
        mode: z.string().nullable(),
        isOnline: z.boolean(),
      })),
      sectionType: z.string().nullable(),
      sectionTypeName: z.string(),
      examCode: z.string().nullable(),
      finalExam: z.string().nullable(),
      eligibility: z.string().nullable(),
      specialPermission: z.string().nullable(),
      comments: z.array(z.string()),
      sessionDates: z.string().nullable(),
    })),
    term: z.object({
      year: z.number(),
      term: z.string(),
      termName: z.string(),
      campus: z.string(),
    }),
  });

export type GetCourseDetailsInput = z.infer<typeof getCourseDetailsInputSchema>;
export type GetCourseDetailsOutput = z.infer<typeof getCourseDetailsOutputSchema>;

export async function runGetCourseDetails(
  context: GetCourseDetailsInput,
  deps: {
    supabaseClient?: typeof defaultSupabase;
    now?: () => Date;
  } = {},
): Promise<GetCourseDetailsOutput> {
  const supabase = deps.supabaseClient ?? defaultSupabase;
  const {
      courseString,
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
      // Build campus filter (include online variant)
      const campusFilters = [campus, `ONLINE_${campus}`];

      // First, find the term ID
      const { data: termData, error: termError } = await supabase
        .from('terms')
        .select('id')
        .eq('year', year)
        .eq('term', term)
        .in('campus', campusFilters)
        .limit(1)
        .single();

      if (termError && termError.code !== 'PGRST116') {
        throw new Error(`Failed to find term: ${termError.message}`);
      }

      // Get the course with a pattern match on course_string
      let courseQuery = supabase
        .from('courses')
        .select(`
          *,
          schools (code, description),
          subjects (code, description)
        `)
        .eq('year', year)
        .in('main_campus', campusFilters);

      // Handle both full (01:198:111) and short (198:111) formats
      if (parsed.unitCode) {
        courseQuery = courseQuery.eq('course_string', courseString);
      } else {
        // For short format, match on subject_code and course_number
        courseQuery = courseQuery
          .eq('subject_code', parsed.subjectCode)
          .eq('course_number', parsed.courseNumber);
      }

      // Join with terms to filter by year/term
      const { data: courseData, error: courseError } = await supabase
        .from('v_course_search')
        .select('*')
        .eq('year', year)
        .eq('term', term)
        .in('campus', campusFilters)
        .ilike('course_string', parsed.unitCode 
          ? courseString 
          : `%:${parsed.subjectCode}:${parsed.courseNumber}`)
        .limit(1)
        .single();

      if (courseError) {
        if (courseError.code === 'PGRST116') {
          throw new Error(`Course ${courseString} not found for ${termName} ${year}`);
        }
        throw new Error(`Failed to get course: ${courseError.message}`);
      }

      if (!courseData || !courseData.id) {
        throw new Error(`Course ${courseString} not found for ${termName} ${year}`);
      }

      const courseId = courseData.id;

      // Get full course details from courses table
      const { data: fullCourse, error: fullCourseError } = await supabase
        .from('courses')
        .select(`
          *,
          schools (code, description),
          subjects (code, description)
        `)
        .eq('id', courseId)
        .single();

      if (fullCourseError) {
        throw new Error(`Failed to get course details: ${fullCourseError.message}`);
      }

      // Get core codes
      const { data: coreCodes, error: coreCodesError } = await supabase
        .from('course_core_codes')
        .select('core_code, core_code_description')
        .eq('course_id', courseId);

      if (coreCodesError) {
        throw new Error(`Failed to get core codes: ${coreCodesError.message}`);
      }

      // Get campus locations
      const { data: campusLocations, error: campusLocationsError } = await supabase
        .from('course_campus_locations')
        .select('code, description')
        .eq('course_id', courseId);

      if (campusLocationsError) {
        throw new Error(`Failed to get campus locations: ${campusLocationsError.message}`);
      }

      // Get all sections for this course
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select('*')
        .eq('course_id', courseId)
        .order('section_number');

      if (sectionsError) {
        throw new Error(`Failed to get sections: ${sectionsError.message}`);
      }

      const sections = sectionsData || [];
      const sectionIds = sections.map(s => s.id);

      // Get instructors for all sections
      const instructorsBySectionId = new Map<number, string[]>();
      if (sectionIds.length > 0) {
        const { data: sectionInstructors, error: instructorsError } = await supabase
          .from('section_instructors')
          .select('section_id, instructor_id, instructors(name)')
          .in('section_id', sectionIds);

        if (instructorsError) {
          throw new Error(`Failed to get instructors: ${instructorsError.message}`);
        }

        sectionInstructors?.forEach((si: { section_id: number; instructors: { name: string } | null }) => {
          const existing = instructorsBySectionId.get(si.section_id) || [];
          if (si.instructors?.name) {
            existing.push(si.instructors.name);
          }
          instructorsBySectionId.set(si.section_id, existing);
        });
      }

      // Get meeting times for all sections
      const meetingTimesBySectionId = new Map<number, typeof meetingTimesData>();
      let meetingTimesData: Array<{
        section_id: number;
        meeting_day: string | null;
        start_time_military: string | null;
        end_time_military: string | null;
        building_code: string | null;
        room_number: string | null;
        campus_name: string | null;
        meeting_mode_desc: string | null;
        meeting_mode_code: string | null;
      }> = [];

      if (sectionIds.length > 0) {
        const { data: mtData, error: meetingTimesError } = await supabase
          .from('meeting_times')
          .select('*')
          .in('section_id', sectionIds);

        if (meetingTimesError) {
          throw new Error(`Failed to get meeting times: ${meetingTimesError.message}`);
        }

        meetingTimesData = mtData || [];
        meetingTimesData.forEach(mt => {
          const existing = meetingTimesBySectionId.get(mt.section_id) || [];
          existing.push(mt);
          meetingTimesBySectionId.set(mt.section_id, existing);
        });
      }

      // Get comments for all sections
      const commentsBySectionId = new Map<number, string[]>();
      if (sectionIds.length > 0) {
        const { data: commentsData, error: commentsError } = await supabase
          .from('section_comments')
          .select('section_id, description')
          .in('section_id', sectionIds);

        if (commentsError) {
          throw new Error(`Failed to get comments: ${commentsError.message}`);
        }

        commentsData?.forEach(c => {
          const existing = commentsBySectionId.get(c.section_id) || [];
          existing.push(c.description);
          commentsBySectionId.set(c.section_id, existing);
        });
      }

      // Transform sections to output format
      const formattedSections = sections.map(section => {
        const meetingTimes = meetingTimesBySectionId.get(section.id) || [];
        
        return {
          indexNumber: section.index_number,
          sectionNumber: section.section_number,
          isOpen: section.open_status,
          statusText: section.open_status ? 'OPEN' : 'CLOSED',
          instructors: instructorsBySectionId.get(section.id) || [],
          meetingTimes: meetingTimes.map(mt => ({
            day: mt.meeting_day || '',
            dayName: getDayName(mt.meeting_day),
            startTime: formatTime(mt.start_time_military),
            endTime: formatTime(mt.end_time_military),
            startTimeMilitary: mt.start_time_military,
            endTimeMilitary: mt.end_time_military,
            building: mt.building_code,
            room: mt.room_number,
            campus: mt.campus_name,
            mode: mt.meeting_mode_desc,
            isOnline: isOnlineMeeting(mt.meeting_mode_code),
          })),
          sectionType: section.section_course_type,
          sectionTypeName: getSectionTypeName(section.section_course_type),
          examCode: section.exam_code,
          finalExam: section.final_exam,
          eligibility: section.section_eligibility,
          specialPermission: section.special_permission_add_description,
          comments: commentsBySectionId.get(section.id) || [],
          sessionDates: section.session_dates,
        };
      });

      // Build the course output
      const schoolData = fullCourse.schools as { code: string; description: string } | null;
      const subjectData = fullCourse.subjects as { code: string; description: string } | null;

      return {
        course: {
          courseString: fullCourse.course_string,
          title: fullCourse.title,
          expandedTitle: fullCourse.expanded_title,
          credits: fullCourse.credits,
          creditsDescription: fullCourse.credits_description,
          level: fullCourse.level,
          levelName: getLevelName(fullCourse.level),
          subject: {
            code: fullCourse.subject_code,
            name: subjectData?.description || null,
          },
          school: {
            code: schoolData?.code || null,
            name: schoolData?.description || null,
          },
          description: fullCourse.course_description,
          synopsisUrl: fullCourse.synopsis_url,
          courseNotes: fullCourse.course_notes,
          prereqNotes: fullCourse.prereq_notes,
          coreCodes: (coreCodes || []).map(cc => ({
            code: cc.core_code,
            description: cc.core_code_description,
          })),
          campusLocations: (campusLocations || []).map(cl => ({
            code: cl.code,
            name: cl.description,
          })),
          openSections: fullCourse.open_sections || 0,
          totalSections: sections.length,
        },
        sections: formattedSections,
        term: {
          year,
          term,
          termName,
          campus,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to get course details: Unknown error`);
    }
}

export const getCourseDetails = createTool({
  id: 'getCourseDetails',
  description: GET_COURSE_DETAILS_DESCRIPTION,
  inputSchema: getCourseDetailsInputSchema,
  outputSchema: getCourseDetailsOutputSchema,
  execute: async ({ context }) => runGetCourseDetails(context),
});
