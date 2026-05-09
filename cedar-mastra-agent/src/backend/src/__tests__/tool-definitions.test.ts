import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  AddSectionToTemporaryScheduleSchema,
  SOC_TOOLS,
  TOOL_REGISTRY,
} from '../mastra/tools/toolDefinitions.js';

describe('toolDefinitions SOC registry', () => {
  it('includes findRoomAvailability in TOOL_REGISTRY.soc', () => {
    assert.ok(
      'findRoomAvailability' in TOOL_REGISTRY.soc,
      'TOOL_REGISTRY.soc should include findRoomAvailability',
    );
  });

  it('includes findRoomAvailability in SOC_TOOLS', () => {
    const hasRoomTool = SOC_TOOLS.some((tool) => tool.id === 'findRoomAvailability');
    assert.ok(hasRoomTool, 'SOC_TOOLS should include findRoomAvailability');
  });

  it('includes browser tools in TOOL_REGISTRY.browser', () => {
    assert.ok(
      'createBrowserSession' in TOOL_REGISTRY.browser,
      'TOOL_REGISTRY.browser should include createBrowserSession',
    );
    assert.ok(
      'browserAct' in TOOL_REGISTRY.browser,
      'TOOL_REGISTRY.browser should include browserAct',
    );
  });

  it('includes visible browser session tool in browser state registry', () => {
    assert.ok(
      'ensureDegreeNavigatorSessionTool' in TOOL_REGISTRY.browserState,
      'TOOL_REGISTRY.browserState should include ensureDegreeNavigatorSessionTool',
    );
  });

  it('includes browser tools in SOC_TOOLS', () => {
    const hasBrowserSessionTool = SOC_TOOLS.some((tool) => tool.id === 'createBrowserSession');
    const hasBrowserActTool = SOC_TOOLS.some((tool) => tool.id === 'browserAct');
    assert.ok(hasBrowserSessionTool, 'SOC_TOOLS should include createBrowserSession');
    assert.ok(hasBrowserActTool, 'SOC_TOOLS should include browserAct');
  });

  it('rejects meetings-only temporary schedule section payloads', () => {
    const result = AddSectionToTemporaryScheduleSchema.safeParse({
      scheduleId: 'option-1',
      section: {
        indexNumber: '09214',
        courseString: '01:198:111',
        title: 'INTRO COMPUTER SCI',
        credits: 4,
        isOpen: true,
        meetings: [
          {
            day: 'M',
            dayName: 'Monday',
            startTime: '10:20 AM',
            endTime: '11:40 AM',
            location: 'HLL 116 (Busch)',
          },
        ],
      },
    });

    if (result.success) {
      assert.fail('meetings-only payload should fail validation');
    }
    assert.match(
      result.error.issues[0]?.message ?? '',
      /Use meetingTimes, not meetings/,
    );
  });

  it('accepts canonical meetingTimes temporary schedule section payloads', () => {
    const result = AddSectionToTemporaryScheduleSchema.safeParse({
      scheduleId: 'option-1',
      section: {
        indexNumber: '09214',
        course: {
          courseString: '01:198:111',
          title: 'INTRO COMPUTER SCI',
          credits: 4,
        },
        isOpen: true,
        meetingTimes: [
          {
            day: 'M',
            dayName: 'Monday',
            startTime: '10:20 AM',
            endTime: '11:40 AM',
            location: 'HLL 116 (Busch)',
          },
        ],
      },
    });

    assert.equal(result.success, true);
  });
});
