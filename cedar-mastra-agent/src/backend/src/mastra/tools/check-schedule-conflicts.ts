import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase as defaultSupabase } from '../../lib/supabase.js';
import {
  getDefaultTerm,
  getTermName,
  getDayName,
  formatTime,
  timesOverlap,
  calculateOverlapRange,
  isValidIndexNumber,
  formatLocation,
} from '../../lib/utils.js';

/**
 * checkScheduleConflicts - Detect time conflicts between multiple sections
 * 
 * Analyzes a set of sections to find any overlapping meeting times.
 * Essential for schedule building.
 */
export const CHECK_SCHEDULE_CONFLICTS_DESCRIPTION = `Check if multiple sections have time conflicts. 
Use this tool to validate a schedule or find if classes overlap.
Examples: "Do sections 09214 and 12345 conflict?", "Can I take all of these classes together?"`;

export const checkScheduleConflictsInputSchema = z.object({
    sectionIndices: z.array(z.string()).min(2).max(10)
      .describe('Array of section index numbers to check for conflicts (2-10 sections)'),
    
    year: z.number().optional()
      .describe('Academic year. Auto-detected if not specified'),
    
    term: z.enum(['0', '1', '7', '9']).optional()
      .describe('Term code. Auto-detected if not specified'),
    
    campus: z.enum(['NB', 'NK', 'CM']).default('NB')
      .describe('Campus code'),
  });

export const checkScheduleConflictsOutputSchema = z.object({
    hasConflicts: z.boolean(),
    conflicts: z.array(z.object({
      section1: z.object({
        indexNumber: z.string(),
        courseString: z.string(),
        title: z.string(),
      }),
      section2: z.object({
        indexNumber: z.string(),
        courseString: z.string(),
        title: z.string(),
      }),
      day: z.string(),
      dayName: z.string(),
      overlap: z.object({
        start: z.string(),
        end: z.string(),
      }),
    })),
    schedule: z.array(z.object({
      indexNumber: z.string(),
      courseString: z.string(),
      title: z.string(),
      credits: z.number().nullable(),
      isOpen: z.boolean(),
      meetings: z.array(z.object({
        day: z.string(),
        dayName: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        location: z.string(),
      })),
    })),
    totalCredits: z.number().nullable(),
    warnings: z.array(z.string()),
  });

export type CheckScheduleConflictsInput = z.infer<typeof checkScheduleConflictsInputSchema>;
export type CheckScheduleConflictsOutput = z.infer<typeof checkScheduleConflictsOutputSchema>;

export async function runCheckScheduleConflicts(
  context: CheckScheduleConflictsInput,
  deps: {
    supabaseClient?: typeof defaultSupabase;
    now?: () => Date;
  } = {},
): Promise<CheckScheduleConflictsOutput> {
  const supabase = deps.supabaseClient ?? defaultSupabase;
    const {
      sectionIndices,
      year: inputYear,
      term: inputTerm,
      campus = 'NB',
    } = context;

    // Validate all index numbers
    const invalidIndices = sectionIndices.filter(idx => !isValidIndexNumber(idx));
    if (invalidIndices.length > 0) {
      throw new Error(`Invalid index numbers (must be 5 digits): ${invalidIndices.join(', ')}`);
    }

    // Auto-detect term if not provided
    const defaultTerm = getDefaultTerm(deps.now?.());
    const year = inputYear ?? defaultTerm.year;
    const term = inputTerm ?? defaultTerm.term;

    try {
      // Get all sections with their course info
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select(`
          id,
          index_number,
          section_number,
          open_status,
          courses!inner (
            course_string,
            title,
            credits,
            terms!inner (year, term, campus)
          )
        `)
        .in('index_number', sectionIndices);

      if (sectionsError) {
        throw new Error(`Failed to get sections: ${sectionsError.message}`);
      }

      // Filter to sections in the specified term
      const filteredSections = sectionsData?.filter(s => {
        const course = s.courses as { terms: { year: number; term: string; campus: string } };
        return course.terms.year === year && course.terms.term === term;
      }) || [];

      // Check for missing sections
      const foundIndices = new Set(filteredSections.map(s => s.index_number));
      const missingIndices = sectionIndices.filter(idx => !foundIndices.has(idx));
      
      const warnings: string[] = [];
      if (missingIndices.length > 0) {
        warnings.push(`Sections not found for ${getTermName(term)} ${year}: ${missingIndices.join(', ')}`);
      }

      if (filteredSections.length < 2) {
        return {
          hasConflicts: false,
          conflicts: [],
          schedule: [],
          totalCredits: null,
          warnings: warnings.length > 0 ? warnings : ['Need at least 2 valid sections to check conflicts'],
        };
      }

      // Get meeting times for all sections
      const sectionIds = filteredSections.map(s => s.id);
      const { data: meetingTimesData, error: meetingTimesError } = await supabase
        .from('meeting_times')
        .select('*')
        .in('section_id', sectionIds);

      if (meetingTimesError) {
        throw new Error(`Failed to get meeting times: ${meetingTimesError.message}`);
      }

      // Group meeting times by section
      const meetingTimesBySectionId = new Map<number, typeof meetingTimesData>();
      meetingTimesData?.forEach(mt => {
        const existing = meetingTimesBySectionId.get(mt.section_id) || [];
        existing.push(mt);
        meetingTimesBySectionId.set(mt.section_id, existing);
      });

      // Build section data with meeting times
      interface SectionWithMeetings {
        id: number;
        indexNumber: string;
        courseString: string;
        title: string;
        credits: number | null;
        isOpen: boolean;
        meetingTimes: Array<{
          day: string;
          startTimeMilitary: string;
          endTimeMilitary: string;
          building: string | null;
          room: string | null;
          campus: string | null;
        }>;
      }

      const sectionsWithMeetings: SectionWithMeetings[] = filteredSections.map(s => {
        const course = s.courses as {
          course_string: string;
          title: string;
          credits: number | null;
        };
        const meetingTimes = meetingTimesBySectionId.get(s.id) || [];
        
        return {
          id: s.id,
          indexNumber: s.index_number,
          courseString: course.course_string,
          title: course.title,
          credits: course.credits,
          isOpen: s.open_status,
          meetingTimes: meetingTimes.map(mt => ({
            day: mt.meeting_day || '',
            startTimeMilitary: mt.start_time_military || '',
            endTimeMilitary: mt.end_time_military || '',
            building: mt.building_code,
            room: mt.room_number,
            campus: mt.campus_name,
          })),
        };
      });

      // Check for closed sections
      sectionsWithMeetings.forEach(s => {
        if (!s.isOpen) {
          warnings.push(`Section ${s.indexNumber} (${s.courseString}) is CLOSED`);
        }
      });

      // Check for TBA meeting times
      sectionsWithMeetings.forEach(s => {
        const hasTBA = s.meetingTimes.some(mt => !mt.day || !mt.startTimeMilitary || !mt.endTimeMilitary);
        if (hasTBA) {
          warnings.push(`Section ${s.indexNumber} has TBA meeting times - cannot verify conflicts`);
        }
      });

      // Find conflicts
      interface Conflict {
        section1: { indexNumber: string; courseString: string; title: string };
        section2: { indexNumber: string; courseString: string; title: string };
        day: string;
        dayName: string;
        overlap: { start: string; end: string };
      }

      const conflicts: Conflict[] = [];

      for (let i = 0; i < sectionsWithMeetings.length; i++) {
        for (let j = i + 1; j < sectionsWithMeetings.length; j++) {
          const section1 = sectionsWithMeetings[i];
          const section2 = sectionsWithMeetings[j];

          for (const mt1 of section1.meetingTimes) {
            for (const mt2 of section2.meetingTimes) {
              // Skip if either has TBA day or times
              if (!mt1.day || !mt2.day || !mt1.startTimeMilitary || !mt2.startTimeMilitary) {
                continue;
              }

              // Check if same day
              if (mt1.day === mt2.day) {
                // Check for time overlap
                if (timesOverlap(
                  mt1.startTimeMilitary,
                  mt1.endTimeMilitary,
                  mt2.startTimeMilitary,
                  mt2.endTimeMilitary
                )) {
                  const overlapRange = calculateOverlapRange(
                    mt1.startTimeMilitary,
                    mt1.endTimeMilitary,
                    mt2.startTimeMilitary,
                    mt2.endTimeMilitary
                  );

                  if (overlapRange) {
                    conflicts.push({
                      section1: {
                        indexNumber: section1.indexNumber,
                        courseString: section1.courseString,
                        title: section1.title,
                      },
                      section2: {
                        indexNumber: section2.indexNumber,
                        courseString: section2.courseString,
                        title: section2.title,
                      },
                      day: mt1.day,
                      dayName: getDayName(mt1.day),
                      overlap: {
                        start: formatTime(overlapRange.start),
                        end: formatTime(overlapRange.end),
                      },
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Build schedule output
      const schedule = sectionsWithMeetings.map(s => ({
        indexNumber: s.indexNumber,
        courseString: s.courseString,
        title: s.title,
        credits: s.credits,
        isOpen: s.isOpen,
        meetings: s.meetingTimes.map(mt => ({
          day: mt.day,
          dayName: getDayName(mt.day),
          startTime: formatTime(mt.startTimeMilitary),
          endTime: formatTime(mt.endTimeMilitary),
          location: formatLocation(mt.building, mt.room, mt.campus),
        })),
      }));

      // Calculate total credits
      let totalCredits: number | null = 0;
      for (const s of sectionsWithMeetings) {
        if (s.credits === null) {
          totalCredits = null;
          break;
        }
        totalCredits += s.credits;
      }

      // Add credit warnings
      if (totalCredits !== null) {
        if (totalCredits < 12) {
          warnings.push(`Note: ${totalCredits} credits is below full-time status (12+ credits).`);
        } else if (totalCredits > 21) {
          warnings.push(`Warning: ${totalCredits} credits exceeds the standard maximum (21). Overload permission may be required.`);
        }
      }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
        schedule,
        totalCredits,
        warnings,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to check schedule conflicts: Unknown error`);
    }
}

export const checkScheduleConflicts = createTool({
  id: 'checkScheduleConflicts',
  description: CHECK_SCHEDULE_CONFLICTS_DESCRIPTION,
  inputSchema: checkScheduleConflictsInputSchema,
  outputSchema: checkScheduleConflictsOutputSchema,
  execute: async ({ context }) => runCheckScheduleConflicts(context),
});
