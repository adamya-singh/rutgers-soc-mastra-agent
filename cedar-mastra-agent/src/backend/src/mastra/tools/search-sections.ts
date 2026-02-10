import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import {
  getDefaultTerm,
  getDayName,
  formatTime,
  isOnlineMeeting,
  formatLocation,
  normalizeLocationToken,
  parseClassroomCode,
} from '../../lib/utils.js';

/**
 * searchSections - Find sections based on schedule criteria
 * 
 * Search for sections by day, time, instructor, or availability.
 * Useful for building schedules around constraints.
 */
export const searchSections = createTool({
  id: 'searchSections',
  description: `Find course sections based on schedule criteria like day, time, instructor, or availability.
Use this tool to find sections that fit specific schedule requirements.
Set openOnly=false to include CLOSED sections.
Examples: "Find open sections on Monday and Wednesday", "Evening classes after 5 PM", "Online sections for CS courses", "Include closed sections for 01:198:111", "Classes in LSH-B116"`,
  inputSchema: z.object({
    courseString: z.string().optional()
      .describe('Limit to specific course (e.g., "01:198:111")'),
    
    subject: z.string().optional()
      .describe('Limit to subject code (e.g., "198")'),
    
    openOnly: z.boolean().default(true)
      .describe('Only return sections with open enrollment'),
    
    instructor: z.string().optional()
      .describe('Filter by instructor name (partial match)'),

    classroomCode: z.string().optional()
      .describe('Classroom code (e.g., "LSH-B116", "LSH B116", "LSHB116")'),

    buildingCode: z.string().optional()
      .describe('Building code override (e.g., "LSH")'),

    roomNumber: z.string().optional()
      .describe('Room number override (e.g., "B116")'),
    
    days: z.array(z.enum(['M', 'T', 'W', 'H', 'F', 'S', 'U'])).optional()
      .describe('Filter by meeting days (M=Mon, T=Tue, W=Wed, H=Thu, F=Fri, S=Sat, U=Sun)'),
    
    timeAfter: z.string().optional()
      .describe('Sections starting at or after this time (24hr format: "0900", "1400")'),
    
    timeBefore: z.string().optional()
      .describe('Sections ending at or before this time (24hr format: "1700", "2100")'),
    
    online: z.boolean().optional()
      .describe('If true, only online sections. If false, only in-person.'),
    
    campus: z.enum(['NB', 'NK', 'CM']).default('NB'),
    
    includeOnline: z.boolean().default(true)
      .describe('Include ONLINE_{campus} results (e.g., ONLINE_NB). Defaults to true'),
    
    year: z.number().optional(),
    term: z.enum(['0', '1', '7', '9']).optional(),
    
    limit: z.number().min(1).max(100).default(25),
    offset: z.number().min(0).default(0),
  }).superRefine((input, ctx) => {
    if (!input.classroomCode) {
      return;
    }

    if (!parseClassroomCode(input.classroomCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classroomCode'],
        message: 'Invalid classroom format. Expected examples: LSH-B116, LSH 116, LSH116',
      });
    }
  }),
  outputSchema: z.object({
    sections: z.array(z.object({
      indexNumber: z.string(),
      sectionNumber: z.string(),
      course: z.object({
        courseString: z.string(),
        title: z.string(),
        credits: z.number().nullable(),
        subjectCode: z.string().nullable(),
      }),
      isOpen: z.boolean(),
      instructors: z.array(z.string()),
      meetingTimes: z.array(z.object({
        day: z.string(),
        dayName: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        location: z.string(),
        mode: z.string().nullable(),
      })),
      sectionType: z.string().nullable(),
      isOnline: z.boolean(),
      sessionDates: z.string().nullable(),
    })),
    totalCount: z.number(),
    hasMore: z.boolean(),
  }),
  execute: async ({ context }) => {
    const {
      courseString,
      subject,
      openOnly = true,
      instructor,
      classroomCode,
      buildingCode,
      roomNumber,
      days,
      timeAfter,
      timeBefore,
      online,
      campus = 'NB',
      includeOnline = true,
      year: inputYear,
      term: inputTerm,
      limit = 25,
      offset = 0,
    } = context;

    // Auto-detect term if not provided
    const defaultTerm = getDefaultTerm();
    const year = inputYear ?? defaultTerm.year;
    const term = inputTerm ?? defaultTerm.term;

    try {
      const hasLocationFilterInput = classroomCode !== undefined || buildingCode !== undefined || roomNumber !== undefined;
      const parsedClassroom = classroomCode ? parseClassroomCode(classroomCode) : null;
      const resolvedBuildingNorm = normalizeLocationToken(buildingCode || parsedClassroom?.buildingCodeNorm || '');
      const resolvedRoomNorm = normalizeLocationToken(roomNumber || parsedClassroom?.roomNumberNorm || '');

      if (hasLocationFilterInput && !resolvedBuildingNorm && !resolvedRoomNorm) {
        throw new Error('Invalid classroom format. Expected examples: LSH-B116, LSH 116, LSH116');
      }

      // Build campus filter
      const campusFilters: string[] = [campus];
      if (includeOnline) {
        campusFilters.push(`ONLINE_${campus}`);
      }

      // Use the v_schedule_builder view for initial query
      let query = supabase
        .from('v_schedule_builder')
        .select('*')
        .eq('year', year)
        .eq('term', term)
        .in('term_campus', campusFilters);

      // Apply filters
      if (courseString) {
        query = query.eq('course_string', courseString);
      }

      if (resolvedBuildingNorm) {
        query = query.eq('building_code_norm', resolvedBuildingNorm);
      }

      if (resolvedRoomNorm) {
        query = query.eq('room_number_norm', resolvedRoomNorm);
      }

      if (openOnly) {
        query = query.eq('open_status', true);
      }

      // Apply day filter
      if (days && days.length > 0) {
        query = query.in('meeting_day', days);
      }

      // Apply time filters
      if (timeAfter) {
        query = query.gte('start_time_military', timeAfter);
      }

      if (timeBefore) {
        query = query.lte('end_time_military', timeBefore);
      }

      // Get initial results
      const { data: scheduleData, error: scheduleError } = await query;

      if (scheduleError) {
        throw new Error(`Failed to search sections: ${scheduleError.message}`);
      }

      if (!scheduleData || scheduleData.length === 0) {
        return {
          sections: [],
          totalCount: 0,
          hasMore: false,
        };
      }

      // Get unique section IDs
      const uniqueSectionIds = [...new Set(scheduleData.map(s => s.section_id).filter((id): id is number => id !== null))];

      // Filter by subject if specified
      let filteredSectionIds = uniqueSectionIds;
      if (subject) {
        const sectionsWithSubject = scheduleData.filter(s => 
          s.course_string && s.course_string.includes(`:${subject}:`)
        );
        filteredSectionIds = [...new Set(sectionsWithSubject.map(s => s.section_id).filter((id): id is number => id !== null))];
      }

      // Filter by online status if specified
      if (online !== undefined && filteredSectionIds.length > 0) {
        const { data: meetingData, error: meetingError } = await supabase
          .from('meeting_times')
          .select('section_id, meeting_mode_code')
          .in('section_id', filteredSectionIds);

        if (meetingError) {
          throw new Error(`Failed to filter by online status: ${meetingError.message}`);
        }

        const onlineSectionIds = new Set<number>();
        const inPersonSectionIds = new Set<number>();
        
        meetingData?.forEach(m => {
          if (isOnlineMeeting(m.meeting_mode_code)) {
            onlineSectionIds.add(m.section_id);
          } else {
            inPersonSectionIds.add(m.section_id);
          }
        });

        if (online) {
          filteredSectionIds = filteredSectionIds.filter(id => onlineSectionIds.has(id));
        } else {
          filteredSectionIds = filteredSectionIds.filter(id => inPersonSectionIds.has(id));
        }
      }

      // Filter by instructor if specified
      if (instructor && filteredSectionIds.length > 0) {
        const { data: instructorData, error: instructorError } = await supabase
          .from('section_instructors')
          .select('section_id, instructors!inner(name)')
          .in('section_id', filteredSectionIds);

        if (instructorError) {
          throw new Error(`Failed to filter by instructor: ${instructorError.message}`);
        }

        const matchingSectionIds = new Set<number>();
        instructorData?.forEach((si: { section_id: number; instructors: { name: string } | null }) => {
          if (si.instructors?.name?.toLowerCase().includes(instructor.toLowerCase())) {
            matchingSectionIds.add(si.section_id);
          }
        });

        filteredSectionIds = filteredSectionIds.filter(id => matchingSectionIds.has(id));
      }

      // Apply pagination
      const paginatedSectionIds = filteredSectionIds.slice(offset, offset + limit);

      if (paginatedSectionIds.length === 0) {
        return {
          sections: [],
          totalCount: filteredSectionIds.length,
          hasMore: false,
        };
      }

      // Get full section details
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select(`
          id,
          index_number,
          section_number,
          open_status,
          section_course_type,
          session_dates,
          courses!inner (
            course_string,
            title,
            credits,
            subject_code
          )
        `)
        .in('id', paginatedSectionIds);

      if (sectionsError) {
        throw new Error(`Failed to get section details: ${sectionsError.message}`);
      }

      // Get instructors for sections
      const { data: instructorsData, error: instructorsDataError } = await supabase
        .from('section_instructors')
        .select('section_id, instructors(name)')
        .in('section_id', paginatedSectionIds);

      if (instructorsDataError) {
        throw new Error(`Failed to get instructors: ${instructorsDataError.message}`);
      }

      const instructorsBySectionId = new Map<number, string[]>();
      instructorsData?.forEach((si: { section_id: number; instructors: { name: string } | null }) => {
        const existing = instructorsBySectionId.get(si.section_id) || [];
        if (si.instructors?.name) {
          existing.push(si.instructors.name);
        }
        instructorsBySectionId.set(si.section_id, existing);
      });

      // Get meeting times for sections
      const { data: meetingTimesData, error: meetingTimesError } = await supabase
        .from('meeting_times')
        .select('*')
        .in('section_id', paginatedSectionIds);

      if (meetingTimesError) {
        throw new Error(`Failed to get meeting times: ${meetingTimesError.message}`);
      }

      const meetingTimesBySectionId = new Map<number, typeof meetingTimesData>();
      meetingTimesData?.forEach(mt => {
        const existing = meetingTimesBySectionId.get(mt.section_id) || [];
        existing.push(mt);
        meetingTimesBySectionId.set(mt.section_id, existing);
      });

      // Transform to output format
      const sections = (sectionsData || []).map(section => {
        const course = section.courses as {
          course_string: string;
          title: string;
          credits: number | null;
          subject_code: string;
        };
        const meetingTimes = meetingTimesBySectionId.get(section.id) || [];
        const hasOnlineMeetings = meetingTimes.some(mt => isOnlineMeeting(mt.meeting_mode_code));

        return {
          indexNumber: section.index_number,
          sectionNumber: section.section_number,
          course: {
            courseString: course.course_string,
            title: course.title,
            credits: course.credits,
            subjectCode: course.subject_code,
          },
          isOpen: section.open_status,
          instructors: instructorsBySectionId.get(section.id) || [],
          meetingTimes: meetingTimes.map(mt => ({
            day: mt.meeting_day || '',
            dayName: getDayName(mt.meeting_day),
            startTime: formatTime(mt.start_time_military),
            endTime: formatTime(mt.end_time_military),
            location: formatLocation(mt.building_code, mt.room_number, mt.campus_name),
            mode: mt.meeting_mode_desc,
          })),
          sectionType: section.section_course_type,
          isOnline: hasOnlineMeetings,
          sessionDates: section.session_dates,
        };
      });

      return {
        sections,
        totalCount: filteredSectionIds.length,
        hasMore: offset + sections.length < filteredSectionIds.length,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to search sections: Unknown error`);
    }
  },
});
