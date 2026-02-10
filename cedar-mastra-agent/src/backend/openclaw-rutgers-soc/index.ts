import { createSocTools } from './src/tools.js';

type OpenClawPluginApi = {
  registerTool: (tool: unknown, opts?: { optional?: boolean }) => void;
  logger?: {
    debug?: (message: string) => void;
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
  pluginConfig?: Record<string, unknown>;
};

export default function register(api: OpenClawPluginApi) {
  const tools = createSocTools(api);
  for (const tool of tools) {
    api.registerTool(tool, { optional: true });
  }
  api.logger?.debug?.(`rutgers-soc: registered ${tools.length} tools`);
}
