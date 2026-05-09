import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert';

import {
  AnonymousChatQuotaExceededError,
  anonymousChatOwner,
  authenticatedChatOwner,
  appendChatMessage,
  claimAnonymousChatMessage,
  createChatThread,
  deleteChatThread,
  getOrCreateAnonymousChatThread,
  getChatThreadWithMessages,
  listChatThreads,
  renameChatThread,
  setChatHistorySupabaseClientFactoryForTest,
} from '../chat/repository.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ANONYMOUS_CLIENT_ID = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

function createId(prefix: number): string {
  return `00000000-0000-4000-8000-${String(prefix).padStart(12, '0')}`;
}

function createSupabaseClient() {
  const threads: Row[] = [];
  const messages: Row[] = [];
  const anonymousClients: Row[] = [];
  const anonymousUsage: Row[] = [];
  let idCounter = 1;
  let timestampCounter = 1;

  const now = () => `2026-05-06T22:10:${String(timestampCounter++).padStart(2, '0')}.000Z`;

  class Query {
    private filters: Array<{ column: string; value: unknown }> = [];
    private nullFilters: string[] = [];
    private orderColumn: string | null = null;
    private ascending = true;
    private limitCount: number | null = null;
    private insertPayload: Row | Row[] | null = null;
    private upsertPayload: Row | null = null;
    private updatePayload: Row | null = null;

    constructor(private table: string) {}

    insert(payload: Row | Row[]) {
      this.insertPayload = payload;
      return this;
    }

    upsert(payload: Row) {
      this.upsertPayload = payload;
      return this;
    }

    update(payload: Row) {
      this.updatePayload = payload;
      return this;
    }

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ column, value });
      return this;
    }

    is(column: string, value: unknown) {
      if (value === null) {
        this.nullFilters.push(column);
      }
      return this;
    }

    order(column: string, options: { ascending?: boolean } = {}) {
      this.orderColumn = column;
      this.ascending = options.ascending ?? true;
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    async single() {
      const result = await this.execute();
      return {
        data: Array.isArray(result.data) ? result.data[0] : result.data,
        error: result.error,
      };
    }

    async maybeSingle() {
      const result = await this.execute();
      return {
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
        error: result.error,
      };
    }

    then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private rows() {
      if (this.table === 'chat_threads') return threads;
      if (this.table === 'chat_messages') return messages;
      if (this.table === 'anonymous_chat_clients') return anonymousClients;
      if (this.table === 'anonymous_chat_daily_usage') return anonymousUsage;
      throw new Error(`Unexpected table ${this.table}`);
    }

    private matches(row: Row) {
      return (
        this.filters.every(({ column, value }) => row[column] === value) &&
        this.nullFilters.every((column) => row[column] === null)
      );
    }

    private async execute(): Promise<{ data: Row[]; error: null }> {
      const rows = this.rows();

      if (this.upsertPayload) {
        const keyColumns =
          this.table === 'anonymous_chat_daily_usage'
            ? ['client_id', 'usage_date']
            : ['id'];
        const existing = rows.find((row) =>
          keyColumns.every((column) => row[column] === this.upsertPayload?.[column]),
        );
        if (existing) {
          Object.assign(existing, this.upsertPayload);
          return { data: [existing], error: null };
        }

        const row = {
          token_version: 1,
          revoked_at: null,
          message_count: 0,
          created_at: now(),
          updated_at: now(),
          ...this.upsertPayload,
        };
        rows.push(row);
        return { data: [row], error: null };
      }

      if (this.insertPayload) {
        const payloads = Array.isArray(this.insertPayload)
          ? this.insertPayload
          : [this.insertPayload];
        const inserted = payloads.map((payload) => {
          const row =
            this.table === 'chat_threads'
              ? {
                  id: createId(idCounter++),
                  user_id: null,
                  anonymous_client_id: null,
                  title: 'New chat',
                  last_message_preview: null,
                  last_message_at: null,
                  metadata: {},
                  archived_at: null,
                  deleted_at: null,
                  created_at: now(),
                  updated_at: now(),
                  ...payload,
                }
              : this.table === 'chat_messages'
                ? {
                  id: createId(idCounter++),
                  user_id: null,
                  anonymous_client_id: null,
                  metadata: {},
                  created_at: now(),
                  ...payload,
                }
                : {
                    id: (payload.id as string | undefined) ?? createId(idCounter++),
                    token_version: 1,
                    revoked_at: null,
                    created_at: now(),
                    updated_at: now(),
                    ...payload,
                  };
          rows.push(row);
          return row;
        });
        return { data: inserted, error: null };
      }

      if (this.updatePayload) {
        const updated = rows
          .filter((row) => this.matches(row))
          .map((row) => {
            Object.assign(row, this.updatePayload);
            if (this.table === 'chat_threads') {
              row.updated_at = now();
            }
            return row;
          });
        return { data: updated, error: null };
      }

      let data = rows.filter((row) => this.matches(row));
      if (this.orderColumn) {
        data = [...data].sort((left, right) => {
          const a = left[this.orderColumn as string] as string | number | null;
          const b = right[this.orderColumn as string] as string | number | null;
          if (a === b) return 0;
          if (a === null) return 1;
          if (b === null) return -1;
          return (a > b ? 1 : -1) * (this.ascending ? 1 : -1);
        });
      }
      if (this.limitCount !== null) {
        data = data.slice(0, this.limitCount);
      }
      return { data, error: null };
    }
  }

  return {
    client: {
      from(table: string) {
        assert.ok(
          table === 'chat_threads' ||
            table === 'chat_messages' ||
            table === 'anonymous_chat_clients' ||
            table === 'anonymous_chat_daily_usage',
        );
        return new Query(table);
      },
      async rpc(name: string, args: Record<string, unknown>) {
        assert.strictEqual(name, 'claim_anonymous_chat_message');
        const clientId = args.p_client_id as string;
        const dailyLimit = args.p_daily_limit as number;
        const usageDate = new Date().toISOString().slice(0, 10);
        const existingClient = anonymousClients.find((row) => row.id === clientId);
        if (!existingClient) {
          anonymousClients.push({
            id: clientId,
            token_version: 1,
            revoked_at: null,
            created_at: now(),
            last_seen_at: now(),
          });
        }

        let usage = anonymousUsage.find(
          (row) => row.client_id === clientId && row.usage_date === usageDate,
        );
        if (!usage) {
          usage = {
            client_id: clientId,
            usage_date: usageDate,
            message_count: 0,
            created_at: now(),
            updated_at: now(),
          };
          anonymousUsage.push(usage);
        }

        const currentCount = usage.message_count as number;
        const allowed = currentCount < dailyLimit;
        if (allowed) {
          usage.message_count = currentCount + 1;
        }

        const messageCount = usage.message_count as number;
        return {
          data: [
            {
              allowed,
              message_count: messageCount,
              daily_limit: dailyLimit,
              remaining: Math.max(dailyLimit - messageCount, 0),
              usage_date: usageDate,
            },
          ],
          error: null,
        };
      },
    },
  };
}

describe('chat history repository', () => {
  afterEach(() => {
    setChatHistorySupabaseClientFactoryForTest(null);
  });

  it('creates, lists, loads, renames, and soft-deletes user chat threads', async () => {
    const supabase = createSupabaseClient();
    setChatHistorySupabaseClientFactoryForTest(() => supabase.client as never);
    const owner = authenticatedChatOwner(USER_ID);

    const thread = await createChatThread(owner);
    await appendChatMessage(owner, thread.id, {
      id: 'user-message-1',
      role: 'user',
      parts: [{ type: 'text', text: 'What is CS 111?' }],
    });
    await appendChatMessage(owner, thread.id, {
      id: 'assistant-message-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'CS 111 is Intro Computer Science.' }],
    });
    await appendChatMessage(owner, thread.id, {
      id: 'assistant-message-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'CS 111 is Intro Computer Science.' }],
    });

    const listed = await listChatThreads(owner);
    const loaded = await getChatThreadWithMessages(owner, thread.id);
    const renamed = await renameChatThread(owner, thread.id, 'Course planning');
    const deleted = await deleteChatThread(owner, thread.id);
    const afterDelete = await listChatThreads(owner);

    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].title, 'What is CS 111?');
    assert.strictEqual(loaded.messages.length, 2);
    assert.strictEqual(loaded.messages[0].sequenceIndex, 0);
    assert.strictEqual(loaded.messages[1].sequenceIndex, 1);
    assert.strictEqual(renamed.title, 'Course planning');
    assert.strictEqual(deleted, true);
    assert.strictEqual(afterDelete.length, 0);
  });

  it('keeps anonymous chat history isolated from authenticated users', async () => {
    const supabase = createSupabaseClient();
    setChatHistorySupabaseClientFactoryForTest(() => supabase.client as never);

    const anonymousOwner = anonymousChatOwner(ANONYMOUS_CLIENT_ID);
    const authenticatedOwner = authenticatedChatOwner(USER_ID);
    const anonymousThread = await getOrCreateAnonymousChatThread(ANONYMOUS_CLIENT_ID);

    await appendChatMessage(anonymousOwner, anonymousThread.id, {
      id: 'anonymous-user-message-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Can I take CS 111?' }],
    });

    const anonymousThreads = await listChatThreads(anonymousOwner);
    const authenticatedThreads = await listChatThreads(authenticatedOwner);
    const anonymousLoaded = await getChatThreadWithMessages(anonymousOwner, anonymousThread.id);

    assert.strictEqual(anonymousThreads.length, 1);
    assert.strictEqual(authenticatedThreads.length, 0);
    assert.strictEqual(anonymousLoaded.messages.length, 1);
    assert.strictEqual(anonymousLoaded.thread.anonymousClientId, ANONYMOUS_CLIENT_ID);
  });

  it('claims anonymous quota atomically and rejects over-limit usage', async () => {
    const supabase = createSupabaseClient();
    setChatHistorySupabaseClientFactoryForTest(() => supabase.client as never);

    const firstClaim = await claimAnonymousChatMessage(ANONYMOUS_CLIENT_ID, 1);

    assert.strictEqual(firstClaim.allowed, true);
    assert.strictEqual(firstClaim.remaining, 0);
    await assert.rejects(
      () => claimAnonymousChatMessage(ANONYMOUS_CLIENT_ID, 1),
      AnonymousChatQuotaExceededError,
    );
  });
});
