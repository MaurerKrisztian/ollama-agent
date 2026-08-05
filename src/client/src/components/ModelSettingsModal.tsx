import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, Brain, CheckCircle2, Copy, Cpu, Download, Info, Loader2, Power, Search, SlidersHorizontal, Terminal, X } from 'lucide-react';
import { AgentConfig, OllamaModelInfo, OllamaRunningModelInfo, SystemMetrics, ollamaModelNamesMatch } from '../types';

interface ModelSettingsModalProps {
  isOpen: boolean;
  config: AgentConfig;
  models: OllamaModelInfo[];
  runningModels: OllamaRunningModelInfo[];
  systemMetrics: SystemMetrics | null;
  onClose: () => void;
  onSelectModel: (model: string) => void;
  onChangeClassifierModel?: (classifierModel: string) => void;
  onChangeTemperature: (temperature: number) => void;
  onChangeContextWindow: (contextWindow: number) => void;
  onToggleThinking: (enabled: boolean) => void;
  onOpenModelDetails: () => void;
  onModelsChanged: () => Promise<void>;
  onUnloadModel: (model: string) => Promise<void>;
  onUpdateConfig?: (update: Record<string, any>) => Promise<void>;
}

const DEFAULT_SETTINGS = {
  temperature: 0.2,
  contextWindow: 16384,
  enableThinking: true,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  numPredict: -1,
  keepAlive: '5m',
};

const PRESET_PROFILES = [
  {
    id: 'expert-coder',
    name: 'Expert Coder',
    icon: '🧑‍💻',
    desc: '32k context, low temp (0.05), strict top_k (20), thinking on for high-precision code.',
    settings: { temperature: 0.05, contextWindow: 32768, enableThinking: true, topP: 0.95, topK: 20, minP: 0.05, repeatPenalty: 1.05 },
  },
  {
    id: 'fast-coder',
    name: 'Fast Coder',
    icon: '⚡',
    desc: 'Low temp (0.1), top_p (0.9), low latency for quick code generation.',
    settings: { temperature: 0.1, contextWindow: 16384, enableThinking: false, topP: 0.9, repeatPenalty: 1.05 },
  },
  {
    id: 'deep-reasoner',
    name: 'Deep Reasoner',
    icon: '🧠',
    desc: 'Reasoning mode on, 32k context window, min_p (0.05).',
    settings: { temperature: 0.6, contextWindow: 32768, enableThinking: true, topP: 0.95, minP: 0.05 },
  },
  {
    id: 'creative',
    name: 'Creative & Writing',
    icon: '🎨',
    desc: 'High temp (0.8), top_p (0.95), top_k (40) for expressive output.',
    settings: { temperature: 0.8, contextWindow: 16384, enableThinking: false, topP: 0.95, topK: 40 },
  },
  {
    id: 'minimal-vram',
    name: 'Low VRAM',
    icon: '🔋',
    desc: '8k context window and immediate VRAM release after generation.',
    settings: { temperature: 0.2, contextWindow: 8192, enableThinking: false, keepAlive: 0 },
  },
];

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '6px', cursor: 'help' }}>
      <button
        type="button"
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: '50%',
          width: '18px',
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-primary, #60a5fa)',
          cursor: 'pointer',
          padding: 0,
        }}
        aria-label="Info"
      >
        <Info size={12} />
      </button>
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: '130%',
            right: 0,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--accent-primary, rgba(56,189,248,0.3))',
            color: '#f8fafc',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.75rem',
            lineHeight: '1.35',
            width: '220px',
            zIndex: 99999,
            boxShadow: '0 10px 25px rgba(0,0,0,0.7)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            fontWeight: 400,
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
};

const SUGGESTED_MODELS = [
  { name: 'qwen3.5:9b', description: 'General-purpose reasoning and coding', diskGb: 6.6, vramGb: 8 },
  { name: 'gpt-oss:20b', description: 'Open-weight reasoning model', diskGb: 13, vramGb: 16 },
  { name: 'gemma3:4b', description: 'Compact multimodal model', diskGb: 3.3, vramGb: 4 },
  { name: 'llama3.2:3b', description: 'Fast general-purpose model', diskGb: 2, vramGb: 3 },
  { name: 'deepseek-r1:8b', description: 'Reasoning-focused model', diskGb: 5.2, vramGb: 7 },
  { name: 'qwen2.5-coder:7b', description: 'Code-focused model', diskGb: 4.7, vramGb: 6 },
  { name: 'mistral:7b', description: 'Efficient general-purpose model', diskGb: 4.1, vramGb: 6 },
  { name: 'phi4-mini', description: 'Small, capable language model', diskGb: 2.5, vramGb: 4 },
];

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  config,
  models,
  runningModels,
  systemMetrics,
  onClose,
  onSelectModel,
  onChangeClassifierModel,
  onChangeTemperature,
  onChangeContextWindow,
  onToggleThinking,
  onOpenModelDetails,
  onModelsChanged,
  onUnloadModel,
  onUpdateConfig,
}) => {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [daemonOpen, setDaemonOpen] = useState(false);
  const [osFormat, setOsFormat] = useState<'bash' | 'powershell' | 'cmd' | 'systemd'>('systemd');
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedDiagnostic, setCopiedDiagnostic] = useState<boolean>(false);

  const [draftNumParallel, setDraftNumParallel] = useState<number>(config.ollamaNumParallel ?? 1);
  const [draftFlashAttention, setDraftFlashAttention] = useState<boolean>(config.ollamaFlashAttention ?? true);
  const [draftMaxLoadedModels, setDraftMaxLoadedModels] = useState<number>(config.ollamaMaxLoadedModels ?? 1);
  const [draftModelsPath, setDraftModelsPath] = useState<string>(config.ollamaModelsPath ?? '');
  const [draftOrigins, setDraftOrigins] = useState<string>(config.ollamaOrigins ?? '');
  const [draftLoadTimeout, setDraftLoadTimeout] = useState<string>(config.ollamaLoadTimeout ?? '');

  const [restartingDaemon, setRestartingDaemon] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [daemonMessage, setDaemonMessage] = useState<string>('');

  React.useEffect(() => {
    if (isOpen) {
      setDraftNumParallel(config.ollamaNumParallel ?? 1);
      setDraftFlashAttention(config.ollamaFlashAttention ?? true);
      setDraftMaxLoadedModels(config.ollamaMaxLoadedModels ?? 1);
      setDraftModelsPath(config.ollamaModelsPath ?? '');
      setDraftOrigins(config.ollamaOrigins ?? '');
      setDraftLoadTimeout(config.ollamaLoadTimeout ?? '');
    }
  }, [isOpen, config.ollamaNumParallel, config.ollamaFlashAttention, config.ollamaMaxLoadedModels, config.ollamaModelsPath, config.ollamaOrigins, config.ollamaLoadTimeout]);
  const [query, setQuery] = useState('');
  const [modelName, setModelName] = useState('');
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [unloadState, setUnloadState] = useState<'idle' | 'unloading' | 'success' | 'error'>('idle');
  const [unloadMessage, setUnloadMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const installedNames = useMemo(() => new Set(models.flatMap((model) => [model.name, model.name.replace(/:latest$/, '')])), [models]);
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return SUGGESTED_MODELS.filter((model) => !normalized || `${model.name} ${model.description}`.toLowerCase().includes(normalized));
  }, [query]);
  const gpu = systemMetrics?.gpu;
  const gpuTotalGb = gpu?.memTotalMb ? gpu.memTotalMb / 1024 : null;
  const gpuFreeGb = gpu?.memTotalMb ? Math.max(0, gpu.memTotalMb - gpu.memUsedMb) / 1024 : null;

  const getGpuFit = (requiredVramGb: number) => {
    if (gpuTotalGb === null || gpuFreeGb === null) return { level: 'unknown', label: 'GPU unknown' };
    if (gpuFreeGb >= requiredVramGb) return { level: 'fits', label: 'Runs fully on GPU' };
    if (gpuTotalGb >= requiredVramGb) return { level: 'maybe', label: 'Fits after freeing VRAM' };
    return { level: 'offload', label: 'Needs CPU offload' };
  };

  if (!isOpen) return null;

  const loadedModel = runningModels.find((model) =>
    ollamaModelNamesMatch(model.name, config.model) || ollamaModelNamesMatch(model.model, config.model)
  );
  const vramGb = loadedModel?.size_vram
    ? (loadedModel.size_vram / (1024 * 1024 * 1024)).toFixed(2)
    : null;

  const applyProfile = (profile: typeof PRESET_PROFILES[0]) => {
    if (onUpdateConfig) {
      void onUpdateConfig(profile.settings);
    } else {
      if (profile.settings.temperature !== undefined) onChangeTemperature(profile.settings.temperature);
      if (profile.settings.contextWindow !== undefined) onChangeContextWindow(profile.settings.contextWindow);
      if (profile.settings.enableThinking !== undefined) onToggleThinking(profile.settings.enableThinking);
    }
  };

  const downloadModel = async () => {
    const requestedModel = modelName.trim();
    if (!requestedModel || downloadState === 'downloading') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadState('downloading');
    setDownloadStatus('Connecting to Ollama…');
    setDownloadPercent(null);

    try {
      const response = await fetch('/api/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: requestedModel }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Download failed with HTTP ${response.status}.`);
      }
      if (!response.body) throw new Error('The server returned an empty download response.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const consume = (line: string) => {
        if (!line.trim()) return;
        const progress = JSON.parse(line);
        if (progress.error) throw new Error(progress.error);
        setDownloadStatus(progress.status || 'Downloading…');
        setDownloadPercent(
          Number.isFinite(progress.completed) && Number.isFinite(progress.total) && progress.total > 0
            ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
            : null
        );
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) consume(line);
        if (done) break;
      }
      consume(buffer);
      await onModelsChanged();
      await onSelectModel(requestedModel);
      setDownloadState('success');
      setDownloadStatus(`${requestedModel} is installed and selected.`);
      setDownloadPercent(100);
    } catch (err: any) {
      setDownloadState('error');
      setDownloadStatus(err?.name === 'AbortError' ? 'Download cancelled.' : (err.message || 'Download failed.'));
      setDownloadPercent(null);
    } finally {
      abortRef.current = null;
    }
  };

  const unloadActiveModel = async () => {
    const targetModel = loadedModel?.name || loadedModel?.model || config.model;
    if (!targetModel || unloadState === 'unloading') return;
    setUnloadState('unloading');
    setUnloadMessage('');
    try {
      await onUnloadModel(targetModel);
      setUnloadState('success');
      setUnloadMessage(`${targetModel} was successfully unloaded from VRAM.`);
    } catch (err: any) {
      setUnloadState('error');
      setUnloadMessage(err.message || 'Could not unload the model.');
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="glass-panel model-settings-modal animate-fade-in" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <SlidersHorizontal size={20} color="var(--accent-primary)" />
              <h2>Model Settings</h2>
            </div>
            <p>Configure model selection, sampling presets, and Ollama options.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close model settings"><X size={20} /></button>
        </div>

        <div className="model-settings-body">
          {/* Preset Profiles Bar */}
          <section className="model-settings-section" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                🎯 Quick Profile Presets <InfoTooltip text="Preset sampling configurations optimized for specific AI tasks like coding or deep reasoning." />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (onUpdateConfig) {
                    void onUpdateConfig(DEFAULT_SETTINGS);
                  } else {
                    onChangeTemperature(DEFAULT_SETTINGS.temperature);
                    onChangeContextWindow(DEFAULT_SETTINGS.contextWindow);
                    onToggleThinking(DEFAULT_SETTINGS.enableThinking);
                  }
                }}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  color: 'var(--accent-primary, #60a5fa)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Reset all sampling parameters to application defaults"
              >
                ↺ Reset Defaults
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
              {PRESET_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyProfile(p)}
                  title={p.desc}
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    color: 'var(--text-main)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
                >
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{p.icon}</span> {p.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.desc}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="model-settings-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label htmlFor="active-model" style={{ margin: 0 }}><Cpu size={17} /> Active model</label>
              <button
                type="button"
                onClick={() => {
                  const report = `### 🤖 LOCAL AI MODEL & HARDWARE OPTIMIZATION SPECIFICATION
> Paste this specification to an AI to optimize performance, eliminate VRAM OOM, or tune parameters for your specific hardware.

#### 1. ⚙️ Active Model & Core Settings
- **Active Model**: \`${config.model}\`
- **Context Window (\`num_ctx\`)**: \`${config.contextWindow || 16384}\` tokens
- **Temperature**: \`${config.temperature}\`
- **Thinking Mode**: \`${config.enableThinking !== false ? 'Enabled' : 'Disabled'}\` (Supported by model: \`${config.supportsThinking ? 'Yes' : 'No'}\`)
- **Native Tool Calling**: \`${config.supportsNativeTools !== false ? 'Yes' : 'Prompt Fallback'}\`

#### 2. 🎛️ Advanced Sampling & Inference Parameters
- **Top P**: \`${config.topP ?? 0.9}\`
- **Top K**: \`${config.topK ?? 40}\`
- **Min P**: \`${config.minP ?? 0.05}\`
- **Repeat Penalty**: \`${config.repeatPenalty ?? 1.1}\`
- **Presence Penalty**: \`${config.presencePenalty ?? 0}\`
- **Frequency Penalty**: \`${config.frequencyPenalty ?? 0}\`
- **Max Predict Tokens (\`num_predict\`)**: \`${config.numPredict ?? -1}\`
- **VRAM Keep-Alive**: \`${config.keepAlive ?? '5m'}\`
- **GPU Layers (\`num_gpu\`)**: \`${config.numGpu ?? -1}\` (Auto/All)
- **CPU Worker Threads (\`num_thread\`)**: \`${config.numThread ?? 'Auto'}\`
- **Low VRAM Mode**: \`${config.lowVram ? 'Enabled' : 'Disabled'}\`
- **FP16 KV Cache (\`f16_kv\`)**: \`${config.f16Kv ? 'Enabled (FP16)' : 'Disabled (FP32)'}\`
- **Mirostat Mode**: \`${config.mirostat ?? 0}\` (Eta: \`${config.mirostatEta ?? 0.1}\`, Tau: \`${config.mirostatTau ?? 5.0}\`)

#### 3. 🖥️ Server Daemon Environment Variables
- **Ollama Host Endpoint**: \`${config.ollamaHost}\`
- **\`OLLAMA_NUM_PARALLEL\`**: \`${config.ollamaNumParallel ?? 4}\`
- **\`OLLAMA_FLASH_ATTENTION\`**: \`${config.ollamaFlashAttention !== false ? '1 (Enabled)' : '0 (Disabled)'}\`
- **\`OLLAMA_MAX_LOADED_MODELS\`**: \`${config.ollamaMaxLoadedModels ?? 1}\`
- **\`OLLAMA_MODELS\` Path**: \`${config.ollamaModelsPath || 'Default (~/.ollama/models)'}\`
- **\`OLLAMA_ORIGINS\`**: \`${config.ollamaOrigins || 'Default'}\`
- **\`OLLAMA_LOAD_TIMEOUT\`**: \`${config.ollamaLoadTimeout || 'Default (5m)'}\`

#### 4. ⚡ System & GPU Hardware Metrics
- **GPU Model**: \`${gpu?.name || 'Not detected / CPU only'}\`
- **Total GPU Memory (VRAM)**: \`${gpuTotalGb ? `${gpuTotalGb.toFixed(2)} GB` : 'Unknown'}\`
- **Free GPU Memory**: \`${gpuFreeGb ? `${gpuFreeGb.toFixed(2)} GB` : 'Unknown'}\`
- **Active Model VRAM Footprint**: \`${vramGb ? `${vramGb} GB VRAM` : 'Not loaded in VRAM'}\`

---
**AI Optimization Request**:
*Review the above system hardware, VRAM, model parameters, and Ollama daemon configuration. Identify any bottlenecks (e.g. VRAM OOM, CPU thread contention, KV memory degradation), and provide an optimized config recommendation for maximum speed, lowest latency, and stability.*
`;
                  void navigator.clipboard.writeText(report);
                  setCopiedDiagnostic(true);
                  setTimeout(() => setCopiedDiagnostic(false), 2500);
                }}
                title="Copy full hardware, VRAM & model spec for AI optimization"
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {copiedDiagnostic ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                {copiedDiagnostic ? 'Copied!' : 'Copy AI Spec'}
              </button>
            </div>
            <div className="model-setting-control-row">
              <select id="active-model" value={config.model} onChange={(event) => onSelectModel(event.target.value)}>
                {models.length === 0 ? (
                  <option value={config.model}>{config.model}</option>
                ) : models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
              </select>
              <button type="button" className="secondary-button" onClick={onOpenModelDetails}>
                <Info size={15} /> Inspect specs
              </button>
              <button type="button" className="secondary-button" onClick={() => setDownloadOpen((open) => !open)}>
                <Download size={15} /> Download
              </button>
            </div>
            <div className="model-status-row">
              <div className={`model-status ${loadedModel ? 'loaded' : ''}`}>
                <span />
                {loadedModel ? `Loaded${vramGb ? ` · ${vramGb} GB VRAM` : ''}` : 'Idle · loads on the next prompt'}
              </div>
              <button
                type="button"
                className="model-unload-button"
                disabled={unloadState === 'unloading' || !loadedModel}
                onClick={() => void unloadActiveModel()}
                title={loadedModel ? 'Release VRAM memory allocation' : 'Model is not currently loaded in VRAM'}
              >
                {unloadState === 'unloading' ? <Loader2 size={14} className="spin" /> : <Power size={14} />}
                {unloadState === 'unloading' ? 'Unloading…' : loadedModel ? 'Unload VRAM' : 'VRAM Released'}
              </button>
            </div>
            {unloadMessage && (
              <p className={`model-unload-message ${unloadState}`} style={{ marginTop: '7px', fontSize: '0.78rem', color: unloadState === 'success' ? '#34d399' : '#fb7185' }}>
                {unloadMessage}
              </p>
            )}
          </section>

          {downloadOpen && (
            <section className="model-settings-section model-download-section">
              <div className="model-download-title">
                <label htmlFor="model-search"><Download size={17} /> Download a model</label>
                <span>Suggested models</span>
              </div>
              <div className={`model-gpu-summary ${gpuTotalGb !== null ? 'detected' : ''}`}>
                <Cpu size={15} />
                {gpu && gpuTotalGb !== null && gpuFreeGb !== null ? (
                  <span><strong>{gpu.name}</strong> · {gpuFreeGb.toFixed(1)} GB free / {gpuTotalGb.toFixed(1)} GB total VRAM</span>
                ) : (
                  <span>No GPU memory information detected. Compatibility cannot be predicted.</span>
                )}
              </div>
              <div className="model-search-field">
                <Search size={15} />
                <input
                  id="model-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search suggestions…"
                  disabled={downloadState === 'downloading'}
                />
              </div>
              <div className="model-search-results">
                {searchResults.map((suggestion) => {
                  const installedModel = models.find((model) => ollamaModelNamesMatch(model.name, suggestion.name));
                  const installed = Boolean(installedModel) || installedNames.has(suggestion.name) || installedNames.has(suggestion.name.replace(/:latest$/, ''));
                  const diskSize = installedModel?.size
                    ? `${(installedModel.size / (1024 ** 3)).toFixed(1)} GB disk`
                    : `~${suggestion.diskGb} GB disk`;
                  const gpuFit = getGpuFit(suggestion.vramGb);
                  return (
                    <button
                      key={suggestion.name}
                      type="button"
                      className={modelName === suggestion.name ? 'selected' : ''}
                      onClick={() => setModelName(suggestion.name)}
                      disabled={downloadState === 'downloading'}
                    >
                      <span><strong>{suggestion.name}</strong><small>{suggestion.description}</small></span>
                      <span className={`model-resource-fit ${gpuFit.level}`}>
                        <strong>{diskSize}</strong>
                        <small>~{suggestion.vramGb} GB VRAM</small>
                        <small>{gpuFit.label}</small>
                      </span>
                      {installed && <CheckCircle2 className="model-installed-icon" size={16} aria-label="Installed" />}
                    </button>
                  );
                })}
                {searchResults.length === 0 && <p>No suggestion matched. Enter any Ollama model name below.</p>}
              </div>
              <div className="model-download-controls">
                <input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void downloadModel(); }}
                  placeholder="Model and tag, e.g. qwen3.5:9b"
                  aria-label="Ollama model name and tag"
                  disabled={downloadState === 'downloading'}
                />
                {downloadState === 'downloading' ? (
                  <button type="button" className="secondary-button" onClick={() => abortRef.current?.abort()}>Cancel</button>
                ) : (
                  <button type="button" className="download-button" onClick={() => void downloadModel()} disabled={!modelName.trim()}>
                    <Download size={15} /> Download
                  </button>
                )}
              </div>
              {downloadState !== 'idle' && (
                <div className={`model-download-progress ${downloadState}`}>
                  <div>
                    {downloadState === 'downloading' && <Loader2 size={15} className="spin" />}
                    {downloadState === 'success' && <CheckCircle2 size={15} />}
                    {downloadState === 'error' && <AlertCircle size={15} />}
                    <span>{downloadStatus}</span>
                    {downloadPercent !== null && <strong>{downloadPercent}%</strong>}
                  </div>
                  {downloadPercent !== null && <progress max="100" value={downloadPercent} />}
                </div>
              )}
            </section>
          )}

          <section className="model-settings-section">
            <label htmlFor="context-window">
              Context window <InfoTooltip text="Controls the total token capacity available for conversation history and code context." />
            </label>
            <select id="context-window" value={config.contextWindow || 16384} onChange={(event) => onChangeContextWindow(Number(event.target.value))}>
              <option value={16384}>16k (Default)</option>
              <option value={32768}>32k</option>
              <option value={65536}>64k</option>
              <option value={131072}>128k</option>
              <option value={262144}>256k (Max)</option>
            </select>
            <p>Controls how much conversation and workspace context the model can receive.</p>
          </section>

          <section className="model-settings-section">
            <div className="model-setting-title-row">
              <label htmlFor="temperature">
                Temperature <InfoTooltip text="Lower values (0.1 - 0.3) are precise and focused. Higher values (0.7 - 1.0) increase output variety." />
              </label>
              <output>{config.temperature.toFixed(1)}</output>
            </div>
            <input id="temperature" type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => onChangeTemperature(Number(event.target.value))} />
            <p>Lower values are more focused; higher values produce more varied responses.</p>
          </section>

          <section className="model-settings-section model-thinking-setting">
            <div>
              <label htmlFor="model-thinking"><Brain size={17} /> Thinking mode <InfoTooltip text="Enables step-by-step reasoning output for models supporting thinking tokens (e.g. DeepSeek-R1, Qwen 2.5/3.5)." /></label>
              <p>
                Show reasoning for models that support thinking output.
                {config.enableThinking !== false && config.supportsThinking === false && (
                  <span style={{ display: 'block', color: '#eab308', marginTop: '2px', fontWeight: 500 }}>
                    ⚠️ Current model does not support thinking.
                  </span>
                )}
              </p>
            </div>
            <button
              id="model-thinking"
              type="button"
              role="switch"
              aria-checked={config.enableThinking !== false}
              className={`model-toggle ${config.enableThinking !== false ? 'active' : ''}`}
              onClick={() => onToggleThinking(config.enableThinking === false)}
            >
              <span /> {config.enableThinking !== false ? (config.supportsThinking === false ? 'On (Unsupported)' : 'On') : 'Off'}
            </button>
          </section>

          {/* Advanced Sampling & Hardware Accordion */}
          <section className="model-settings-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #60a5fa)',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              <span>⚙️ Advanced Sampling & Hardware Parameters</span>
              <span>{advancedOpen ? '▲ Hide' : '▼ Expand'}</span>
            </button>

            {advancedOpen && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      Top P <InfoTooltip text="Nucleus sampling: considers only tokens comprising the top P cumulative probability (e.g. 0.9)." />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.topP ?? 0.9}
                      onChange={(e) => onUpdateConfig?.({ topP: parseFloat(e.target.value) })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      Top K <InfoTooltip text="Limits sampling to the K most likely tokens. Lower values reduce rare/erratic tokens." />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={config.topK ?? 40}
                      onChange={(e) => onUpdateConfig?.({ topK: parseInt(e.target.value, 10) })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      Min P <InfoTooltip text="Minimum probability threshold relative to the top token. Filters out noisy trailing tokens." />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.minP ?? 0.05}
                      onChange={(e) => onUpdateConfig?.({ minP: parseFloat(e.target.value) })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      Repeat Penalty <InfoTooltip text="Penalizes repetitive words and phrases. Default is 1.1; 1.0 disables penalty." />
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={config.repeatPenalty ?? 1.1}
                      onChange={(e) => onUpdateConfig?.({ repeatPenalty: parseFloat(e.target.value) })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      Max Output Tokens <InfoTooltip text="Limits the maximum number of response tokens generated per turn (num_predict)." />
                    </label>
                    <input
                      type="number"
                      min="-1"
                      max="32768"
                      step="256"
                      value={config.numPredict ?? -1}
                      onChange={(e) => onUpdateConfig?.({ numPredict: parseInt(e.target.value, 10) })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      VRAM Keep-Alive <InfoTooltip text="Duration model stays loaded in VRAM. E.g. '5m', '1h', '-1' (permanent), '0' (instant unload)." />
                    </label>
                    <input
                      type="text"
                      placeholder="5m"
                      value={config.keepAlive ?? ''}
                      onChange={(e) => onUpdateConfig?.({ keepAlive: e.target.value })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      GPU Layers (num_gpu) <InfoTooltip text="Number of model layers offloaded to GPU VRAM (-1 for auto/all, 0 for CPU only)." />
                    </label>
                    <input
                      type="number"
                      min="-1"
                      max="128"
                      step="1"
                      placeholder="-1 (Auto)"
                      value={config.numGpu ?? ''}
                      onChange={(e) => onUpdateConfig?.({ numGpu: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      CPU Threads (num_thread) <InfoTooltip text="Number of CPU worker threads used during CPU inference execution." />
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="64"
                      step="1"
                      placeholder="Auto"
                      value={config.numThread ?? ''}
                      onChange={(e) => onUpdateConfig?.({ numThread: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      Mirostat Mode <InfoTooltip text="Controls perplexity: 0 = Disabled, 1 = Mirostat 1.0, 2 = Mirostat 2.0 (best for long code output)." />
                    </label>
                    <select
                      value={config.mirostat ?? 0}
                      onChange={(e) => onUpdateConfig?.({ mirostat: parseInt(e.target.value, 10) })}
                      style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                    >
                      <option value={0}>0 (Disabled)</option>
                      <option value={1}>1 (Mirostat 1.0)</option>
                      <option value={2}>2 (Mirostat 2.0)</option>
                    </select>
                  </div>

                  {config.mirostat !== 0 && (
                    <>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                          Mirostat Eta <InfoTooltip text="Learning rate for Mirostat entropy adjustments (Default: 0.1)." />
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          max="1.0"
                          step="0.05"
                          value={config.mirostatEta ?? 0.1}
                          onChange={(e) => onUpdateConfig?.({ mirostatEta: parseFloat(e.target.value) })}
                          style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                          Mirostat Tau <InfoTooltip text="Target entropy threshold for Mirostat (Default: 5.0)." />
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          max="10.0"
                          step="0.5"
                          value={config.mirostatTau ?? 5.0}
                          onChange={(e) => onUpdateConfig?.({ mirostatTau: parseFloat(e.target.value) })}
                          style={{ width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Low VRAM Mode <InfoTooltip text="Forces aggressive memory reduction to fit large models onto smaller GPUs." />
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(config.lowVram)}
                      className={`model-toggle ${config.lowVram ? 'active' : ''}`}
                      onClick={() => onUpdateConfig?.({ lowVram: !config.lowVram })}
                      style={{ marginTop: '4px' }}
                    >
                      <span /> {config.lowVram ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      FP16 KV Cache (f16_kv) <InfoTooltip text="Uses FP16 for Key-Value context memory, drastically saving VRAM on 32k+ contexts." />
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(config.f16Kv)}
                      className={`model-toggle ${config.f16Kv ? 'active' : ''}`}
                      onClick={() => onUpdateConfig?.({ f16Kv: !config.f16Kv })}
                      style={{ marginTop: '4px' }}
                    >
                      <span /> {config.f16Kv ? 'Enabled (FP16)' : 'Default (FP32)'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Server Daemon Environment Variables Accordion */}
          <section className="model-settings-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
            <button
              type="button"
              onClick={() => setDaemonOpen(!daemonOpen)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #60a5fa)',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              <span>🖥️ Server Daemon Environment Variables (Host System)</span>
              <span>{daemonOpen ? '▲ Hide' : '▼ Expand'}</span>
            </button>

            {daemonOpen && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '0.78rem',
                    color: '#fef08a',
                    lineHeight: '1.4',
                  }}
                >
                  <strong>⚠️ Remote Endpoint Warning:</strong> Server daemon environment variables (such as <code>OLLAMA_NUM_PARALLEL</code> or <code>OLLAMA_FLASH_ATTENTION</code>) control low-level host GPU allocations when <code>ollama serve</code> launches. If connecting to an external/remote Ollama server endpoint, these settings <em>cannot</em> be changed remotely via REST API and must be configured directly on the remote host.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', fontSize: '0.8rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      OLLAMA_NUM_PARALLEL <InfoTooltip text="Maximum parallel inference requests per model. Requires additional GPU VRAM." />
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={draftNumParallel}
                      onChange={(e) => setDraftNumParallel(parseInt(e.target.value, 10) || 1)}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      OLLAMA_MAX_LOADED_MODELS <InfoTooltip text="Max distinct models allowed to stay loaded simultaneously in GPU VRAM." />
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={draftMaxLoadedModels}
                      onChange={(e) => setDraftMaxLoadedModels(parseInt(e.target.value, 10) || 1)}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      OLLAMA_FLASH_ATTENTION <InfoTooltip text="Enables FlashAttention-2 (slashes VRAM consumption and speeds up processing on modern GPUs)." />
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draftFlashAttention}
                      className={`model-toggle ${draftFlashAttention ? 'active' : ''}`}
                      onClick={() => setDraftFlashAttention(!draftFlashAttention)}
                      style={{ marginTop: '4px' }}
                    >
                      <span /> {draftFlashAttention ? 'Enabled (=1)' : 'Disabled (=0)'}
                    </button>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      OLLAMA_MODELS Path <InfoTooltip text="Custom storage folder path for downloaded model weights (leave blank for default)." />
                    </label>
                    <input
                      type="text"
                      placeholder="~/.ollama/models"
                      value={draftModelsPath}
                      onChange={(e) => setDraftModelsPath(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      OLLAMA_ORIGINS <InfoTooltip text="Allowed CORS origins list (e.g. '*' or 'http://localhost:5173' for LAN access)." />
                    </label>
                    <input
                      type="text"
                      placeholder="*"
                      value={draftOrigins}
                      onChange={(e) => setDraftOrigins(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      OLLAMA_LOAD_TIMEOUT <InfoTooltip text="Max time to wait for model loading before timing out (Default: '5m')." />
                    </label>
                    <input
                      type="text"
                      placeholder="5m"
                      value={draftLoadTimeout}
                      onChange={(e) => setDraftLoadTimeout(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      setRestartingDaemon('saving');
                      setDaemonMessage('');
                      try {
                        if (onUpdateConfig) {
                          await onUpdateConfig({
                            ollamaNumParallel: draftNumParallel,
                            ollamaFlashAttention: draftFlashAttention,
                            ollamaMaxLoadedModels: draftMaxLoadedModels,
                            ollamaModelsPath: draftModelsPath,
                            ollamaOrigins: draftOrigins,
                            ollamaLoadTimeout: draftLoadTimeout,
                          });
                        }
                        setRestartingDaemon('success');
                        setDaemonMessage('Saved config! Run command or click Restart below.');
                      } catch (err: any) {
                        setRestartingDaemon('error');
                        setDaemonMessage(err.message || 'Failed to save config.');
                      }
                    }}
                    disabled={restartingDaemon === 'saving'}
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid var(--accent-primary, #3b82f6)',
                      borderRadius: '6px',
                      color: 'var(--accent-primary, #60a5fa)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {restartingDaemon === 'saving' ? <Loader2 size={14} className="spin" /> : '💾'}
                    Save Config
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setRestartingDaemon('saving');
                      setDaemonMessage('Restarting local Ollama server...');
                      try {
                        if (onUpdateConfig) {
                          await onUpdateConfig({
                            ollamaNumParallel: draftNumParallel,
                            ollamaFlashAttention: draftFlashAttention,
                            ollamaMaxLoadedModels: draftMaxLoadedModels,
                            ollamaModelsPath: draftModelsPath,
                            ollamaOrigins: draftOrigins,
                            ollamaLoadTimeout: draftLoadTimeout,
                          });
                        }
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 5000);
                        const res = await fetch('/api/models/restart-server', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ollamaNumParallel: draftNumParallel,
                            ollamaFlashAttention: draftFlashAttention,
                            ollamaMaxLoadedModels: draftMaxLoadedModels,
                            ollamaModelsPath: draftModelsPath,
                            ollamaOrigins: draftOrigins,
                            ollamaLoadTimeout: draftLoadTimeout,
                          }),
                          signal: controller.signal,
                        }).finally(() => clearTimeout(timer));
                        const data = await res.json();
                        if (data.success) {
                          setRestartingDaemon('success');
                          setDaemonMessage('⚡ ' + (data.message || 'Server restarted with new environment variables!'));
                        } else {
                          setRestartingDaemon('error');
                          setDaemonMessage('⚠️ ' + (data.error || 'Failed to restart server.'));
                        }
                      } catch (err: any) {
                        setRestartingDaemon('error');
                        setDaemonMessage('⚠️ ' + (err.message || 'Error communicating with server API.'));
                      }
                    }}
                    disabled={restartingDaemon === 'saving'}
                    style={{
                      background: 'var(--accent-primary, #3b82f6)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {restartingDaemon === 'saving' ? <Loader2 size={14} className="spin" /> : '⚡'}
                    Execute Server Restart
                  </button>

                  {daemonMessage && (
                    <span style={{ fontSize: '0.75rem', color: restartingDaemon === 'success' ? '#34d399' : '#fb7185', fontWeight: 500, width: '100%', marginTop: '4px' }}>
                      {daemonMessage}
                    </span>
                  )}
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>⚡ Live Generated Local Server Launch Command:</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setOsFormat('systemd')}
                        style={{
                          background: osFormat === 'systemd' ? 'var(--accent-primary, #3b82f6)' : 'rgba(255,255,255,0.06)',
                          border: 'none',
                          borderRadius: '6px',
                          color: osFormat === 'systemd' ? '#fff' : 'var(--text-muted)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Linux Systemd
                      </button>
                      <button
                        type="button"
                        onClick={() => setOsFormat('bash')}
                        style={{
                          background: osFormat === 'bash' ? 'var(--accent-primary, #3b82f6)' : 'rgba(255,255,255,0.06)',
                          border: 'none',
                          borderRadius: '6px',
                          color: osFormat === 'bash' ? '#fff' : 'var(--text-muted)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Linux (Bash)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOsFormat('powershell')}
                        style={{
                          background: osFormat === 'powershell' ? 'var(--accent-primary, #3b82f6)' : 'rgba(255,255,255,0.06)',
                          border: 'none',
                          borderRadius: '6px',
                          color: osFormat === 'powershell' ? '#fff' : 'var(--text-muted)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Win (PowerShell)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOsFormat('cmd')}
                        style={{
                          background: osFormat === 'cmd' ? 'var(--accent-primary, #3b82f6)' : 'rgba(255,255,255,0.06)',
                          border: 'none',
                          borderRadius: '4px',
                          color: osFormat === 'cmd' ? '#fff' : 'var(--text-muted)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Win (CMD)
                      </button>
                    </div>
                  </div>

                  {(() => {
                    let cmdText = '';
                    const originsStr = draftOrigins.trim() ? ` OLLAMA_ORIGINS="${draftOrigins.trim()}"` : '';
                    const timeoutStr = draftLoadTimeout.trim() ? ` OLLAMA_LOAD_TIMEOUT="${draftLoadTimeout.trim()}"` : '';
                    const modelsStr = draftModelsPath.trim() ? ` OLLAMA_MODELS="${draftModelsPath.trim()}"` : '';

                    if (osFormat === 'systemd') {
                      cmdText = `sudo mkdir -p /etc/systemd/system/ollama.service.d && printf '[Service]\\nEnvironment="OLLAMA_NUM_PARALLEL=${draftNumParallel}"\\nEnvironment="OLLAMA_FLASH_ATTENTION=${draftFlashAttention ? 1 : 0}"\\nEnvironment="OLLAMA_MAX_LOADED_MODELS=${draftMaxLoadedModels}"${draftModelsPath.trim() ? `\\nEnvironment="OLLAMA_MODELS=${draftModelsPath.trim()}"` : ''}${draftOrigins.trim() ? `\\nEnvironment="OLLAMA_ORIGINS=${draftOrigins.trim()}"` : ''}${draftLoadTimeout.trim() ? `\\nEnvironment="OLLAMA_LOAD_TIMEOUT=${draftLoadTimeout.trim()}"` : ''}\\n' | sudo tee /etc/systemd/system/ollama.service.d/parallel.conf >/dev/null && sudo systemctl daemon-reload && sudo systemctl restart ollama && sudo systemctl show ollama --property=Environment --value --no-pager | tr ' ' '\\n' | grep '^OLLAMA_'`;
                    } else if (osFormat === 'powershell') {
                      cmdText = `$env:OLLAMA_NUM_PARALLEL="${draftNumParallel}"; $env:OLLAMA_FLASH_ATTENTION="${draftFlashAttention ? 1 : 0}"; $env:OLLAMA_MAX_LOADED_MODELS="${draftMaxLoadedModels}";${draftModelsPath.trim() ? ` $env:OLLAMA_MODELS="${draftModelsPath.trim()}";` : ''}${draftOrigins.trim() ? ` $env:OLLAMA_ORIGINS="${draftOrigins.trim()}";` : ''}${draftLoadTimeout.trim() ? ` $env:OLLAMA_LOAD_TIMEOUT="${draftLoadTimeout.trim()}";` : ''} ollama serve`;
                    } else if (osFormat === 'cmd') {
                      cmdText = `set OLLAMA_NUM_PARALLEL=${draftNumParallel} && set OLLAMA_FLASH_ATTENTION=${draftFlashAttention ? 1 : 0} && set OLLAMA_MAX_LOADED_MODELS=${draftMaxLoadedModels}${draftModelsPath.trim() ? ` && set OLLAMA_MODELS="${draftModelsPath.trim()}"` : ''}${draftOrigins.trim() ? ` && set OLLAMA_ORIGINS="${draftOrigins.trim()}"` : ''}${draftLoadTimeout.trim() ? ` && set OLLAMA_LOAD_TIMEOUT="${draftLoadTimeout.trim()}"` : ''} && ollama serve`;
                    } else {
                      cmdText = `export OLLAMA_NUM_PARALLEL=${draftNumParallel} OLLAMA_FLASH_ATTENTION=${draftFlashAttention ? 1 : 0} OLLAMA_MAX_LOADED_MODELS=${draftMaxLoadedModels}${modelsStr}${originsStr}${timeoutStr} && ollama serve`;
                    }
                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <code style={{ fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', flex: 1 }}>
                            {cmdText}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(cmdText);
                              setCopiedScript(true);
                              setTimeout(() => setCopiedScript(false), 2000);
                            }}
                            style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              borderRadius: '4px',
                              color: '#38bdf8',
                              fontSize: '0.72rem',
                              padding: '6px 10px',
                              cursor: 'pointer',
                              fontWeight: 600,
                              marginLeft: '8px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {copiedScript ? '✓ Copied!' : '📋 Copy'}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </section>

          <section className="model-settings-section model-tool-setting">
            <div>
              <label><Terminal size={17} /> Tool calling capability <InfoTooltip text="Indicates whether the active model natively parses function calls or uses system prompt fallbacks." /></label>
              <p style={{ margin: 0 }}>
                {config.supportsNativeTools !== false ? (
                  <span style={{ color: 'var(--accent-teal)', fontWeight: 500 }}>
                    ✓ Model natively supports Ollama function tool calling.
                  </span>
                ) : (
                  <span style={{ color: '#f59e0b', fontWeight: 500 }}>
                    ⚠️ Model does not support native Ollama tools. Active mode: System-Prompt Fallback.
                  </span>
                )}
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', background: config.supportsNativeTools !== false ? 'rgba(20, 184, 166, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: config.supportsNativeTools !== false ? 'var(--accent-teal)' : '#f59e0b' }}>
              {config.supportsNativeTools !== false ? 'Native' : 'Prompt Fallback'}
            </span>
          </section>
        </div>
      </div>
    </div>
  );
};
