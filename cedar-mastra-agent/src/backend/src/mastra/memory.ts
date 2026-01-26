import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

const storage = new LibSQLStore({
  // Use in-memory storage for ephemeral memory (cleared on process exit)
  url: ':memory:',
});

export const memory = new Memory({
  options: {
    lastMessages: 5,
  },
  storage,
});

export { storage };
