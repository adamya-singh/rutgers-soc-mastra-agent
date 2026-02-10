import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  getDefaultTerm,
  formatTime,
  getDayName,
  getSectionTypeName,
  getLevelName,
  isOnlineMeeting,
  normalizeCampus,
  getTermName,
  timesOverlap,
  calculateOverlapRange,
  parseCourseString,
  isValidIndexNumber,
  normalizeLocationToken,
  parseClassroomCode,
  formatLocation,
} from '../lib/utils.js';

describe('Utils', () => {
  describe('getDefaultTerm', () => {
    it('returns a term object with year, term, and termName', () => {
      const result = getDefaultTerm();
      assert.ok(typeof result.year === 'number');
      assert.ok(['0', '1', '7', '9'].includes(result.term));
      assert.ok(['Winter', 'Spring', 'Summer', 'Fall'].includes(result.termName));
    });
  });

  describe('formatTime', () => {
    it('formats military time to display format', () => {
      assert.strictEqual(formatTime('0900'), '9:00 AM');
      assert.strictEqual(formatTime('1020'), '10:20 AM');
      assert.strictEqual(formatTime('1200'), '12:00 PM');
      assert.strictEqual(formatTime('1330'), '1:30 PM');
      assert.strictEqual(formatTime('1740'), '5:40 PM');
      assert.strictEqual(formatTime('0000'), '12:00 AM');
    });

    it('returns TBA for null or empty input', () => {
      assert.strictEqual(formatTime(null), 'TBA');
      assert.strictEqual(formatTime(''), 'TBA');
      assert.strictEqual(formatTime('12'), 'TBA');
    });
  });

  describe('getDayName', () => {
    it('converts day codes to full names', () => {
      assert.strictEqual(getDayName('M'), 'Monday');
      assert.strictEqual(getDayName('T'), 'Tuesday');
      assert.strictEqual(getDayName('W'), 'Wednesday');
      assert.strictEqual(getDayName('H'), 'Thursday');
      assert.strictEqual(getDayName('F'), 'Friday');
      assert.strictEqual(getDayName('S'), 'Saturday');
      assert.strictEqual(getDayName('U'), 'Sunday');
    });

    it('returns TBA for null or empty input', () => {
      assert.strictEqual(getDayName(null), 'TBA');
      assert.strictEqual(getDayName(''), 'TBA');
    });
  });

  describe('getSectionTypeName', () => {
    it('converts section type codes to names', () => {
      assert.strictEqual(getSectionTypeName('T'), 'Traditional');
      assert.strictEqual(getSectionTypeName('H'), 'Hybrid');
      assert.strictEqual(getSectionTypeName('O'), 'Online');
    });

    it('returns Unknown for invalid codes', () => {
      assert.strictEqual(getSectionTypeName(null), 'Unknown');
      assert.strictEqual(getSectionTypeName('X'), 'Unknown');
    });
  });

  describe('getLevelName', () => {
    it('converts level codes to names', () => {
      assert.strictEqual(getLevelName('U'), 'Undergraduate');
      assert.strictEqual(getLevelName('G'), 'Graduate');
    });

    it('returns Unknown for invalid codes', () => {
      assert.strictEqual(getLevelName(null), 'Unknown');
    });
  });

  describe('isOnlineMeeting', () => {
    it('returns true for online meeting mode code', () => {
      assert.strictEqual(isOnlineMeeting('90'), true);
    });

    it('returns false for other meeting mode codes', () => {
      assert.strictEqual(isOnlineMeeting('02'), false);
      assert.strictEqual(isOnlineMeeting('03'), false);
      assert.strictEqual(isOnlineMeeting(null), false);
    });
  });

  describe('normalizeCampus', () => {
    it('normalizes various campus inputs to standard codes', () => {
      assert.strictEqual(normalizeCampus('new brunswick'), 'NB');
      assert.strictEqual(normalizeCampus('NB'), 'NB');
      assert.strictEqual(normalizeCampus('nb'), 'NB');
      assert.strictEqual(normalizeCampus('newark'), 'NK');
      assert.strictEqual(normalizeCampus('camden'), 'CM');
    });
  });

  describe('getTermName', () => {
    it('converts term codes to names', () => {
      assert.strictEqual(getTermName('0'), 'Winter');
      assert.strictEqual(getTermName('1'), 'Spring');
      assert.strictEqual(getTermName('7'), 'Summer');
      assert.strictEqual(getTermName('9'), 'Fall');
    });

    it('returns Unknown for invalid codes', () => {
      assert.strictEqual(getTermName(null), 'Unknown');
      assert.strictEqual(getTermName('5'), 'Unknown');
    });
  });

  describe('timesOverlap', () => {
    it('detects overlapping time ranges', () => {
      // 10:20-11:40 and 11:00-12:00 overlap
      assert.strictEqual(timesOverlap('1020', '1140', '1100', '1200'), true);
      
      // 10:00-11:00 and 10:30-11:30 overlap
      assert.strictEqual(timesOverlap('1000', '1100', '1030', '1130'), true);
      
      // Same time ranges
      assert.strictEqual(timesOverlap('1000', '1100', '1000', '1100'), true);
    });

    it('detects non-overlapping time ranges', () => {
      // 10:00-11:00 and 11:00-12:00 don't overlap (edge case)
      assert.strictEqual(timesOverlap('1000', '1100', '1100', '1200'), false);
      
      // 10:00-11:00 and 12:00-13:00 don't overlap
      assert.strictEqual(timesOverlap('1000', '1100', '1200', '1300'), false);
    });
  });

  describe('calculateOverlapRange', () => {
    it('calculates the overlap between two time ranges', () => {
      const result = calculateOverlapRange('1020', '1140', '1100', '1200');
      assert.deepStrictEqual(result, { start: '1100', end: '1140' });
    });

    it('returns null for non-overlapping ranges', () => {
      const result = calculateOverlapRange('1000', '1100', '1200', '1300');
      assert.strictEqual(result, null);
    });
  });

  describe('parseCourseString', () => {
    it('parses full course string format (XX:XXX:XXX)', () => {
      const result = parseCourseString('01:198:111');
      assert.deepStrictEqual(result, {
        unitCode: '01',
        subjectCode: '198',
        courseNumber: '111',
      });
    });

    it('parses short course string format (XXX:XXX)', () => {
      const result = parseCourseString('198:111');
      assert.deepStrictEqual(result, {
        subjectCode: '198',
        courseNumber: '111',
      });
    });

    it('returns null for invalid formats', () => {
      assert.strictEqual(parseCourseString('invalid'), null);
      assert.strictEqual(parseCourseString('01-198-111'), null);
      assert.strictEqual(parseCourseString('CS111'), null);
    });
  });

  describe('isValidIndexNumber', () => {
    it('validates 5-digit index numbers', () => {
      assert.strictEqual(isValidIndexNumber('09214'), true);
      assert.strictEqual(isValidIndexNumber('12345'), true);
      assert.strictEqual(isValidIndexNumber('00001'), true);
    });

    it('rejects invalid index numbers', () => {
      assert.strictEqual(isValidIndexNumber('9214'), false);  // Too short
      assert.strictEqual(isValidIndexNumber('123456'), false);  // Too long
      assert.strictEqual(isValidIndexNumber('1234a'), false);  // Contains letter
      assert.strictEqual(isValidIndexNumber(''), false);  // Empty
    });
  });

  describe('normalizeLocationToken', () => {
    it('uppercases and strips non-alphanumeric characters', () => {
      assert.strictEqual(normalizeLocationToken('lsh-b116'), 'LSHB116');
      assert.strictEqual(normalizeLocationToken(' B-116 '), 'B116');
      assert.strictEqual(normalizeLocationToken('sec_220'), 'SEC220');
    });
  });

  describe('parseClassroomCode', () => {
    it('parses classroom codes with a dash separator', () => {
      const result = parseClassroomCode('LSH-B116');
      assert.deepStrictEqual(result, {
        buildingCodeNorm: 'LSH',
        roomNumberNorm: 'B116',
      });
    });

    it('parses classroom codes with a space separator', () => {
      const result = parseClassroomCode('lsh b116');
      assert.deepStrictEqual(result, {
        buildingCodeNorm: 'LSH',
        roomNumberNorm: 'B116',
      });
    });

    it('parses compact classroom codes', () => {
      const result = parseClassroomCode('LSHB116');
      assert.deepStrictEqual(result, {
        buildingCodeNorm: 'LSH',
        roomNumberNorm: 'B116',
      });
    });

    it('parses compact classroom codes without a room letter prefix', () => {
      const result = parseClassroomCode('LSH116');
      assert.deepStrictEqual(result, {
        buildingCodeNorm: 'LSH',
        roomNumberNorm: '116',
      });
    });

    it('returns null for invalid classroom formats', () => {
      assert.strictEqual(parseClassroomCode('-'), null);
      assert.strictEqual(parseClassroomCode('123'), null);
      assert.strictEqual(parseClassroomCode(''), null);
    });
  });

  describe('formatLocation', () => {
    it('formats building, room, and campus into a location string', () => {
      assert.strictEqual(formatLocation('HLL', '116', 'Busch'), 'HLL 116 (Busch)');
      assert.strictEqual(formatLocation('SEC', '111', 'Livingston'), 'SEC 111 (Livingston)');
    });

    it('handles missing parts gracefully', () => {
      assert.strictEqual(formatLocation('HLL', null, 'Busch'), 'HLL (Busch)');
      assert.strictEqual(formatLocation(null, '116', 'Busch'), '116 (Busch)');
      assert.strictEqual(formatLocation(null, null, 'Busch'), 'Online (Busch)');
      assert.strictEqual(formatLocation(null, null, null), 'Online');
    });
  });
});
