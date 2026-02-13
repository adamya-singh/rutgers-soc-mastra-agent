import assert from 'node:assert';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { createSocTools, toParameters } from '../../openclaw-rutgers-soc/src/tools.js';

const mockApi = {
  logger: {
    warn: (_message: string) => {
      // Test harness can inspect warning counts if needed in the future.
    },
  },
  pluginConfig: {},
};

describe('openclaw Rutgers SOC plugin parameter schemas', () => {
  it('emits object schemas for all registered Rutgers SOC tools', () => {
    const tools = createSocTools(mockApi);
    assert.ok(tools.length > 0, 'expected at least one SOC tool to be registered');

    for (const tool of tools) {
      assert.strictEqual(
        tool.parameters.type,
        'object',
        `expected ${tool.name} to expose an object parameters schema`,
      );
      assert.ok(
        typeof tool.parameters === 'object' && tool.parameters !== null,
        `expected ${tool.name} parameters to be an object`,
      );
    }
  });

  it('keeps rutgers_soc_search_courses as an object schema', () => {
    const tools = createSocTools(mockApi);
    const searchTool = tools.find((tool) => tool.name === 'rutgers_soc_search_courses');
    assert.ok(searchTool, 'rutgers_soc_search_courses should be registered');
    assert.strictEqual(searchTool.parameters.type, 'object');
  });

  it('registers rutgers_soc_find_room_availability with object schema', () => {
    const tools = createSocTools(mockApi);
    const roomTool = tools.find((tool) => tool.name === 'rutgers_soc_find_room_availability');
    assert.ok(roomTool, 'rutgers_soc_find_room_availability should be registered');
    assert.strictEqual(roomTool.parameters.type, 'object');
  });
});

describe('plugin schema fallback guard', () => {
  it('returns a permissive object schema for non-object zod schemas', () => {
    const warnings: string[] = [];
    const params = toParameters(
      {
        logger: {
          warn: (message: string) => warnings.push(message),
        },
      },
      'test_non_object_schema',
      z.string(),
    );

    assert.strictEqual(params.type, 'object');
    assert.deepStrictEqual(params.properties, {});
    assert.strictEqual(params.additionalProperties, true);
    assert.ok(warnings.length >= 1, 'expected non-object schema warning');
  });
});
