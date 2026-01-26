import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import {
  getDefaultTerm,
  getTermName,
  getSectionTypeName,
  getDayName,
  formatTime,
  isOnlineMeeting,
  isValidIndexNumber,
} from '../../lib/utils.js';

/**
 * getSectionByIndex - Direct lookup of a specific section by registration index
 * 
 * Returns full section details including course info, meeting times, instructors.
 */
export const getSectionByIndex = createTool({
  id: 'getSectionByIndex',
  description: `Get details for a specific section by its 5-digit registration index number.
Use this tool when you have a section index and need its full details.
Examples: "Get details for section 09214", "Is index 12345 open?", "When does section 09214 meet?"`,
  inputSchema: z.object({
    indexNumber: z.string()
      .describe('5-digit registration index number (e.g., "09214"). Must be exactly 5 digits including leading zeros.'),
    
    year: z.number().optional()
      .describe('Academic year. Auto-detected if not specified'),
    
    term: z.enum(['0', '1', '7', '9']).optional()
      .describe('Term code. Auto-detected if not specified'),
  }),
  outputSchema: z.object({
    section: z.object({
      indexNumber: z.string(),
      sectionNumber: z.string(),
      isOpen: z.boolean(),
      statusText: z.string(),
      course: z.object({
        courseString: z.string(),
        title: z.string(),
        expandedTitle: z.string().nullable(),
        credits: z.number().nullable(),
        subjectCode: z.string(),
        subjectName: z.string().nullable(),
      }),
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
    }),
    term: z.object({
      year: z.number(),
      term: z.string(),
      termName: z.string(),
      campus: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const { indexNumber, year: inputYear, term: inputTerm } = context;

    // Validate index number format
    if (!isValidIndexNumber(indexNumber)) {
      throw new Error(`Index must be exactly 5 digits (e.g., '09214'). Received: '${indexNumber}'`);
    }

    // Auto-detect term if not provided
    const defaultTerm = getDefaultTerm();
    const year = inputYear ?? defaultTerm.year;
    const term = inputTerm ?? defaultTerm.term;
    const termName = getTermName(term);

    try {
      // First, try to find the section in the specified term
      let query = supabase
        .from('sections')
        .select(`
          *,
          courses!inner (
            *,
            subjects (code, description),
            terms!inner (year, term, term_name, campus)
          )
        `)
        .eq('index_number', indexNumber);

      // If year/term specified, filter by them
      if (inputYear || inputTerm) {
        query = query
          .eq('courses.terms.year', year)
          .eq('courses.terms.term', term);
      }

      const { data: sectionsData, error: sectionsError } = await query;

      if (sectionsError) {
        throw new Error(`Failed to get section: ${sectionsError.message}`);
      }

      if (!sectionsData || sectionsData.length === 0) {
        throw new Error(`Section with index ${indexNumber} not found`);
      }

      // If multiple sections found (different terms), use the most recent one
      let section = sectionsData[0];
      if (sectionsData.length > 1) {
        // Sort by year and term to get most recent
        sectionsData.sort((a, b) => {
          const courseA = a.courses as { terms: { year: number; term: string } };
          const courseB = b.courses as { terms: { year: number; term: string } };
          const yearDiff = courseB.terms.year - courseA.terms.year;
          if (yearDiff !== 0) return yearDiff;
          return parseInt(courseB.terms.term) - parseInt(courseA.terms.term);
        });
        section = sectionsData[0];
      }

      const course = section.courses as {
        course_string: string;
        title: string;
        expanded_title: string | null;
        credits: number | null;
        subject_code: string;
        subjects: { code: string; description: string } | null;
        terms: { year: number; term: string; term_name: string; campus: string };
      };

      // Get instructors for this section
      const { data: instructorsData, error: instructorsError } = await supabase
        .from('section_instructors')
        .select('instructors(name)')
        .eq('section_id', section.id);

      if (instructorsError) {
        throw new Error(`Failed to get instructors: ${instructorsError.message}`);
      }

      const instructors: string[] = [];
      instructorsData?.forEach((si: { instructors: { name: string } | null }) => {
        if (si.instructors?.name) {
          instructors.push(si.instructors.name);
        }
      });

      // Get meeting times
      const { data: meetingTimesData, error: meetingTimesError } = await supabase
        .from('meeting_times')
        .select('*')
        .eq('section_id', section.id);

      if (meetingTimesError) {
        throw new Error(`Failed to get meeting times: ${meetingTimesError.message}`);
      }

      // Get comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('section_comments')
        .select('description')
        .eq('section_id', section.id);

      if (commentsError) {
        throw new Error(`Failed to get comments: ${commentsError.message}`);
      }

      const comments = commentsData?.map(c => c.description) || [];

      // Format meeting times
      const meetingTimes = (meetingTimesData || []).map(mt => ({
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
      }));

      return {
        section: {
          indexNumber: section.index_number,
          sectionNumber: section.section_number,
          isOpen: section.open_status,
          statusText: section.open_status ? 'OPEN' : 'CLOSED',
          course: {
            courseString: course.course_string,
            title: course.title,
            expandedTitle: course.expanded_title,
            credits: course.credits,
            subjectCode: course.subject_code,
            subjectName: course.subjects?.description || null,
          },
          instructors,
          meetingTimes,
          sectionType: section.section_course_type,
          sectionTypeName: getSectionTypeName(section.section_course_type),
          examCode: section.exam_code,
          finalExam: section.final_exam,
          eligibility: section.section_eligibility,
          specialPermission: section.special_permission_add_description,
          comments,
          sessionDates: section.session_dates,
        },
        term: {
          year: course.terms.year,
          term: course.terms.term,
          termName: course.terms.term_name || getTermName(course.terms.term),
          campus: course.terms.campus,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to get section by index: Unknown error`);
    }
  },
});
