import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

import scheduleStorage from '../../../lib/scheduleStorage.ts';

const {
  addSectionToSchedule,
  addSectionToScheduleById,
  buildTemporaryScheduleId,
  createTemporarySchedule,
  normalizeScheduleSection,
  parseDisplayTimeToMilitary,
  parseMeetingLocation,
} = scheduleStorage;

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const installWindowStorage = () => {
  const storage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    dispatchEvent: () => true,
  };
  return storage;
};

describe('schedule storage section normalization', () => {
  beforeEach(() => {
    installWindowStorage();
  });

  it('converts display times to military time', () => {
    assert.equal(parseDisplayTimeToMilitary('10:20 AM'), '1020');
    assert.equal(parseDisplayTimeToMilitary('2:00 PM'), '1400');
    assert.equal(parseDisplayTimeToMilitary('12:05 AM'), '0005');
    assert.equal(parseDisplayTimeToMilitary('1230'), '1230');
  });

  it('parses SOC display locations', () => {
    assert.deepEqual(parseMeetingLocation('HLL 116 (Busch)'), {
      building: 'HLL',
      room: '116',
      campus: 'Busch',
    });
  });

  it('normalizes searchSections-style payloads into schedule sections', () => {
    const normalized = normalizeScheduleSection({
      indexNumber: '09214',
      sectionNumber: '01',
      course: {
        courseString: '01:198:111',
        title: 'INTRO COMPUTER SCI',
        credits: 4,
      },
      isOpen: true,
      instructors: ['MENENDEZ, FRANCISCO'],
      isOnline: false,
      meetingTimes: [
        {
          day: 'M',
          dayName: 'Monday',
          startTime: '10:20 AM',
          endTime: '11:40 AM',
          location: 'HLL 116 (Busch)',
          mode: 'Lecture',
        },
      ],
      sessionDates: null,
    });

    assert.equal(normalized.courseString, '01:198:111');
    assert.equal(normalized.courseTitle, 'INTRO COMPUTER SCI');
    assert.equal(normalized.credits, 4);
    assert.equal(normalized.meetingTimes?.[0]?.day, 'M');
    assert.equal(normalized.meetingTimes?.[0]?.startTimeMilitary, '1020');
    assert.equal(normalized.meetingTimes?.[0]?.endTimeMilitary, '1140');
    assert.equal(normalized.meetingTimes?.[0]?.building, 'HLL');
    assert.equal(normalized.meetingTimes?.[0]?.room, '116');
    assert.equal(normalized.meetingTimes?.[0]?.campus, 'Busch');
  });

  it('normalizes sections when adding to a temporary schedule', () => {
    const threadId = 'thread-1';
    const agentScheduleId = 'option-1';
    const storageId = buildTemporaryScheduleId(threadId, agentScheduleId);

    const created = createTemporarySchedule({
      threadId,
      id: storageId,
      label: 'MWF mornings',
    });

    assert.ok(created);
    const added = addSectionToScheduleById(storageId, {
      indexNumber: '09214',
      course: {
        courseString: '01:198:111',
        title: 'INTRO COMPUTER SCI',
        credits: 4,
      },
      meetingTimes: [
        {
          dayName: 'Monday',
          startTime: '10:20 AM',
          endTime: '11:40 AM',
          location: 'HLL 116 (Busch)',
        },
      ],
    });

    assert.equal(added, true);
    const storage = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage;
    const rawWorkspace = storage.getItem('rutgers-soc-schedules');
    assert.ok(rawWorkspace);
    const workspace = JSON.parse(rawWorkspace);
    const tempEntry = workspace.schedules.find((entry: { id: string }) => entry.id === storageId);
    assert.equal(tempEntry.snapshot.sections[0].meetingTimes[0].startTimeMilitary, '1020');
    assert.equal(tempEntry.snapshot.sections[0].meetingTimes[0].endTimeMilitary, '1140');
    assert.equal(tempEntry.snapshot.sections[0].meetingTimes[0].building, 'HLL');
  });

  it('normalizes sections when adding to a normal schedule snapshot', () => {
    const result = addSectionToSchedule({
      version: 1,
      termYear: 2026,
      termCode: '1',
      campus: 'NB',
      sections: [],
    }, {
      indexNumber: '12345',
      course: {
        courseString: '01:640:151',
        title: 'CALCULUS I',
        credits: 4,
      },
      meetingTimes: [
        {
          day: 'Thursday',
          startTime: '2:00 PM',
          endTime: '3:20 PM',
          location: 'ARC 103 (Busch)',
        },
      ],
    });

    assert.equal(result.added, true);
    assert.equal(result.schedule.sections[0].meetingTimes?.[0]?.day, 'H');
    assert.equal(result.schedule.sections[0].meetingTimes?.[0]?.startTimeMilitary, '1400');
  });
});
