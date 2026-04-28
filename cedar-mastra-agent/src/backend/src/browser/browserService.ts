import {
  BrowserSessionRepository,
  createSupabaseBrowserSessionRepository,
} from './sessionRepository.js';
import {
  BrowserSessionCloseReason,
  BrowserSessionError,
  BrowserSessionState,
  BrowserTarget,
} from './types.js';

const BROWSERBASE_API_BASE = process.env.BROWSERBASE_API_BASE ?? 'https://api.browserbase.com/v1';
const DEGREE_NAVIGATOR_URL = 'https://dn.rutgers.edu/';
const ALLOWED_BROWSER_HOSTS = new Set([
  'dn.rutgers.edu',
  'degree-navigator.rutgers.edu',
  'cas.rutgers.edu',
  'idps.rutgers.edu',
  'weblogin.rutgers.edu',
]);
const BROWSER_REAPER_INTERVAL_MS = 10_000;
const BROWSER_REAPER_IDLE_CUTOFF_MS = 60_000;
const BROWSER_SESSION_TIMEOUT_SECONDS = 60 * 60;

let sessionRepository: BrowserSessionRepository = createSupabaseBrowserSessionRepository();

type BrowserActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
  needsConfirmation?: boolean;
  confirmationRequiredFor?: string;
};

export interface ProviderTerminationResult {
  terminated: boolean;
  method: string;
  terminationVerified: boolean;
  providerStillRunning: boolean;
  releaseStatus?: number;
  verifyStatus?: number;
  verifyProviderStatus?: BrowserSessionState['status'];
}

export interface CloseSessionWithPolicyInput {
  sessionId: string;
  ownerId: string;
  reason?: BrowserSessionCloseReason;
  allowUntracked?: boolean;
}

export interface CloseSessionWithPolicyResult {
  accepted: boolean;
  terminated: boolean;
  terminationMethod: string;
  terminationVerified?: boolean;
  providerStillRunning?: boolean;
  session: BrowserSessionState | null;
}

export function setBrowserSessionRepository(repository: BrowserSessionRepository): void {
  sessionRepository = repository;
}

export function resetBrowserSessionRepository(): void {
  sessionRepository = createSupabaseBrowserSessionRepository();
}

interface StagehandPageLike {
  goto?: (url: string, options?: { waitUntil?: string }) => Promise<void>;
  title?: () => Promise<string>;
  url?: () => string;
}

interface StagehandLike {
  init?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
  page?: StagehandPageLike;
  observe?: (input?: unknown) => Promise<unknown>;
  extract?: (input: unknown) => Promise<unknown>;
  act?: (input: unknown) => Promise<unknown>;
}

interface PlaywrightPageLike {
  goto: (url: string, options?: { waitUntil?: string }) => Promise<unknown>;
  title?: () => Promise<string>;
}

interface PlaywrightContextLike {
  pages: () => PlaywrightPageLike[];
  newPage: () => Promise<PlaywrightPageLike>;
}

interface PlaywrightBrowserLike {
  contexts: () => PlaywrightContextLike[];
  newContext: () => Promise<PlaywrightContextLike>;
  disconnect?: () => void;
  close: () => Promise<void>;
}

interface BrowserbaseRawResponse {
  ok: boolean;
  status: number;
  text: string;
  data: unknown;
}

type StagehandApiKeyModelConfig = {
  provider: 'apiKey';
  modelName: string;
  apiKey: string;
};

type StagehandVertexModelConfig = {
  provider: 'vertex';
  modelName: string;
  project: string;
  location: string;
  keyFilename?: string;
};

export type StagehandModelConfig = StagehandApiKeyModelConfig | StagehandVertexModelConfig;

let reaperTimer: ReturnType<typeof setInterval> | null = null;

function ensureBrowserbaseEnv(): { apiKey: string; projectId: string } {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      'Browserbase credentials are missing. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.',
    );
  }

  return { apiKey, projectId };
}

function mapProviderStatus(input: unknown): BrowserSessionState['status'] {
  if (typeof input !== 'string') {
    return 'awaiting_login';
  }

  const normalized = input.toLowerCase();

  if (normalized.includes('running') || normalized.includes('active')) {
    return 'ready';
  }
  if (
    normalized.includes('created') ||
    normalized.includes('pending') ||
    normalized.includes('queued') ||
    normalized.includes('starting')
  ) {
    return 'awaiting_login';
  }
  if (
    normalized.includes('complete') ||
    normalized.includes('timed_out') ||
    normalized.includes('timeout') ||
    normalized.includes('closed') ||
    normalized.includes('ended')
  ) {
    return 'closed';
  }

  if (normalized.includes('error') || normalized.includes('failed')) {
    return 'error';
  }

  return 'awaiting_login';
}

function isProviderTerminalStatus(status: BrowserSessionState['status']): boolean {
  return status === 'closed' || status === 'error';
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, unknown>;
}

function findString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = obj[key];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }

    const nested = asObject(direct);
    for (const nestedKey of ['id', 'url', 'liveViewUrl', 'debuggerFullscreenUrl']) {
      const value = nested[nestedKey];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

export function getStagehandModelConfig(): StagehandModelConfig {
  const provider = process.env.STAGEHAND_MODEL_PROVIDER?.toLowerCase();
  const apiKey = process.env.STAGEHAND_MODEL_API_KEY ?? process.env.OPENAI_API_KEY;
  const hasVertexEnv = Boolean(
    process.env.GOOGLE_VERTEX_PROJECT ||
      process.env.GOOGLE_VERTEX_LOCATION ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );

  if (provider && provider !== 'vertex' && provider !== 'apikey' && provider !== 'api-key') {
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Unsupported STAGEHAND_MODEL_PROVIDER "${provider}". Use "vertex" or omit it for API-key-backed models.`,
    );
  }

  if (provider === 'vertex' || (!provider && !apiKey && hasVertexEnv)) {
    const modelName = process.env.STAGEHAND_MODEL_NAME ?? 'vertex/gemini-3-flash-preview';
    if (!modelName.startsWith('vertex/')) {
      throw new BrowserSessionError(
        'BROWSER_PROVIDER_ERROR',
        'Stagehand Vertex model names must use the vertex/ prefix, for example STAGEHAND_MODEL_NAME=vertex/gemini-3-flash-preview.',
      );
    }

    return {
      provider: 'vertex',
      modelName,
      project: process.env.GOOGLE_VERTEX_PROJECT ?? 'concise-foundry-465822-d7',
      location: process.env.GOOGLE_VERTEX_LOCATION ?? 'global',
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    };
  }

  if (apiKey) {
    return {
      provider: 'apiKey',
      modelName: process.env.STAGEHAND_MODEL_NAME ?? 'gpt-4o-mini',
      apiKey,
    };
  }

  throw new BrowserSessionError(
    'BROWSER_PROVIDER_ERROR',
    [
      'Stagehand model credentials are missing for browser observe/extract/act tools.',
      'Set STAGEHAND_MODEL_API_KEY or OPENAI_API_KEY for API-key-backed models,',
      'or set STAGEHAND_MODEL_PROVIDER=vertex with GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION,',
      'and Application Default Credentials via GOOGLE_APPLICATION_CREDENTIALS locally or a Cloud Run service account.',
    ].join(' '),
  );
}

function applyStagehandModelConfig(
  stagehandConfig: Record<string, unknown>,
  modelConfig: StagehandModelConfig,
): void {
  if (modelConfig.provider === 'apiKey') {
    stagehandConfig.modelName = modelConfig.modelName;
    stagehandConfig.modelClientOptions = { apiKey: modelConfig.apiKey };
    return;
  }

  const model: Record<string, unknown> = {
    modelName: modelConfig.modelName,
    project: modelConfig.project,
    location: modelConfig.location,
  };

  if (modelConfig.keyFilename) {
    model.googleAuthOptions = { keyFilename: modelConfig.keyFilename };
  }

  stagehandConfig.experimental = true;
  stagehandConfig.model = model;
}

async function browserbaseRawRequest(path: string, init: RequestInit): Promise<BrowserbaseRawResponse> {
  const { apiKey } = ensureBrowserbaseEnv();

  const response = await fetch(`${BROWSERBASE_API_BASE}${path}`, {
    ...init,
    headers: {
      'x-bb-api-key': apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    data,
  };
}

async function browserbaseRequest(path: string, init: RequestInit): Promise<unknown> {
  const response = await browserbaseRawRequest(path, init);

  if (!response.ok) {
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Browserbase API error (${response.status}) from ${BROWSERBASE_API_BASE}: ${response.text || 'No body returned'}`,
    );
  }

  return response.data;
}

function deriveLiveViewUrl(sessionId: string, responseData: unknown): string {
  const payload = asObject(responseData);
  const payloadData = asObject(payload.data);

  const candidateContainers: Array<Record<string, unknown>> = [
    payload,
    payloadData,
    asObject(payload.session),
    asObject(payloadData.session),
    asObject(payload.liveUrls),
    asObject(payloadData.liveUrls),
    asObject(payload.live_urls),
    asObject(payloadData.live_urls),
  ];

  const extracted = candidateContainers
    .map((container) =>
      findString(container, [
        'liveViewUrl',
        'live_view_url',
        'liveURL',
        'liveUrl',
        'viewUrl',
        'debuggerFullscreenUrl',
        'debugger_fullscreen_url',
        'debuggerUrl',
        'debugger_url',
        'inspectorUrl',
        'inspector_url',
        'url',
      ]),
    )
    .find((value): value is string => !!value && /^https?:\/\//i.test(value));

  if (extracted) {
    return extracted;
  }

  return `https://www.browserbase.com/sessions/${sessionId}`;
}

function isBareBrowserbaseSessionPage(url: string, sessionId: string): boolean {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    return (
      parsed.hostname === 'www.browserbase.com' &&
      normalizedPath === `/sessions/${sessionId}` &&
      !parsed.search
    );
  } catch {
    return false;
  }
}

function extractDebugLiveViewUrl(responseData: unknown): string | null {
  const payload = asObject(responseData);
  const direct = findString(payload, ['debuggerFullscreenUrl', 'debugger_fullscreen_url']);
  if (direct && /^https?:\/\//i.test(direct)) {
    return direct;
  }

  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  for (const page of pages) {
    const pageObject = asObject(page);
    const pageUrl = findString(pageObject, ['debuggerFullscreenUrl', 'debugger_fullscreen_url']);
    if (pageUrl && /^https?:\/\//i.test(pageUrl)) {
      return pageUrl;
    }
  }

  return null;
}

function extractConnectUrl(responseData: unknown): string | null {
  const payload = asObject(responseData);
  return (
    findString(payload, ['connectUrl', 'connect_url']) ??
    findString(asObject(payload.data), ['connectUrl', 'connect_url'])
  );
}

function isEmbeddableLiveViewUrl(url: string, sessionId: string): boolean {
  return /^https?:\/\//i.test(url) && !isBareBrowserbaseSessionPage(url, sessionId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function resolveEmbeddableLiveViewUrl(sessionId: string, createPayload: unknown): Promise<string> {
  const initialLiveView = deriveLiveViewUrl(sessionId, createPayload);
  if (isEmbeddableLiveViewUrl(initialLiveView, sessionId)) {
    return initialLiveView;
  }

  const detailedSession = await browserbaseRequest(`/sessions/${sessionId}`, {
    method: 'GET',
  }).catch(() => null);

  if (detailedSession) {
    const detailedLiveView = deriveLiveViewUrl(sessionId, detailedSession);
    if (isEmbeddableLiveViewUrl(detailedLiveView, sessionId)) {
      return detailedLiveView;
    }
  }

  const maxDebugAttempts = 6;
  for (let attempt = 0; attempt < maxDebugAttempts; attempt += 1) {
    const debugPayload = await browserbaseRequest(`/sessions/${sessionId}/debug`, {
      method: 'GET',
    }).catch(() => null);

    if (debugPayload) {
      const debugUrl = extractDebugLiveViewUrl(debugPayload);
      if (debugUrl && isEmbeddableLiveViewUrl(debugUrl, sessionId)) {
        return debugUrl;
      }
    }

    if (attempt < maxDebugAttempts - 1) {
      await sleep(500);
    }
  }

  throw new BrowserSessionError(
    'BROWSER_PROVIDER_ERROR',
    `Created Browserbase session ${sessionId} but could not resolve an embeddable live view URL from /sessions/{id}/debug.`,
  );
}

function validateTarget(target: BrowserTarget): BrowserTarget {
  if (target !== 'degree_navigator') {
    throw new BrowserSessionError('INVALID_BROWSER_TARGET', `Unsupported browser target: ${target}`);
  }

  return target;
}

function targetDefaultUrl(target: BrowserTarget): string {
  switch (target) {
    case 'degree_navigator':
      return DEGREE_NAVIGATOR_URL;
    default:
      return DEGREE_NAVIGATOR_URL;
  }
}

function assertAllowedBrowserUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BrowserSessionError('INVALID_BROWSER_URL', `Invalid browser URL: ${url}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new BrowserSessionError('INVALID_BROWSER_URL', 'Browser navigation only supports HTTPS URLs.');
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_BROWSER_HOSTS.has(host) || host.endsWith('.rutgers.edu');
  if (!isAllowed) {
    throw new BrowserSessionError('INVALID_BROWSER_URL', `Browser navigation is not allowed for host ${host}.`);
  }
}

function isCloseRecoverableError(error: unknown): boolean {
  if (!(error instanceof BrowserSessionError)) {
    return false;
  }

  return (
    error.code === 'SESSION_NOT_FOUND' ||
    error.code === 'SESSION_EXPIRED' ||
    error.code === 'SESSION_OWNERSHIP_MISMATCH'
  );
}

const importModule = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

async function withStagehand<T>(
  sessionId: string,
  action: (stagehand: StagehandLike) => Promise<T>,
): Promise<T> {
  const { apiKey, projectId } = ensureBrowserbaseEnv();

  let stagehand: StagehandLike | null = null;
  try {
    const stagehandModule = (await importModule('@browserbasehq/stagehand')) as Record<string, unknown>;
    const Stagehand =
      stagehandModule.Stagehand ??
      (stagehandModule.default as { Stagehand?: unknown } | undefined)?.Stagehand ??
      stagehandModule.default;

    if (!Stagehand || typeof Stagehand !== 'function') {
      throw new BrowserSessionError(
        'BROWSER_PROVIDER_ERROR',
        'Stagehand module loaded but Stagehand constructor was not found.',
      );
    }

    const stagehandConfig: Record<string, unknown> = {
      env: 'BROWSERBASE',
      apiKey,
      projectId,
      browserbaseSessionID: sessionId,
    };

    applyStagehandModelConfig(stagehandConfig, getStagehandModelConfig());

    stagehand = new (Stagehand as new (config: Record<string, unknown>) => StagehandLike)(stagehandConfig);
    if (typeof stagehand.init === 'function') {
      await stagehand.init();
    }

    return await action(stagehand);
  } catch (error) {
    if (error instanceof BrowserSessionError) {
      throw error;
    }

    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Stagehand execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  } finally {
    if (stagehand && typeof stagehand.close === 'function') {
      await stagehand.close().catch(() => undefined);
    }
  }
}

async function stagehandNavigate(sessionId: string, url: string): Promise<{ url: string; title?: string }> {
  return withStagehand(sessionId, async (stagehand) => {
    const page = stagehand.page;
    if (!page || typeof page.goto !== 'function') {
      throw new BrowserSessionError(
        'BROWSER_PROVIDER_ERROR',
        'Stagehand page.goto is unavailable for this session.',
      );
    }

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const title = typeof page.title === 'function' ? await page.title() : undefined;
    return { url, title };
  });
}

async function playwrightNavigate(connectUrl: string, url: string): Promise<{ url: string; title?: string }> {
  let browser: PlaywrightBrowserLike | null = null;

  try {
    const playwrightModule = (await importModule('playwright-core')) as {
      chromium?: {
        connectOverCDP?: (endpointURL: string) => Promise<PlaywrightBrowserLike>;
      };
    };
    const chromium = playwrightModule.chromium;
    if (!chromium || typeof chromium.connectOverCDP !== 'function') {
      throw new BrowserSessionError(
        'BROWSER_PROVIDER_ERROR',
        'Playwright chromium.connectOverCDP is unavailable for Browserbase navigation.',
      );
    }

    browser = await chromium.connectOverCDP(connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const title = typeof page.title === 'function' ? await page.title() : undefined;
    return { url, title };
  } catch (error) {
    if (error instanceof BrowserSessionError) {
      throw error;
    }

    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Playwright navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  } finally {
    if (browser) {
      if (typeof browser.disconnect === 'function') {
        browser.disconnect();
      } else {
        await browser.close().catch(() => undefined);
      }
    }
  }
}

async function stagehandObserve(sessionId: string, instruction?: string): Promise<unknown> {
  return withStagehand(sessionId, async (stagehand) => {
    if (typeof stagehand.observe === 'function') {
      return stagehand.observe(instruction ? { instruction } : undefined);
    }

    const page = stagehand.page;
    if (!page) {
      return { notice: 'Stagehand observe unavailable and no page object found.' };
    }

    const pageUrl = typeof page.url === 'function' ? page.url() : undefined;
    const title = typeof page.title === 'function' ? await page.title() : undefined;

    return {
      url: pageUrl,
      title,
      notice: instruction
        ? `Observe fallback executed. Instruction not interpreted directly: ${instruction}`
        : 'Observe fallback executed.',
    };
  });
}

async function stagehandExtract(sessionId: string, instruction: string): Promise<unknown> {
  return withStagehand(sessionId, async (stagehand) => {
    if (typeof stagehand.extract === 'function') {
      try {
        return await stagehand.extract({ instruction });
      } catch {
        return stagehand.extract(instruction);
      }
    }

    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      'Stagehand extract capability is unavailable for this runtime.',
    );
  });
}

async function stagehandAct(sessionId: string, action: string): Promise<unknown> {
  return withStagehand(sessionId, async (stagehand) => {
    if (typeof stagehand.act === 'function') {
      try {
        return await stagehand.act({ action });
      } catch {
        return stagehand.act(action);
      }
    }

    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      'Stagehand act capability is unavailable for this runtime.',
    );
  });
}

export async function createSession(target: BrowserTarget, ownerId: string): Promise<BrowserSessionState> {
  const resolvedTarget = validateTarget(target);
  const { projectId } = ensureBrowserbaseEnv();
  await sessionRepository.assertReady?.();

  const providerData = await browserbaseRequest('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      keepAlive: true,
      timeout: BROWSER_SESSION_TIMEOUT_SECONDS,
      userMetadata: {
        target: resolvedTarget,
        ownerId,
      },
    }),
  });

  const payload = asObject(providerData);
  const sessionId =
    findString(payload, ['id', 'sessionId', 'session_id']) ??
    findString(asObject(payload.data), ['id', 'sessionId', 'session_id']);

  if (!sessionId) {
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      'Browserbase create session response did not include a session ID.',
    );
  }

  const status = mapProviderStatus(payload.status ?? asObject(payload.data).status);
  let session: BrowserSessionState;
  try {
    session = await sessionRepository.create({
      provider: 'browserbase',
      sessionId,
      liveViewUrl: deriveLiveViewUrl(sessionId, payload),
      target: resolvedTarget,
      status,
      ownerId,
    });
  } catch (error) {
    await terminateProviderSession(sessionId).catch((terminationError) => {
      console.warn('[browser] failed to release session after repository create error', {
        sessionId,
        ownerId,
        error: terminationError instanceof Error ? terminationError.message : terminationError,
      });
    });
    throw error;
  }

  const connectUrl = extractConnectUrl(payload);
  if (!connectUrl) {
    const termination = await terminateProviderSession(sessionId).catch(() => null);
    if (termination?.terminated) {
      await sessionRepository.markClosed(sessionId, {
        reason: 'manual_stop',
        terminationMethod: termination.method,
        terminationVerified: termination.terminationVerified,
        providerStillRunning: termination.providerStillRunning,
      });
    }
    console.warn('[browser] created session without connectUrl', {
      sessionId,
      ownerId,
      termination,
    });
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Created Browserbase session ${sessionId}, but the create response did not include a connectUrl.`,
    );
  }

  try {
    await playwrightNavigate(connectUrl, targetDefaultUrl(resolvedTarget));
    const liveViewUrl = await resolveEmbeddableLiveViewUrl(sessionId, payload);
    session = await sessionRepository.create({
      provider: 'browserbase',
      sessionId,
      liveViewUrl,
      target: resolvedTarget,
      status,
      ownerId,
    });
  } catch (error) {
    const termination = await terminateProviderSession(sessionId).catch((terminationError) => {
      console.warn('[browser] failed to release session after launch error', {
        sessionId,
        ownerId,
        error: terminationError instanceof Error ? terminationError.message : terminationError,
      });
      return null;
    });
    if (termination?.terminated) {
      await sessionRepository.markClosed(sessionId, {
        reason: 'manual_stop',
        terminationMethod: termination.method,
        terminationVerified: termination.terminationVerified,
        providerStillRunning: termination.providerStillRunning,
      });
    }
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Created Browserbase session ${sessionId}, but failed to open ${targetDefaultUrl(
        resolvedTarget,
      )}. ${error instanceof Error ? error.message : 'Unknown browser navigation error'}`,
    );
  }

  return sessionRepository.touch(session.sessionId, ownerId, 'awaiting_login');
}

export async function terminateProviderSession(sessionId: string): Promise<ProviderTerminationResult> {
  const { projectId } = ensureBrowserbaseEnv();
  const releaseAttempt = await browserbaseRawRequest(`/sessions/${sessionId}`, {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      status: 'REQUEST_RELEASE',
    }),
  });

  if (releaseAttempt.ok) {
    return {
      terminated: true,
      method: 'request_release',
      terminationVerified: true,
      providerStillRunning: false,
      releaseStatus: releaseAttempt.status,
    };
  }

  const verifyAttempt = await browserbaseRawRequest(`/sessions/${sessionId}`, {
    method: 'GET',
  });

  if (verifyAttempt.status === 404) {
    return {
      terminated: true,
      method: 'verified_closed_not_found',
      terminationVerified: true,
      providerStillRunning: false,
      releaseStatus: releaseAttempt.status,
      verifyStatus: verifyAttempt.status,
    };
  }

  if (verifyAttempt.ok) {
    const payload = asObject(verifyAttempt.data);
    const providerStatus = mapProviderStatus(payload.status ?? asObject(payload.data).status);
    if (isProviderTerminalStatus(providerStatus)) {
      return {
        terminated: true,
        method: 'verified_closed_status',
        terminationVerified: true,
        providerStillRunning: false,
        releaseStatus: releaseAttempt.status,
        verifyStatus: verifyAttempt.status,
        verifyProviderStatus: providerStatus,
      };
    }

    return {
      terminated: false,
      method: 'still_running',
      terminationVerified: true,
      providerStillRunning: true,
      releaseStatus: releaseAttempt.status,
      verifyStatus: verifyAttempt.status,
      verifyProviderStatus: providerStatus,
    };
  }

  return {
    terminated: false,
    method: 'unable_to_verify',
    terminationVerified: false,
    providerStillRunning: true,
    releaseStatus: releaseAttempt.status,
    verifyStatus: verifyAttempt.status,
  };
}

export async function closeSessionWithPolicy(
  input: CloseSessionWithPolicyInput,
): Promise<CloseSessionWithPolicyResult> {
  const allowUntracked = input.allowUntracked ?? false;

  let trackedSession: BrowserSessionState | null = null;
  try {
    trackedSession = await sessionRepository.getOwned(input.sessionId, input.ownerId);
  } catch (error) {
    const code = error instanceof BrowserSessionError ? error.code : null;
    const isStrictOwnershipError = code === 'SESSION_OWNERSHIP_MISMATCH' && !allowUntracked;
    if (isStrictOwnershipError || !isCloseRecoverableError(error)) {
      throw error;
    }
  }

  try {
    if (trackedSession) {
      await sessionRepository.markClosing(input.sessionId, input.ownerId, input.reason);
    }
  } catch (error) {
    if (error instanceof BrowserSessionError && error.code === 'SESSION_CLOSE_IN_PROGRESS') {
      return {
        accepted: true,
        terminated: false,
        terminationMethod: 'in_progress',
        session: null,
      };
    }
    throw error;
  }

  try {
    const termination = await terminateProviderSession(input.sessionId);

    let closedSession: BrowserSessionState | null = null;
    if (trackedSession && termination.terminated) {
      closedSession = await sessionRepository.markClosed(input.sessionId, {
        reason: input.reason,
        terminationMethod: termination.method,
        terminationVerified: termination.terminationVerified,
        providerStillRunning: termination.providerStillRunning,
      });
    } else if (trackedSession && !termination.terminated) {
      closedSession = await sessionRepository.touch(input.sessionId, input.ownerId, trackedSession.status);
    }

    console.info('[browser] closeSessionWithPolicy', {
      sessionId: input.sessionId,
      ownerId: input.ownerId,
      reason: input.reason ?? 'unspecified',
      allowUntracked,
      terminated: termination.terminated,
      method: termination.method,
      terminationVerified: termination.terminationVerified,
      providerStillRunning: termination.providerStillRunning,
      releaseStatus: termination.releaseStatus,
      verifyStatus: termination.verifyStatus,
      verifyProviderStatus: termination.verifyProviderStatus,
      hadTrackedSession: !!trackedSession,
    });

    if (!trackedSession && termination.terminated) {
      console.warn('[browser] provider session terminated without local tracking', {
        sessionId: input.sessionId,
        ownerId: input.ownerId,
        reason: input.reason ?? 'unspecified',
        method: termination.method,
      });
    }

    return {
      accepted: termination.terminated,
      terminated: termination.terminated,
      terminationMethod: termination.method,
      terminationVerified: termination.terminationVerified,
      providerStillRunning: termination.providerStillRunning,
      session: closedSession,
    };
  } finally {
    if (trackedSession) {
      await sessionRepository.unmarkClosing(input.sessionId);
    }
  }
}

export async function closeSession(sessionId: string, ownerId: string): Promise<BrowserSessionState> {
  const result = await closeSessionWithPolicy({
    sessionId,
    ownerId,
    reason: 'manual_stop',
    allowUntracked: false,
  });

  if (!result.terminated) {
    throw new BrowserSessionError(
      'BROWSER_PROVIDER_ERROR',
      `Browser provider did not confirm termination for session ${sessionId}.`,
    );
  }

  if (!result.session) {
    throw new BrowserSessionError('SESSION_NOT_FOUND', `Session ${sessionId} was not found.`);
  }

  return result.session;
}

export async function getSession(sessionId: string, ownerId: string): Promise<BrowserSessionState> {
  const current = await sessionRepository.getOwned(sessionId, ownerId);

  const providerStatus = await browserbaseRequest(`/sessions/${sessionId}`, {
    method: 'GET',
  })
    .then((result) => {
      const payload = asObject(result);
      return mapProviderStatus(payload.status ?? asObject(payload.data).status);
    })
    .catch(() => current.status);

  if (providerStatus === 'closed') {
    const closed: BrowserSessionState = {
      ...current,
      status: 'closed',
      lastHeartbeatAt: new Date().toISOString(),
    };
    await sessionRepository.markClosed(sessionId, {
      reason: 'manual_stop',
      terminationMethod: 'provider_status_closed',
      terminationVerified: true,
      providerStillRunning: false,
    });
    return closed;
  }

  return sessionRepository.updateStatus(sessionId, ownerId, providerStatus);
}

export function touchSession(sessionId: string, ownerId: string): Promise<BrowserSessionState> {
  return sessionRepository.touch(sessionId, ownerId);
}

export async function runBrowserSessionReaperTick(nowMs = Date.now()): Promise<number> {
  const expiredSessions = await sessionRepository.listExpired(nowMs, BROWSER_REAPER_IDLE_CUTOFF_MS);

  let closedCount = 0;
  for (const session of expiredSessions) {
    try {
      const result = await closeSessionWithPolicy({
        sessionId: session.sessionId,
        ownerId: session.ownerId,
        allowUntracked: true,
        reason: 'reaper',
      });

      if (result.terminated) {
        closedCount += 1;
      }
    } catch (error) {
      console.warn('[browser] reaper close failed', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return closedCount;
}

export function startBrowserSessionReaper(): void {
  if (reaperTimer) {
    return;
  }

  reaperTimer = setInterval(() => {
    runBrowserSessionReaperTick().catch((error) => {
      console.warn('[browser] reaper tick failed', error);
    });
  }, BROWSER_REAPER_INTERVAL_MS);

  if (typeof reaperTimer.unref === 'function') {
    reaperTimer.unref();
  }
}

export function stopBrowserSessionReaper(): void {
  if (!reaperTimer) {
    return;
  }

  clearInterval(reaperTimer);
  reaperTimer = null;
}

export async function runNavigate(
  sessionId: string,
  ownerId: string,
  url: string,
): Promise<BrowserActionResult> {
  assertAllowedBrowserUrl(url);
  await sessionRepository.getOwned(sessionId, ownerId);
  const data = await stagehandNavigate(sessionId, url);
  await sessionRepository.updateStatus(sessionId, ownerId, 'ready');

  return {
    success: true,
    message: `Navigated to ${url}`,
    data,
  };
}

export async function runObserve(
  sessionId: string,
  ownerId: string,
  instruction?: string,
): Promise<BrowserActionResult> {
  await sessionRepository.getOwned(sessionId, ownerId);
  const data = await stagehandObserve(sessionId, instruction);
  await sessionRepository.updateStatus(sessionId, ownerId, 'ready');

  return {
    success: true,
    message: 'Observation completed.',
    data,
  };
}

export async function runExtract(
  sessionId: string,
  ownerId: string,
  instruction: string,
): Promise<BrowserActionResult> {
  await sessionRepository.getOwned(sessionId, ownerId);
  const data = await stagehandExtract(sessionId, instruction);
  await sessionRepository.updateStatus(sessionId, ownerId, 'ready');

  return {
    success: true,
    message: 'Extraction completed.',
    data,
  };
}

export async function runAct(
  sessionId: string,
  ownerId: string,
  action: string,
): Promise<BrowserActionResult> {
  await sessionRepository.getOwned(sessionId, ownerId);
  const data = await stagehandAct(sessionId, action);
  await sessionRepository.updateStatus(sessionId, ownerId, 'ready');

  return {
    success: true,
    message: `Action executed: ${action}`,
    data,
  };
}
