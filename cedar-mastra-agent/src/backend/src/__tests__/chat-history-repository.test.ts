import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert';

import {
  appendChatMessage,
  createChatThread,
  deleteChatThread,
  getChatThreadWithMessages,
  listChatThreads,
  renameChatThread,
  setChatHistorySupabaseClientFactoryForTest,
} from '../chat/repository.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;

function createId(prefix: number): string {
  return `00000000-0000-4000-8000-${String(prefix).padStart(12, '0')}`;
}

function createSupabaseClient() {
  const threads: Row[] = [];
  const messages: Row[] = [];
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
    private updatePayload: Row | null = null;

    constructor(private table: string) {}

    insert(payload: Row | Row[]) {
      this.insertPayload = payload;
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
      return this.table === 'chat_threads' ? threads : messages;
    }

    private matches(row: Row) {
      return (
        this.filters.every(({ column, value }) => row[column] === value) &&
        this.nullFilters.every((column) => row[column] === null)
      );
    }

    private async execute(): Promise<{ data: Row[]; error: null }> {
      const rows = this.rows();

      if (this.insertPayload) {
        const payloads = Array.isArray(this.insertPayload)
          ? this.insertPayload
          : [this.insertPayload];
        const inserted = payloads.map((payload) => {
          const row =
            this.table === 'chat_threads'
              ? {
                  id: createId(idCounter++),
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
              : {
                  id: createId(idCounter++),
                  metadata: {},
                  created_at: now(),
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
        assert.ok(table === 'chat_threads' || table === 'chat_messages');
        return new Query(table);
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

    const thread = await createChatThread(USER_ID);
    await appendChatMessage(USER_ID, thread.id, {
      id: 'user-message-1',
      role: 'user',
      parts: [{ type: 'text', text: 'What is CS 111?' }],
    });
    await appendChatMessage(USER_ID, thread.id, {
      id: 'assistant-message-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'CS 111 is Intro Computer Science.' }],
    });
    await appendChatMessage(USER_ID, thread.id, {
      id: 'assistant-message-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'CS 111 is Intro Computer Science.' }],
    });

    const listed = await listChatThreads(USER_ID);
    const loaded = await getChatThreadWithMessages(USER_ID, thread.id);
    const renamed = await renameChatThread(USER_ID, thread.id, 'Course planning');
    const deleted = await deleteChatThread(USER_ID, thread.id);
    const afterDelete = await listChatThreads(USER_ID);

    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].title, 'What is CS 111?');
    assert.strictEqual(loaded.messages.length, 2);
    assert.strictEqual(loaded.messages[0].sequenceIndex, 0);
    assert.strictEqual(loaded.messages[1].sequenceIndex, 1);
    assert.strictEqual(renamed.title, 'Course planning');
    assert.strictEqual(deleted, true);
    assert.strictEqual(afterDelete.length, 0);
  });
});
