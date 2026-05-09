import { describe, it } from 'node:test';
import assert from 'node:assert';

import webreg from '../../../lib/webreg.ts';

const { buildWebRegRegistrationTarget } = webreg;

describe('WebReg registration target', () => {
  it('builds the Fall 2026 registration URL from schedule sections', () => {
    const target = buildWebRegRegistrationTarget({
      termYear: 2026,
      termCode: '9',
      sections: [{ indexNumber: '11639' }],
    });

    assert.equal(target.semesterSelection, '92026');
    assert.deepEqual(target.indexNumbers, ['11639']);
    assert.equal(
      target.url,
      'http://sims.rutgers.edu/webreg/editSchedule.htm?login=cas&semesterSelection=92026&indexList=11639',
    );
  });

  it('de-duplicates valid indexes in schedule order', () => {
    const target = buildWebRegRegistrationTarget({
      termYear: 2026,
      termCode: '1',
      sections: [
        { indexNumber: '12345' },
        { indexNumber: '54321' },
        { indexNumber: '12345' },
      ],
    });

    assert.deepEqual(target.indexNumbers, ['12345', '54321']);
    assert.equal(
      target.url,
      'http://sims.rutgers.edu/webreg/editSchedule.htm?login=cas&semesterSelection=12026&indexList=12345,54321',
    );
  });

  it('returns a null URL for an empty schedule', () => {
    const target = buildWebRegRegistrationTarget({
      termYear: 2026,
      termCode: '7',
      sections: [],
    });

    assert.equal(target.url, null);
    assert.deepEqual(target.indexNumbers, []);
    assert.deepEqual(target.invalidIndexNumbers, []);
  });

  it('separates invalid indexes from valid indexes', () => {
    const target = buildWebRegRegistrationTarget({
      termYear: 2026,
      termCode: '9',
      sections: [
        { indexNumber: '11639' },
        { indexNumber: 'ABC12' },
        { indexNumber: '' },
      ],
    });

    assert.deepEqual(target.indexNumbers, ['11639']);
    assert.deepEqual(target.invalidIndexNumbers, ['ABC12', '']);
  });
});
