import type { BenchmarkFrameworkAdapter } from './types.js';
import { NativeFrameworkAdapter } from './nativeAdapter.js';
import { PiFrameworkAdapter } from './piAdapter.js';
import { OpenCodeFrameworkAdapter } from './openCodeAdapter.js';
import { ClaudeCodeFrameworkAdapter } from './claudeCodeAdapter.js';
import { HermesFrameworkAdapter } from './hermesAdapter.js';
import { OpenClawFrameworkAdapter } from './openClawAdapter.js';
import { GenericFrameworkAdapter } from './genericAdapter.js';

export * from './types.js';
export * from './nativeAdapter.js';
export * from './piAdapter.js';
export * from './openCodeAdapter.js';
export * from './claudeCodeAdapter.js';
export * from './hermesAdapter.js';
export * from './openClawAdapter.js';
export * from './genericAdapter.js';

const adapters: Record<string, BenchmarkFrameworkAdapter> = {
  native: new NativeFrameworkAdapter(),
  pi: new PiFrameworkAdapter(),
  opencode: new OpenCodeFrameworkAdapter(),
  'claude-code': new ClaudeCodeFrameworkAdapter(),
  claude: new ClaudeCodeFrameworkAdapter(),
  hermes: new HermesFrameworkAdapter(),
  openclaw: new OpenClawFrameworkAdapter(),
};

export function getFrameworkAdapter(frameworkId: string = 'native'): BenchmarkFrameworkAdapter {
  const adapter = adapters[frameworkId.toLowerCase()];
  if (!adapter) {
    return new GenericFrameworkAdapter(frameworkId, frameworkId, frameworkId);
  }
  return adapter;
}
