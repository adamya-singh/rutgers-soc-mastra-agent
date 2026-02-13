import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateFreeWindows,
  isValidMilitaryTime,
  mergeIntervals,
} from '../mastra/tools/find-room-availability.js';

describe('findRoomAvailability helper functions', () => {
  describe('isValidMilitaryTime', () => {
    it('accepts valid HHMM values and rejects malformed values', () => {
      assert.strictEqual(isValidMilitaryTime('0000'), true);
      assert.strictEqual(isValidMilitaryTime('2359'), true);
      assert.strictEqual(isValidMilitaryTime('2400'), false);
      assert.strictEqual(isValidMilitaryTime('1260'), false);
      assert.strictEqual(isValidMilitaryTime('5pm'), false);
    });
  });

  describe('mergeIntervals', () => {
    it('merges overlaps into a single interval', () => {
      const merged = mergeIntervals([
        { start: '1000', end: '1130' },
        { start: '1115', end: '1200' },
        { start: '1230', end: '1300' },
      ]);

      assert.deepStrictEqual(merged, [
        { start: '1000', end: '1200' },
        { start: '1230', end: '1300' },
      ]);
    });
  });

  describe('calculateFreeWindows', () => {
    it('computes free windows around occupied intervals', () => {
      const windows = calculateFreeWindows({
        occupiedIntervals: [
          { start: '0900', end: '1000' },
          { start: '1030', end: '1130' },
        ],
        windowStart: '0800',
        windowEnd: '1200',
      });

      assert.deepStrictEqual(
        windows.map((window) => ({
          start: window.startMilitary,
          end: window.endMilitary,
          durationMinutes: window.durationMinutes,
        })),
        [
          { start: '0800', end: '0900', durationMinutes: 60 },
          { start: '1000', end: '1030', durationMinutes: 30 },
          { start: '1130', end: '1200', durationMinutes: 30 },
        ],
      );
    });

    it('returns one full window when room has no occupied intervals', () => {
      const windows = calculateFreeWindows({
        occupiedIntervals: [],
        windowStart: '1700',
        windowEnd: '2200',
      });

      assert.strictEqual(windows.length, 1);
      assert.strictEqual(windows[0].startMilitary, '1700');
      assert.strictEqual(windows[0].endMilitary, '2200');
      assert.strictEqual(windows[0].durationMinutes, 300);
    });
  });
});
