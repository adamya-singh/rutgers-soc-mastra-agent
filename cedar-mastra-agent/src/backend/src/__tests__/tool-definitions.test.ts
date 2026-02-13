import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SOC_TOOLS, TOOL_REGISTRY } from '../mastra/tools/toolDefinitions.js';

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
});
