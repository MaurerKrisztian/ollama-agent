import React from 'react';
import { Brain, Cpu, Info, SlidersHorizontal, X } from 'lucide-react';
import { AgentConfig, OllamaModelInfo, OllamaRunningModelInfo } from '../types';

interface ModelSettingsModalProps {
  isOpen: boolean;
  config: AgentConfig;
  models: OllamaModelInfo[];
  runningModels: OllamaRunningModelInfo[];
  onClose: () => void;
  onSelectModel: (model: string) => void;
  onChangeTemperature: (temperature: number) => void;
  onChangeContextWindow: (contextWindow: number) => void;
  onToggleThinking: (enabled: boolean) => void;
  onOpenModelDetails: () => void;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  config,
  models,
  runningModels,
  onClose,
  onSelectModel,
  onChangeTemperature,
  onChangeContextWindow,
  onToggleThinking,
  onOpenModelDetails,
}) => {
  if (!isOpen) return null;

  const loadedModel = runningModels.find((model) => model.name === config.model || model.model === config.model);
  const vramGb = loadedModel?.size_vram
    ? (loadedModel.size_vram / (1024 * 1024 * 1024)).toFixed(2)
    : null;

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
            </div>
            <div className={`model-status ${loadedModel ? 'loaded' : ''}`}>
              <span />
              {loadedModel ? `Loaded${vramGb ? ` · ${vramGb} GB VRAM` : ''}` : 'Idle · loads on the next prompt'}
            </div>
          </section>

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
              <p>Show reasoning for models that support thinking output.</p>
            </div>
            <button
              id="model-thinking"
              type="button"
              role="switch"
              aria-checked={config.enableThinking !== false}
              className={`model-toggle ${config.enableThinking !== false ? 'active' : ''}`}
              onClick={() => onToggleThinking(config.enableThinking === false)}
            >
              <span /> {config.enableThinking !== false ? 'On' : 'Off'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
