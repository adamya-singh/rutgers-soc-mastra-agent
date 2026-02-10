import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  searchCourses,
  getCourseDetails,
  browseMetadata,
  searchSections,
  getSectionByIndex,
  checkScheduleConflicts,
  getPrerequisites,
} from '../mastra/tools/index.js';

/**
 * These tests verify the tool configurations and schemas are properly defined.
 * Integration tests requiring a live database connection would be separate.
 */

describe('Tools Configuration', () => {
  describe('searchCourses', () => {
    it('has required properties', () => {
      assert.strictEqual(searchCourses.id, 'searchCourses');
      assert.ok(searchCourses.description);
      assert.ok(searchCourses.inputSchema);
      assert.ok(searchCourses.outputSchema);
      assert.ok(typeof searchCourses.execute === 'function');
    });

    it('has valid input schema', () => {
      const schema = searchCourses.inputSchema;
      // Should have optional query
      const parsed = schema.safeParse({});
      assert.ok(parsed.success, 'Should accept empty input with defaults');
      
      // Should accept valid subject
      const withSubject = schema.safeParse({ subject: '198' });
      assert.ok(withSubject.success);
      
      // Should accept valid campus
      const withCampus = schema.safeParse({ campus: 'NB' });
      assert.ok(withCampus.success);
      
      // Should reject invalid campus
      const invalidCampus = schema.safeParse({ campus: 'INVALID' });
      assert.ok(!invalidCampus.success);
    });
  });

  describe('getCourseDetails', () => {
    it('has required properties', () => {
      assert.strictEqual(getCourseDetails.id, 'getCourseDetails');
      assert.ok(getCourseDetails.description);
      assert.ok(getCourseDetails.inputSchema);
      assert.ok(getCourseDetails.outputSchema);
      assert.ok(typeof getCourseDetails.execute === 'function');
    });

    it('requires courseString in input', () => {
      const schema = getCourseDetails.inputSchema;
      
      // Should require courseString
      const empty = schema.safeParse({});
      assert.ok(!empty.success, 'Should reject empty input');
      
      // Should accept valid courseString
      const valid = schema.safeParse({ courseString: '01:198:111' });
      assert.ok(valid.success);
    });
  });

  describe('browseMetadata', () => {
    it('has required properties', () => {
      assert.strictEqual(browseMetadata.id, 'browseMetadata');
      assert.ok(browseMetadata.description);
      assert.ok(browseMetadata.inputSchema);
      assert.ok(browseMetadata.outputSchema);
      assert.ok(typeof browseMetadata.execute === 'function');
    });

    it('requires type in input', () => {
      const schema = browseMetadata.inputSchema;
      
      // Should require type
      const empty = schema.safeParse({});
      assert.ok(!empty.success, 'Should reject empty input');
      
      // Should accept valid types
      const terms = schema.safeParse({ type: 'terms' });
      assert.ok(terms.success);
      
      const subjects = schema.safeParse({ type: 'subjects' });
      assert.ok(subjects.success);
      
      // Should reject invalid types
      const invalid = schema.safeParse({ type: 'invalid' });
      assert.ok(!invalid.success);
    });
  });

  describe('searchSections', () => {
    it('has required properties', () => {
      assert.strictEqual(searchSections.id, 'searchSections');
      assert.ok(searchSections.description);
      assert.ok(searchSections.inputSchema);
      assert.ok(searchSections.outputSchema);
      assert.ok(typeof searchSections.execute === 'function');
    });

    it('has valid input schema with day filters', () => {
      const schema = searchSections.inputSchema;
      
      // Should accept valid day codes
      const withDays = schema.safeParse({ days: ['M', 'W', 'F'] });
      assert.ok(withDays.success);
      
      // Should accept openOnly=false to include closed sections
      const withClosed = schema.safeParse({ openOnly: false });
      assert.ok(withClosed.success);

      // Should reject invalid day codes
      const invalidDays = schema.safeParse({ days: ['Monday'] });
      assert.ok(!invalidDays.success);
    });

    it('accepts valid classroom filters and rejects malformed classroom codes', () => {
      const schema = searchSections.inputSchema;

      const validClassroomDash = schema.safeParse({ classroomCode: 'LSH-B116' });
      assert.ok(validClassroomDash.success);

      const validClassroomSpace = schema.safeParse({ classroomCode: 'LSH B116' });
      assert.ok(validClassroomSpace.success);

      const validClassroomCompact = schema.safeParse({ classroomCode: 'LSHB116' });
      assert.ok(validClassroomCompact.success);

      const validExplicitFields = schema.safeParse({ buildingCode: 'LSH', roomNumber: 'B116' });
      assert.ok(validExplicitFields.success);

      const invalidClassroom = schema.safeParse({ classroomCode: '-' });
      assert.ok(!invalidClassroom.success);
    });
  });

  describe('getSectionByIndex', () => {
    it('has required properties', () => {
      assert.strictEqual(getSectionByIndex.id, 'getSectionByIndex');
      assert.ok(getSectionByIndex.description);
      assert.ok(getSectionByIndex.inputSchema);
      assert.ok(getSectionByIndex.outputSchema);
      assert.ok(typeof getSectionByIndex.execute === 'function');
    });

    it('requires indexNumber in input', () => {
      const schema = getSectionByIndex.inputSchema;
      
      // Should require indexNumber
      const empty = schema.safeParse({});
      assert.ok(!empty.success, 'Should reject empty input');
      
      // Should accept valid index number
      const valid = schema.safeParse({ indexNumber: '09214' });
      assert.ok(valid.success);
    });
  });

  describe('checkScheduleConflicts', () => {
    it('has required properties', () => {
      assert.strictEqual(checkScheduleConflicts.id, 'checkScheduleConflicts');
      assert.ok(checkScheduleConflicts.description);
      assert.ok(checkScheduleConflicts.inputSchema);
      assert.ok(checkScheduleConflicts.outputSchema);
      assert.ok(typeof checkScheduleConflicts.execute === 'function');
    });

    it('requires minimum 2 section indices', () => {
      const schema = checkScheduleConflicts.inputSchema;
      
      // Should reject single index
      const single = schema.safeParse({ sectionIndices: ['09214'] });
      assert.ok(!single.success, 'Should reject single index');
      
      // Should accept two or more indices
      const valid = schema.safeParse({ sectionIndices: ['09214', '12345'] });
      assert.ok(valid.success);
    });

    it('rejects more than 10 section indices', () => {
      const schema = checkScheduleConflicts.inputSchema;
      
      const tooMany = schema.safeParse({
        sectionIndices: Array(11).fill(0).map((_, i) => String(10000 + i)),
      });
      assert.ok(!tooMany.success, 'Should reject more than 10 indices');
    });
  });

  describe('getPrerequisites', () => {
    it('has required properties', () => {
      assert.strictEqual(getPrerequisites.id, 'getPrerequisites');
      assert.ok(getPrerequisites.description);
      assert.ok(getPrerequisites.inputSchema);
      assert.ok(getPrerequisites.outputSchema);
      assert.ok(typeof getPrerequisites.execute === 'function');
    });

    it('requires courseString in input', () => {
      const schema = getPrerequisites.inputSchema;
      
      // Should require courseString
      const empty = schema.safeParse({});
      assert.ok(!empty.success, 'Should reject empty input');
      
      // Should accept valid courseString
      const valid = schema.safeParse({ courseString: '01:198:211' });
      assert.ok(valid.success);
    });
  });
});

describe('Tool Output Schemas', () => {
  describe('searchCourses output', () => {
    it('validates correct output structure', () => {
      const schema = searchCourses.outputSchema;
      
      const valid = schema.safeParse({
        courses: [
          {
            courseString: '01:198:111',
            title: 'INTRO COMPUTER SCI',
            expandedTitle: 'Introduction to Computer Science',
            credits: 4,
            level: 'U',
            subjectCode: '198',
            subjectName: 'Computer Science',
            schoolCode: '01',
            schoolName: 'School of Arts and Sciences',
            openSections: 3,
            totalSections: 12,
            campus: 'NB',
            year: 2025,
            term: '1',
            termName: 'Spring',
            coreCodes: ['QQ'],
          },
        ],
        totalCount: 1,
        hasMore: false,
        searchContext: {
          year: 2025,
          term: '1',
          termName: 'Spring',
          campus: 'NB',
        },
      });
      
      assert.ok(valid.success);
    });
  });

  describe('checkScheduleConflicts output', () => {
    it('validates correct output structure with conflicts', () => {
      const schema = checkScheduleConflicts.outputSchema;
      
      const valid = schema.safeParse({
        hasConflicts: true,
        conflicts: [
          {
            section1: {
              indexNumber: '09214',
              courseString: '01:198:111',
              title: 'INTRO COMPUTER SCI',
            },
            section2: {
              indexNumber: '12345',
              courseString: '01:640:151',
              title: 'CALCULUS I',
            },
            day: 'M',
            dayName: 'Monday',
            overlap: {
              start: '10:20 AM',
              end: '11:00 AM',
            },
          },
        ],
        schedule: [],
        totalCredits: 8,
        warnings: [],
      });
      
      assert.ok(valid.success);
    });
  });
});
