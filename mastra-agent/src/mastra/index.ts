import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

import { socAgent } from './agents/soc-agent.js';

export const mastra = new Mastra({
  agents: { socAgent },
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage
    // change to file:../mastra.db to persist data
    url: ':memory:',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: {
    default: { enabled: true },
  },
});
