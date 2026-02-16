/**
 * Shared utilities for Rutgers SOC Agent
 */

// =============================================================================
// Term Auto-Detection
// =============================================================================

/**
 * Get the default term based on registration windows.
 * The agent defaults to the term students are most likely REGISTERING for,
 * not the currently-active term.
 */
export function getDefaultTerm(now: Date = new Date()): { year: number; term: string; termName: string } {
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  
  // Default to the term students are most likely REGISTERING for
  // (not the currently-active term)
  // Rule: Switch to next term after ~75% of current term has passed
  
  if (month >= 11 || month === 1) {
    // Nov-Jan: Registration for Spring
    return { year: month >= 11 ? year + 1 : year, term: '1', termName: 'Spring' };
  } else if (month >= 2 && month <= 3) {
    // Feb-Mar: Still Spring (current term)
    return { year, term: '1', termName: 'Spring' };
  } else if (month >= 4 && month <= 7) {
    // Apr-Jul: Registration for Fall
    return { year, term: '9', termName: 'Fall' };
  } else if (month >= 8 && month <= 9) {
    // Aug-Sep: Fall (current term)
    return { year, term: '9', termName: 'Fall' };
  } else {
    // Oct: Transition to Spring registration
    return { year: year + 1, term: '1', termName: 'Spring' };
  }
}

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Convert military time to display format (e.g., "1020" -> "10:20 AM")
 */
export function formatTime(military: string | null): string {
  if (!military || military.length < 4) return 'TBA';
  
  const hours = parseInt(military.slice(0, 2), 10);
  const minutes = military.slice(2, 4);
  
  const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Day code to full name mapping
 */
export const DAY_NAMES: Record<string, string> = {
  'M': 'Monday',
  'T': 'Tuesday',
  'W': 'Wednesday',
  'H': 'Thursday',
  'F': 'Friday',
  'S': 'Saturday',
  'U': 'Sunday',
  '': 'TBA',
};

/**
 * Get full day name from day code
 */
export function getDayName(dayCode: string | null): string {
  return DAY_NAMES[dayCode || ''] || 'TBA';
}

// =============================================================================
// Section Type Mappings
// =============================================================================

/**
 * Section type to name mapping
 */
export const SECTION_TYPES: Record<string, string> = {
  'T': 'Traditional',
  'H': 'Hybrid',
  'O': 'Online',
};

/**
 * Get section type name from code
 */
export function getSectionTypeName(typeCode: string | null): string {
  return SECTION_TYPES[typeCode || ''] || 'Unknown';
}

/**
 * Level to name mapping
 */
export const LEVEL_NAMES: Record<string, string> = {
  'U': 'Undergraduate',
  'G': 'Graduate',
};

/**
 * Get level name from code
 */
export function getLevelName(levelCode: string | null): string {
  return LEVEL_NAMES[levelCode || ''] || 'Unknown';
}

// =============================================================================
// Meeting Mode Codes
// =============================================================================

/**
 * Meeting mode codes (from Rutgers SOC API)
 * Used for online detection and linked section grouping
 */
export const MEETING_MODE_CODES: Record<string, string> = {
  '02': 'Lecture',
  '03': 'Recitation',
  '04': 'Lab',
  '05': 'Seminar',
  '06': 'Studio',
  '07': 'Workshop',
  '08': 'Clinic',
  '09': 'Internship',
  '10': 'Independent Study',
  '90': 'Online/Asynchronous',
};

/**
 * Check if a meeting mode code indicates online
 */
export function isOnlineMeeting(meetingModeCode: string | null): boolean {
  return meetingModeCode === '90';
}

/**
 * Get meeting mode description from code
 */
export function getMeetingModeDescription(modeCode: string | null): string {
  return MEETING_MODE_CODES[modeCode || ''] || 'Unknown';
}

// =============================================================================
// Campus Normalization
// =============================================================================

/**
 * Normalize campus input to standard code
 */
export function normalizeCampus(campus: string): string {
  const mapping: Record<string, string> = {
    'new brunswick': 'NB',
    'newbrunswick': 'NB',
    'nb': 'NB',
    'newark': 'NK',
    'nk': 'NK',
    'camden': 'CM',
    'cm': 'CM',
  };
  return mapping[campus.toLowerCase()] || campus.toUpperCase();
}

/**
 * Campus code to full name mapping
 */
export const CAMPUS_NAMES: Record<string, string> = {
  'NB': 'New Brunswick',
  'NK': 'Newark',
  'CM': 'Camden',
  'ONLINE_NB': 'Online (New Brunswick)',
  'ONLINE_NK': 'Online (Newark)',
  'ONLINE_CM': 'Online (Camden)',
};

/**
 * Get campus name from code
 */
export function getCampusName(campusCode: string | null): string {
  return CAMPUS_NAMES[campusCode || ''] || campusCode || 'Unknown';
}

// =============================================================================
// Term Utilities
// =============================================================================

/**
 * Term code to name mapping
 */
export const TERM_NAMES: Record<string, string> = {
  '0': 'Winter',
  '1': 'Spring',
  '7': 'Summer',
  '9': 'Fall',
};

/**
 * Get term name from code
 */
export function getTermName(termCode: string | null): string {
  return TERM_NAMES[termCode || ''] || 'Unknown';
}

// =============================================================================
// Conflict Detection
// =============================================================================

/**
 * Check if two time ranges overlap
 * @param start1 Military time format (e.g., "1020")
 * @param end1 Military time format (e.g., "1140")
 * @param start2 Military time format
 * @param end2 Military time format
 */
export function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = parseInt(start1, 10);
  const e1 = parseInt(end1, 10);
  const s2 = parseInt(start2, 10);
  const e2 = parseInt(end2, 10);
  
  // Overlap if one starts before the other ends
  return s1 < e2 && s2 < e1;
}

/**
 * Calculate the overlap range between two time periods
 */
export function calculateOverlapRange(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): { start: string; end: string } | null {
  const s1 = parseInt(start1, 10);
  const e1 = parseInt(end1, 10);
  const s2 = parseInt(start2, 10);
  const e2 = parseInt(end2, 10);
  
  if (s1 >= e2 || s2 >= e1) {
    return null; // No overlap
  }
  
  const overlapStart = Math.max(s1, s2);
  const overlapEnd = Math.min(e1, e2);
  
  return {
    start: overlapStart.toString().padStart(4, '0'),
    end: overlapEnd.toString().padStart(4, '0'),
  };
}

// =============================================================================
// Course String Utilities
// =============================================================================

/**
 * Parse a course string into its components
 * Supports formats: "01:198:111" or "198:111"
 */
export function parseCourseString(courseString: string): {
  unitCode?: string;
  subjectCode: string;
  courseNumber: string;
} | null {
  // Full format: XX:XXX:XXX
  const fullMatch = courseString.match(/^(\d{2}):(\d{3}):(\d{3})$/);
  if (fullMatch) {
    return {
      unitCode: fullMatch[1],
      subjectCode: fullMatch[2],
      courseNumber: fullMatch[3],
    };
  }
  
  // Short format: XXX:XXX
  const shortMatch = courseString.match(/^(\d{3}):(\d{3})$/);
  if (shortMatch) {
    return {
      subjectCode: shortMatch[1],
      courseNumber: shortMatch[2],
    };
  }
  
  return null;
}

/**
 * Validate index number format (must be exactly 5 digits)
 */
export function isValidIndexNumber(indexNumber: string): boolean {
  return /^\d{5}$/.test(indexNumber);
}

// =============================================================================
// Classroom/Location Parsing
// =============================================================================

/**
 * Normalize a location token for deterministic matching.
 * Removes non-alphanumeric characters and uppercases the result.
 */
export function normalizeLocationToken(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Parse classroom input into normalized building and room components.
 * Supports examples like "LSH-B116", "LSH B116", and "LSHB116".
 */
export function parseClassroomCode(input: string): {
  buildingCodeNorm?: string;
  roomNumberNorm?: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();

  // Explicit split with separators
  const separated = upper.match(/^([A-Z]+)[\s-]+([A-Z0-9]+)$/);
  if (separated) {
    const buildingCodeNorm = normalizeLocationToken(separated[1]);
    const roomNumberNorm = normalizeLocationToken(separated[2]);
    if (buildingCodeNorm && roomNumberNorm) {
      return { buildingCodeNorm, roomNumberNorm };
    }
    return null;
  }

  // Compact form without separators (e.g., LSHB116)
  const compact = normalizeLocationToken(upper);
  const digitIndex = compact.search(/\d/);
  if (digitIndex > 0) {
    const letterPrefix = compact.slice(0, digitIndex);
    const numericSuffix = compact.slice(digitIndex);

    if (letterPrefix.length < 2 || !numericSuffix) {
      return null;
    }

    // In compact strings like LSHB116, treat trailing letter as room prefix (B116).
    const useTrailingRoomPrefix = letterPrefix.length >= 4;
    const buildingCodeNorm = useTrailingRoomPrefix
      ? letterPrefix.slice(0, -1)
      : letterPrefix;
    const roomPrefix = useTrailingRoomPrefix ? letterPrefix.slice(-1) : '';
    const roomNumberNorm = `${roomPrefix}${numericSuffix}`;

    if (buildingCodeNorm && roomNumberNorm) {
      return { buildingCodeNorm, roomNumberNorm };
    }
  }

  return null;
}

// =============================================================================
// Location Formatting
// =============================================================================

/**
 * Format a location string from building, room, and campus
 */
export function formatLocation(
  building: string | null,
  room: string | null,
  campus: string | null
): string {
  if (!building && !room) {
    return campus ? `Online (${campus})` : 'Online';
  }
  
  const location = [building, room].filter(Boolean).join(' ');
  return campus ? `${location} (${campus})` : location;
}
