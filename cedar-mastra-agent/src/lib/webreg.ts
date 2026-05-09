import type { ScheduleSnapshot } from './scheduleStorage';

const WEBREG_EDIT_SCHEDULE_URL = 'http://sims.rutgers.edu/webreg/editSchedule.htm';
const WEBREG_INDEX_PATTERN = /^\d{5}$/;

export type WebRegRegistrationTarget = {
  url: string | null;
  semesterSelection: string;
  indexNumbers: string[];
  invalidIndexNumbers: string[];
};

export function buildWebRegRegistrationTarget(
  schedule: Pick<ScheduleSnapshot, 'termYear' | 'termCode' | 'sections'>,
): WebRegRegistrationTarget {
  const semesterSelection = `${schedule.termCode}${schedule.termYear}`;
  const seen = new Set<string>();
  const indexNumbers: string[] = [];
  const invalidIndexNumbers: string[] = [];

  schedule.sections.forEach((section) => {
    const indexNumber = section.indexNumber?.trim() ?? '';

    if (!WEBREG_INDEX_PATTERN.test(indexNumber)) {
      invalidIndexNumbers.push(indexNumber);
      return;
    }

    if (seen.has(indexNumber)) return;
    seen.add(indexNumber);
    indexNumbers.push(indexNumber);
  });

  const url = indexNumbers.length > 0
    ? `${WEBREG_EDIT_SCHEDULE_URL}?login=cas&semesterSelection=${semesterSelection}&indexList=${indexNumbers.join(',')}`
    : null;

  return {
    url,
    semesterSelection,
    indexNumbers,
    invalidIndexNumbers,
  };
}
