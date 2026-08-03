import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';
import { BUILTIN_TOOLS } from '../core/tools.js';
import { DEFAULT_COMMAND_WHITELIST } from '../core/commandWhitelist.js';

export const CONFIG_FILE_PATH = path.join(os.homedir(), '.local-model-chat-config.json');
export const CHAT_SESSIONS_FILE_PATH = path.join(os.homedir(), '.local-model-chat-sessions.json');

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
  let enabledTools = Object.fromEntries(BUILTIN_TOOLS.map((tool) => [tool.name, tool.name !== 'apply_patch']));

  try {
    if (fsSync.existsSync(CONFIG_FILE_PATH)) {
      const data = fsSync.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.workingDir && typeof parsed.workingDir === 'string' && fsSync.existsSync(parsed.workingDir)) {
        workingDir = parsed.workingDir;
      }
      if (parsed.ollamaHost && typeof parsed.ollamaHost === 'string') {
        ollamaHost = parsed.ollamaHost;
      }
      if (parsed.ollamaToken !== undefined && typeof parsed.ollamaToken === 'string') {
        ollamaToken = parsed.ollamaToken;
      }
      if (parsed.model && typeof parsed.model === 'string') {
        model = parsed.model;
      }
      if (parsed.classifierModel && typeof parsed.classifierModel === 'string') {
        classifierModel = parsed.classifierModel;
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
      if (parsed.enabledTools && typeof parsed.enabledTools === 'object' && !Array.isArray(parsed.enabledTools)) {
        enabledTools = Object.fromEntries(BUILTIN_TOOLS.map((tool) => [
          tool.name,
          parsed.enabledTools[tool.name] !== undefined
            ? Boolean(parsed.enabledTools[tool.name])
            : tool.name !== 'apply_patch',
        ]));
      }
    }
  } catch (_) {}

  // Explicit environment configuration takes precedence over persisted UI settings.
  if (process.env.WORKING_DIR && fsSync.existsSync(process.env.WORKING_DIR)) workingDir = process.env.WORKING_DIR;
  if (process.env.OLLAMA_HOST) ollamaHost = process.env.OLLAMA_HOST;
  if (process.env.OLLAMA_TOKEN !== undefined) ollamaToken = process.env.OLLAMA_TOKEN;
  if (process.env.OLLAMA_MODEL) model = process.env.OLLAMA_MODEL;
  if (process.env.OLLAMA_CLASSIFIER_MODEL) classifierModel = process.env.OLLAMA_CLASSIFIER_MODEL;

  return { workingDir, ollamaHost, ollamaToken, model, classifierModel, allowedCommands, terminalMode, fileEditMode, enableThinking, preventRepeatedCalls, complexityProfile, enabledTools };
}

export function savePersistedConfig(updatedConfig: Record<string, any>): void {
  try {
    let existing: Record<string, any> = {};
    if (fsSync.existsSync(CONFIG_FILE_PATH)) {
      existing = JSON.parse(fsSync.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    }
    const merged = { ...existing, ...updatedConfig };
    fsSync.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  } catch (_) {}
}
