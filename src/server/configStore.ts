import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';
import { BUILTIN_TOOLS } from '../core/tools.js';
import { DEFAULT_COMMAND_WHITELIST } from '../core/commandWhitelist.js';
import { ContextPruningConfig, ModelProfileTemplate } from '../core/types.js';

export const CONFIG_FILE_PATH = path.join(os.homedir(), '.local-model-chat-config.json');
export const CHAT_SESSIONS_DIR = path.join(os.homedir(), '.local-model-chat-sessions');
export const CHAT_SESSIONS_FILE_PATH = path.join(os.homedir(), '.local-model-chat-sessions.json');

export function detectLiveOllamaDaemonEnv(): {
  ollamaNumParallel?: number;
  ollamaFlashAttention?: boolean;
  ollamaMaxLoadedModels?: number;
  ollamaModelsPath?: string;
  ollamaOrigins?: string;
  ollamaLoadTimeout?: string;
} {
  const result: {
    ollamaNumParallel?: number;
    ollamaFlashAttention?: boolean;
    ollamaMaxLoadedModels?: number;
    ollamaModelsPath?: string;
    ollamaOrigins?: string;
    ollamaLoadTimeout?: string;
  } = {};

  // 0. Check main systemd unit files on Linux for configured OLLAMA_MODELS
  try {
    if (process.platform === 'linux') {
      const mainServiceFiles = ['/etc/systemd/system/ollama.service', '/lib/systemd/system/ollama.service'];
      for (const sp of mainServiceFiles) {
        if (fsSync.existsSync(sp)) {
          const content = fsSync.readFileSync(sp, 'utf8');
          const modelsMatch = content.match(/OLLAMA_MODELS=([^\s\n\r"]+)/);
          if (modelsMatch && !result.ollamaModelsPath) result.ollamaModelsPath = modelsMatch[1];
          const numMatch = content.match(/OLLAMA_NUM_PARALLEL=([0-9]+)/);
          if (numMatch && result.ollamaNumParallel === undefined) result.ollamaNumParallel = parseInt(numMatch[1], 10);
        }
      }
    }
  } catch (_) {}

  // 1. Check systemd drop-in override files on Linux directly from disk
  try {
    if (process.platform === 'linux' && fsSync.existsSync('/etc/systemd/system/ollama.service.d')) {
      const files = fsSync.readdirSync('/etc/systemd/system/ollama.service.d');
      for (const f of files) {
        if (f.endsWith('.conf')) {
          const content = fsSync.readFileSync(path.join('/etc/systemd/system/ollama.service.d', f), 'utf8');
          const numMatch = content.match(/OLLAMA_NUM_PARALLEL=([0-9]+)/);
          if (numMatch) result.ollamaNumParallel = parseInt(numMatch[1], 10);

          const flashMatch = content.match(/OLLAMA_FLASH_ATTENTION=([0-1]|true|false)/);
          if (flashMatch) result.ollamaFlashAttention = flashMatch[1] === '1' || flashMatch[1] === 'true';

          const maxModelsMatch = content.match(/OLLAMA_MAX_LOADED_MODELS=([0-9]+)/);
          if (maxModelsMatch) result.ollamaMaxLoadedModels = parseInt(maxModelsMatch[1], 10);

          const modelsMatch = content.match(/OLLAMA_MODELS=([^\s\n\r"]+)/);
          if (modelsMatch) result.ollamaModelsPath = modelsMatch[1];

          const originsMatch = content.match(/OLLAMA_ORIGINS=([^\s\n\r"]+)/);
          if (originsMatch) result.ollamaOrigins = originsMatch[1];

          const timeoutMatch = content.match(/OLLAMA_LOAD_TIMEOUT=([^\s\n\r"]+)/);
          if (timeoutMatch) result.ollamaLoadTimeout = timeoutMatch[1];
        }
      }
    }
  } catch (_) {}

  // 2. Second, fallback to checking process / proc / systemctl environment
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'linux') {
      const cmd = `(tr '\\0' '\\n' < /proc/$(pgrep -f "ollama serve" | head -n 1)/environ 2>/dev/null || systemctl show ollama --property=Environment 2>/dev/null)`;
      const raw = (execSync(cmd, { encoding: 'utf8', timeout: 1000 }) as string).trim();

      if (result.ollamaNumParallel === undefined) {
        const numMatch = raw.match(/OLLAMA_NUM_PARALLEL=([0-9]+)/);
        if (numMatch) result.ollamaNumParallel = parseInt(numMatch[1], 10);
      }
      if (result.ollamaFlashAttention === undefined) {
        const flashMatch = raw.match(/OLLAMA_FLASH_ATTENTION=([0-1]|true|false)/);
        if (flashMatch) result.ollamaFlashAttention = flashMatch[1] === '1' || flashMatch[1] === 'true';
      }
      if (result.ollamaMaxLoadedModels === undefined) {
        const maxModelsMatch = raw.match(/OLLAMA_MAX_LOADED_MODELS=([0-9]+)/);
        if (maxModelsMatch) result.ollamaMaxLoadedModels = parseInt(maxModelsMatch[1], 10);
      }
      if (result.ollamaModelsPath === undefined) {
        const modelsMatch = raw.match(/OLLAMA_MODELS=([^\s\n"]+)/);
        if (modelsMatch) result.ollamaModelsPath = modelsMatch[1];
      }
      if (result.ollamaOrigins === undefined) {
        const originsMatch = raw.match(/OLLAMA_ORIGINS=([^\s\n"]+)/);
        if (originsMatch) result.ollamaOrigins = originsMatch[1];
      }
      if (result.ollamaLoadTimeout === undefined) {
        const timeoutMatch = raw.match(/OLLAMA_LOAD_TIMEOUT=([^\s\n"]+)/);
        if (timeoutMatch) result.ollamaLoadTimeout = timeoutMatch[1];
      }
    }
  } catch (_) {}

  // 3. Fallback to process.env if not detected from live daemon
  if (result.ollamaNumParallel === undefined && process.env.OLLAMA_NUM_PARALLEL) {
    const val = parseInt(process.env.OLLAMA_NUM_PARALLEL, 10);
    if (!isNaN(val)) result.ollamaNumParallel = val;
  }
  if (result.ollamaFlashAttention === undefined && process.env.OLLAMA_FLASH_ATTENTION) {
    result.ollamaFlashAttention = process.env.OLLAMA_FLASH_ATTENTION === '1' || process.env.OLLAMA_FLASH_ATTENTION === 'true';
  }
  if (result.ollamaMaxLoadedModels === undefined && process.env.OLLAMA_MAX_LOADED_MODELS) {
    const val = parseInt(process.env.OLLAMA_MAX_LOADED_MODELS, 10);
    if (!isNaN(val)) result.ollamaMaxLoadedModels = val;
  }
  if (result.ollamaModelsPath === undefined && process.env.OLLAMA_MODELS) {
    result.ollamaModelsPath = process.env.OLLAMA_MODELS;
  }
  if (result.ollamaOrigins === undefined && process.env.OLLAMA_ORIGINS) {
    result.ollamaOrigins = process.env.OLLAMA_ORIGINS;
  }
  if (result.ollamaLoadTimeout === undefined && process.env.OLLAMA_LOAD_TIMEOUT) {
    result.ollamaLoadTimeout = process.env.OLLAMA_LOAD_TIMEOUT;
  }

  return result;
}

export const BUILTIN_PROFILES: ModelProfileTemplate[] = [
  {
    id: 'expert-coder',
    name: 'Expert Coder & Engineer',
    description: 'Deterministic coding with 32k context, low temp (0.05), strict top_k (20), and code-specific prompt tuning.',
    icon: '🧑‍💻',
    isBuiltin: true,
    settings: {
      temperature: 0.05,
      contextWindow: 32768,
      enableThinking: true,
      topP: 0.95,
      topK: 20,
      minP: 0.05,
      repeatPenalty: 1.05,
      systemPrompt: 'You are an expert AI software engineer. Produce production-grade, bug-free code with exact file paths, explicit types, and clean architecture.',
    },
  },
  {
    id: 'fast-coder',
    name: 'Fast Coder',
    description: 'Optimized for quick code edits with low temperature, high context, and low sampling variance.',
    icon: '⚡',
    isBuiltin: true,
    settings: {
      temperature: 0.1,
      contextWindow: 16384,
      enableThinking: false,
      topP: 0.9,
      repeatPenalty: 1.05,
    },
  },
  {
    id: 'deep-reasoner',
    name: 'Deep Reasoner',
    description: 'Enables reasoning/thinking mode with 32k context for complex debugging and architecture.',
    icon: '🧠',
    isBuiltin: true,
    settings: {
      temperature: 0.6,
      contextWindow: 32768,
      enableThinking: true,
      topP: 0.95,
      minP: 0.05,
    },
  },
  {
    id: 'creative',
    name: 'Creative & Conversational',
    description: 'Higher temperature and top_p for brainstorming, design, and documentation.',
    icon: '🎨',
    isBuiltin: true,
    settings: {
      temperature: 0.8,
      contextWindow: 16384,
      enableThinking: false,
      topP: 0.95,
      topK: 40,
    },
  },
  {
    id: 'minimal-vram',
    name: 'Low VRAM / Unload Instant',
    description: 'Compact 8k context window and immediate VRAM unload after each completion.',
    icon: '🔋',
    isBuiltin: true,
    settings: {
      temperature: 0.2,
      contextWindow: 8192,
      enableThinking: false,
      keepAlive: 0,
    },
  },
];

export interface PersistedConfig {
  workingDir: string;
  ollamaHost: string;
  ollamaToken?: string;
  model: string;
  allowedCommands: string[];
  terminalMode: 'confirm' | 'auto';
  fileEditMode: 'confirm' | 'auto' | 'batch';
  enableThinking: boolean;
  classifierModel?: string;
  complexityProfile: 'simple' | 'medium' | 'advanced';
  preventRepeatedCalls: boolean;
  enabledTools: Record<string, boolean>;
  maxLoops: number;
  temperature?: number;
  contextWindow?: number;
  systemPrompt?: string;
  showWorkingDirInfo?: boolean;
  pruningConfig?: ContextPruningConfig;
  planMode?: boolean;
  terminalGuiMode?: boolean;
  customTerminalCmd?: string;
  topP?: number;
  topK?: number;
  minP?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  numPredict?: number;
  stop?: string[];
  keepAlive?: string | number;
  numGpu?: number;
  numThread?: number;
  customProfiles?: ModelProfileTemplate[];
  activeProfileId?: string;
  ollamaNumParallel?: number;
  ollamaFlashAttention?: boolean;
  ollamaMaxLoadedModels?: number;
  ollamaModelsPath?: string;
  lowVram?: boolean;
  f16Kv?: boolean;
  mirostat?: number;
  mirostatEta?: number;
  mirostatTau?: number;
  ollamaOrigins?: string;
  ollamaLoadTimeout?: string;
}

export function getInitialPersistedConfig(): PersistedConfig {
  let workingDir = process.cwd();
  let ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  let ollamaToken = process.env.OLLAMA_TOKEN;
  let model = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
  let classifierModel: string | undefined = undefined;
  let allowedCommands = [...DEFAULT_COMMAND_WHITELIST];
  let terminalMode: 'confirm' | 'auto' = 'confirm';
  let fileEditMode: 'confirm' | 'auto' | 'batch' = 'batch';
  let enableThinking = true;
  let preventRepeatedCalls = true;
  let complexityProfile: 'simple' | 'medium' | 'advanced' = 'simple';
  let maxLoops = 25;
  let enabledTools = Object.fromEntries(BUILTIN_TOOLS.map((tool) => [tool.name, tool.name !== 'apply_patch']));
  let temperature: number | undefined = undefined;
  let contextWindow: number | undefined = undefined;
  let systemPrompt: string | undefined = undefined;
  let showWorkingDirInfo: boolean | undefined = undefined;
  let pruningConfig: ContextPruningConfig | undefined = undefined;
  let planMode: boolean | undefined = undefined;
  let terminalGuiMode: boolean | undefined = undefined;
  let customTerminalCmd: string | undefined = undefined;
  let topP: number | undefined = undefined;
  let topK: number | undefined = undefined;
  let minP: number | undefined = undefined;
  let repeatPenalty: number | undefined = undefined;
  let presencePenalty: number | undefined = undefined;
  let frequencyPenalty: number | undefined = undefined;
  let seed: number | undefined = undefined;
  let numPredict: number | undefined = undefined;
  let stop: string[] | undefined = undefined;
  let keepAlive: string | number | undefined = undefined;
  let numGpu: number | undefined = undefined;
  let numThread: number | undefined = undefined;
  let customProfiles: ModelProfileTemplate[] | undefined = undefined;
  let activeProfileId: string | undefined = undefined;
  let ollamaNumParallel: number | undefined = undefined;
  let ollamaFlashAttention: boolean | undefined = undefined;
  let ollamaMaxLoadedModels: number | undefined = undefined;
  let ollamaModelsPath: string | undefined = undefined;
  let lowVram: boolean | undefined = undefined;
  let f16Kv: boolean | undefined = undefined;
  let mirostat: number | undefined = undefined;
  let mirostatEta: number | undefined = undefined;
  let mirostatTau: number | undefined = undefined;
  let ollamaOrigins: string | undefined = undefined;
  let ollamaLoadTimeout: string | undefined = undefined;

  let hasSavedHost = false;
  let hasSavedToken = false;
  let hasSavedModel = false;
  let hasSavedClassifier = false;

  try {
    if (fsSync.existsSync(CONFIG_FILE_PATH)) {
      const data = fsSync.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const sanitized = data.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(sanitized);
      if (parsed.workingDir && typeof parsed.workingDir === 'string' && fsSync.existsSync(parsed.workingDir)) {
        workingDir = parsed.workingDir;
      }
      if (parsed.ollamaHost && typeof parsed.ollamaHost === 'string') {
        ollamaHost = parsed.ollamaHost;
        hasSavedHost = true;
      }
      if (parsed.ollamaToken !== undefined && typeof parsed.ollamaToken === 'string') {
        ollamaToken = parsed.ollamaToken;
        hasSavedToken = true;
      }
      if (parsed.model && typeof parsed.model === 'string') {
        model = parsed.model;
        hasSavedModel = true;
      }
      if (parsed.classifierModel && typeof parsed.classifierModel === 'string') {
        classifierModel = parsed.classifierModel;
        hasSavedClassifier = true;
      }
      if (Array.isArray(parsed.allowedCommands)) {
        allowedCommands = parsed.allowedCommands;
      }
      if (parsed.terminalMode === 'confirm' || parsed.terminalMode === 'auto') {
        terminalMode = parsed.terminalMode;
      }
      if (parsed.fileEditMode === 'confirm' || parsed.fileEditMode === 'auto' || parsed.fileEditMode === 'batch') {
        fileEditMode = parsed.fileEditMode;
      }
      if (typeof parsed.enableThinking === 'boolean') {
        enableThinking = parsed.enableThinking;
      }
      if (typeof parsed.preventRepeatedCalls === 'boolean') {
        preventRepeatedCalls = parsed.preventRepeatedCalls;
      }
      if (parsed.complexityProfile === 'simple' || parsed.complexityProfile === 'medium' || parsed.complexityProfile === 'advanced') {
        complexityProfile = parsed.complexityProfile;
      }
      if (typeof parsed.maxLoops === 'number' && parsed.maxLoops >= 0 && parsed.maxLoops <= 50) {
        maxLoops = parsed.maxLoops;
      }
      if (typeof parsed.temperature === 'number' && parsed.temperature >= 0 && parsed.temperature <= 2) {
        temperature = parsed.temperature;
      }
      if (typeof parsed.contextWindow === 'number' && parsed.contextWindow > 0) {
        contextWindow = parsed.contextWindow;
      }
      if (typeof parsed.systemPrompt === 'string') {
        systemPrompt = parsed.systemPrompt;
      }
      if (typeof parsed.showWorkingDirInfo === 'boolean') {
        showWorkingDirInfo = parsed.showWorkingDirInfo;
      }
      if (parsed.pruningConfig && typeof parsed.pruningConfig === 'object' && !Array.isArray(parsed.pruningConfig)) {
        pruningConfig = parsed.pruningConfig;
      }
      if (typeof parsed.planMode === 'boolean') {
        planMode = parsed.planMode;
      }
      if (typeof parsed.terminalGuiMode === 'boolean') {
        terminalGuiMode = parsed.terminalGuiMode;
      }
      if (typeof parsed.customTerminalCmd === 'string') {
        customTerminalCmd = parsed.customTerminalCmd;
      }
      if (typeof parsed.topP === 'number') topP = parsed.topP;
      if (typeof parsed.topK === 'number') topK = parsed.topK;
      if (typeof parsed.minP === 'number') minP = parsed.minP;
      if (typeof parsed.repeatPenalty === 'number') repeatPenalty = parsed.repeatPenalty;
      if (typeof parsed.presencePenalty === 'number') presencePenalty = parsed.presencePenalty;
      if (typeof parsed.frequencyPenalty === 'number') frequencyPenalty = parsed.frequencyPenalty;
      if (typeof parsed.seed === 'number') seed = parsed.seed;
      if (typeof parsed.numPredict === 'number') numPredict = parsed.numPredict;
      if (Array.isArray(parsed.stop)) stop = parsed.stop;
      if (parsed.keepAlive !== undefined) keepAlive = parsed.keepAlive;
      if (typeof parsed.numGpu === 'number') numGpu = parsed.numGpu;
      if (typeof parsed.numThread === 'number') numThread = parsed.numThread;
      if (Array.isArray(parsed.customProfiles)) customProfiles = parsed.customProfiles;
      if (typeof parsed.activeProfileId === 'string') activeProfileId = parsed.activeProfileId;
      if (typeof parsed.ollamaNumParallel === 'number') ollamaNumParallel = parsed.ollamaNumParallel;
      if (typeof parsed.ollamaFlashAttention === 'boolean') ollamaFlashAttention = parsed.ollamaFlashAttention;
      if (typeof parsed.ollamaMaxLoadedModels === 'number') ollamaMaxLoadedModels = parsed.ollamaMaxLoadedModels;
      if (typeof parsed.ollamaModelsPath === 'string') ollamaModelsPath = parsed.ollamaModelsPath;
      if (typeof parsed.lowVram === 'boolean') lowVram = parsed.lowVram;
      if (typeof parsed.f16Kv === 'boolean') f16Kv = parsed.f16Kv;
      if (typeof parsed.mirostat === 'number') mirostat = parsed.mirostat;
      if (typeof parsed.mirostatEta === 'number') mirostatEta = parsed.mirostatEta;
      if (typeof parsed.mirostatTau === 'number') mirostatTau = parsed.mirostatTau;
      if (typeof parsed.ollamaOrigins === 'string') ollamaOrigins = parsed.ollamaOrigins;
      if (typeof parsed.ollamaLoadTimeout === 'string') ollamaLoadTimeout = parsed.ollamaLoadTimeout;
    }
  } catch (_) {}

  // Explicit environment configuration only provides initial defaults if not already saved by user in UI.
  if (process.env.WORKING_DIR && fsSync.existsSync(process.env.WORKING_DIR)) workingDir = process.env.WORKING_DIR;
  if (!hasSavedHost && process.env.OLLAMA_HOST) ollamaHost = process.env.OLLAMA_HOST;
  if (!hasSavedToken && process.env.OLLAMA_TOKEN !== undefined) ollamaToken = process.env.OLLAMA_TOKEN;
  if (!hasSavedModel && process.env.OLLAMA_MODEL) model = process.env.OLLAMA_MODEL;
  if (!hasSavedClassifier && process.env.OLLAMA_CLASSIFIER_MODEL) classifierModel = process.env.OLLAMA_CLASSIFIER_MODEL;

  // Detect live daemon environment directly from running process / systemctl
  const liveEnv = detectLiveOllamaDaemonEnv();
  ollamaNumParallel = liveEnv.ollamaNumParallel ?? ollamaNumParallel ?? 1;
  ollamaFlashAttention = liveEnv.ollamaFlashAttention ?? ollamaFlashAttention ?? true;
  ollamaMaxLoadedModels = liveEnv.ollamaMaxLoadedModels ?? ollamaMaxLoadedModels ?? 1;
  ollamaModelsPath = liveEnv.ollamaModelsPath ?? ollamaModelsPath ?? undefined;
  ollamaOrigins = liveEnv.ollamaOrigins ?? ollamaOrigins ?? undefined;
  ollamaLoadTimeout = liveEnv.ollamaLoadTimeout ?? ollamaLoadTimeout ?? undefined;

  return {
    workingDir,
    ollamaHost,
    ollamaToken,
    model,
    classifierModel,
    allowedCommands,
    terminalMode,
    fileEditMode,
    enableThinking,
    preventRepeatedCalls,
    complexityProfile,
    enabledTools,
    maxLoops,
    temperature,
    contextWindow,
    systemPrompt,
    showWorkingDirInfo,
    pruningConfig,
    planMode,
    terminalGuiMode,
    customTerminalCmd,
    topP,
    topK,
    minP,
    repeatPenalty,
    presencePenalty,
    frequencyPenalty,
    seed,
    numPredict,
    stop,
    keepAlive,
    numGpu,
    numThread,
    customProfiles,
    activeProfileId,
    ollamaNumParallel,
    ollamaFlashAttention,
    ollamaMaxLoadedModels,
    ollamaModelsPath,
    lowVram,
    f16Kv,
    mirostat,
    mirostatEta,
    mirostatTau,
    ollamaOrigins,
    ollamaLoadTimeout,
  };
}

export function savePersistedConfig(updatedConfig: Record<string, any>): void {
  try {
    let existing: Record<string, any> = {};
    if (fsSync.existsSync(CONFIG_FILE_PATH)) {
      const raw = fsSync.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const sanitized = raw.replace(/,\s*([\]}])/g, '$1');
      existing = JSON.parse(sanitized);
    }
    const merged = { ...existing, ...updatedConfig };
    fsSync.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  } catch (_) {}
}
