import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, Brain, CheckCircle2, Cpu, Download, Info, Loader2, Power, Search, SlidersHorizontal, Terminal, X } from 'lucide-react';
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
}

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
}) => {
  const [downloadOpen, setDownloadOpen] = useState(false);
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
            <p>Configure the active model and generation behavior.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close model settings"><X size={20} /></button>
        </div>

        <div className="model-settings-body">
          <section className="model-settings-section">
            <label htmlFor="active-model"><Cpu size={17} /> Active model</label>
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
              <p>Disk and VRAM values are estimates for the listed tag and a moderate context size. Ollama reports the exact download size after a pull begins. Larger context windows need more memory. Models that do not fit fully in VRAM may still run using system RAM and CPU offload. Custom model requirements are unknown until downloaded.</p>
            </section>
          )}

          <section className="model-settings-section">
            <label htmlFor="context-window">Context window</label>
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
            <label htmlFor="classifier-model">Fast Link Classifier Model (Deep Research)</label>
            <select
              id="classifier-model"
              value={config.classifierModel || ''}
              onChange={(event) => onChangeClassifierModel?.(event.target.value)}
            >
              <option value="">Same as main model ({config.model})</option>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} (Installed)
                </option>
              ))}
            </select>
            <p>Optional smaller, faster model (e.g., qwen2.5:0.5b or llama3.2:1b) to classify and rank links concurrently during Deep Research.</p>
          </section>

          <section className="model-settings-section">
            <div className="model-setting-title-row">
              <label htmlFor="temperature">Temperature</label>
              <output>{config.temperature.toFixed(1)}</output>
            </div>
            <input id="temperature" type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => onChangeTemperature(Number(event.target.value))} />
            <p>Lower values are more focused; higher values produce more varied responses.</p>
          </section>

          <section className="model-settings-section model-thinking-setting">
            <div>
              <label htmlFor="model-thinking"><Brain size={17} /> Thinking mode</label>
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

          <section className="model-settings-section model-tool-setting">
            <div>
              <label><Terminal size={17} /> Tool calling capability</label>
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
