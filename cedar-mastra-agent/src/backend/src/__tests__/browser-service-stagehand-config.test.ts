import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

import { getStagehandModelConfig } from '../browser/browserService.js';
import { BrowserSessionError } from '../browser/types.js';

const ENV_KEYS = [
  'STAGEHAND_MODEL_PROVIDER',
  'STAGEHAND_MODEL_API_KEY',
  'STAGEHAND_MODEL_NAME',
  'OPENAI_API_KEY',
  'GOOGLE_VERTEX_PROJECT',
  'GOOGLE_VERTEX_LOCATION',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

const originalEnv = new Map<string, string | undefined>();

describe('Stagehand model configuration', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const originalValue = originalEnv.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    originalEnv.clear();
  });

  it('uses the API-key-backed Stagehand model when STAGEHAND_MODEL_API_KEY is set', () => {
    process.env.STAGEHAND_MODEL_API_KEY = 'stagehand-key';

    const config = getStagehandModelConfig();

    assert.strictEqual(config.provider, 'apiKey');
    assert.strictEqual(config.modelName, 'gpt-4o-mini');
    assert.strictEqual(config.apiKey, 'stagehand-key');
  });

  it('falls back to OPENAI_API_KEY and honors a custom model name', () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.STAGEHAND_MODEL_NAME = 'openai/gpt-5';

    const config = getStagehandModelConfig();

    assert.strictEqual(config.provider, 'apiKey');
    assert.strictEqual(config.modelName, 'openai/gpt-5');
    assert.strictEqual(config.apiKey, 'openai-key');
  });

  it('uses Vertex config when STAGEHAND_MODEL_PROVIDER is vertex', () => {
    process.env.STAGEHAND_MODEL_PROVIDER = 'vertex';
    process.env.STAGEHAND_MODEL_NAME = 'vertex/gemini-3-flash-preview';
    process.env.GOOGLE_VERTEX_PROJECT = 'test-project';
    process.env.GOOGLE_VERTEX_LOCATION = 'us-central1';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/service-account.json';

    const config = getStagehandModelConfig();

    assert.strictEqual(config.provider, 'vertex');
    assert.strictEqual(config.modelName, 'vertex/gemini-3-flash-preview');
    assert.strictEqual(config.project, 'test-project');
    assert.strictEqual(config.location, 'us-central1');
    assert.strictEqual(config.keyFilename, '/tmp/service-account.json');
  });

  it('auto-selects Vertex when Vertex env exists and no model API key is set', () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'test-project';
    process.env.GOOGLE_VERTEX_LOCATION = 'global';

    const config = getStagehandModelConfig();

    assert.strictEqual(config.provider, 'vertex');
    assert.strictEqual(config.modelName, 'vertex/gemini-3-flash-preview');
    assert.strictEqual(config.project, 'test-project');
    assert.strictEqual(config.location, 'global');
  });

  it('requires the vertex prefix for explicit Vertex model names', () => {
    process.env.STAGEHAND_MODEL_PROVIDER = 'vertex';
    process.env.STAGEHAND_MODEL_NAME = 'gemini-3-flash-preview';

    assert.throws(
      () => getStagehandModelConfig(),
      (error: unknown) =>
        error instanceof BrowserSessionError &&
        error.message.includes('must use the vertex/ prefix'),
    );
  });

  it('explains both supported credential paths when no model config is available', () => {
    assert.throws(
      () => getStagehandModelConfig(),
      (error: unknown) =>
        error instanceof BrowserSessionError &&
        error.message.includes('STAGEHAND_MODEL_API_KEY') &&
        error.message.includes('STAGEHAND_MODEL_PROVIDER=vertex'),
    );
  });
});
