import React from 'react';
import {
  Bot,
  Sidebar,
  Cpu,
  RefreshCw,
  Loader2,
  Info,
  Menu,
  PlusCircle,
} from 'lucide-react';
import { AgentConfig, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo, SystemMetrics } from '../types';

interface HeaderProps {
  config: AgentConfig;
  contextInfo: ContextInfo | null;
  models: OllamaModelInfo[];
  runningModels: OllamaRunningModelInfo[];
  sidebarOpen: boolean;
  activeView: 'chat' | 'benchmark';
  isGenerating?: boolean;
  modelLoadElapsed?: number;
  onSelectView: (view: 'chat' | 'benchmark') => void;
  onToggleSidebar: () => void;
  onSelectModel: (model: string) => void;
  onChangeTemperature: (temp: number) => void;
  onNewChat: () => void;
  onOpenSystemPrompt: () => void;
  onOpenToolSettings: () => void;
  onOpenConnectionSettings: () => void;
  onOpenWorkingDirPicker: () => void;
  onToggleWorkingDirInfo: (enabled: boolean) => void;
  onRefreshModels: () => void;
  onOpenModelDetails: () => void;
  systemMetrics?: SystemMetrics | null;
  leftSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  contextInfo,
  models,
  runningModels,
  sidebarOpen,
  activeView,
  isGenerating,
  modelLoadElapsed = 0,
  onSelectView,
  onToggleSidebar,
  onSelectModel,
  onChangeTemperature,
  onNewChat,
  onOpenSystemPrompt,
  onOpenToolSettings,
  onOpenConnectionSettings,
  onOpenWorkingDirPicker,
  onToggleWorkingDirInfo,
  onRefreshModels,
  onOpenModelDetails,
  systemMetrics,
  leftSidebarOpen = false,
  onToggleLeftSidebar,
}) => {
  return (
    <header className="glass-panel" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onToggleLeftSidebar && (
          <button
            onClick={onToggleLeftSidebar}
            title={leftSidebarOpen ? 'Close Navigation Sidebar' : 'Open Navigation Sidebar'}
            style={{
              background: leftSidebarOpen ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.6)',
              border: `1px solid ${leftSidebarOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              color: leftSidebarOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
              padding: '6px 8px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            <Menu size={18} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
          }}>
            <Bot size={22} color="#fff" />
          </div>
          <div>
            <h1 className="header-brand-title" style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', whiteSpace: 'nowrap' }}>
              Ollama Agent Studio
            </h1>
            <span className="header-subtext" style={{ fontSize: '0.725rem', color: 'var(--text-dim)', display: 'block', whiteSpace: 'nowrap' }}>
              Core Agent Engine & Benchmarks
            </span>
          </div>
        </div>
      </div>

      {/* Center Controls: Model Selector & VRAM Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Model Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <Cpu size={16} color="var(--accent-primary)" />
          <select
            value={config.model}
            onChange={(e) => onSelectModel(e.target.value)}
            style={{
              background: 'transparent',
              color: 'var(--text-main)',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {models.length === 0 ? (
              <option value={config.model}>{config.model} (connecting...)</option>
            ) : (
              models.map((m) => (
                <option key={m.name} value={m.name} style={{ background: '#1e293b' }}>
                  {m.name}
                </option>
              ))
            )}
          </select>
          <button
            onClick={onRefreshModels}
            title="Refresh Ollama Models"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={onOpenModelDetails}
            title="Inspect Model Details (Modelfile, GGUF specs, parameters)"
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid var(--border-color)',
              color: 'var(--accent-primary)',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
            }}
          >
            <Info size={13} />
            <span className="header-btn-text">Inspect Specs</span>
          </button>
        </div>

        {/* VRAM Loaded Indicator Badge */}
        {(() => {
          const loadedModel = runningModels.find((m) => m.name === config.model || m.model === config.model);

          if (isGenerating && (!loadedModel || loadedModel.size_vram === 0)) {
            return (
              <div
                className="animate-fade-in"
                title={`Ollama is currently loading ${config.model} weights into GPU VRAM...`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--accent-amber)',
                }}
              >
                <Loader2 size={14} className="spin" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '112px' }}>
                  <span>Loading VRAM… {modelLoadElapsed}s</span>
                  <div className="model-load-track model-load-track-compact" aria-hidden="true">
                    <div className="model-load-bar" />
                  </div>
                </div>
              </div>
            );
          }

          if (loadedModel) {
            const vramGb = (loadedModel.size_vram / (1024 * 1024 * 1024)).toFixed(2);
            const paramSize = loadedModel.details?.parameter_size || '';
            const quant = loadedModel.details?.quantization_level || '';
            return (
              <div
                className="animate-fade-in"
                title={`Model "${loadedModel.name}" is active & loaded in GPU VRAM (${vramGb} GB)`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#10b981',
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                <span>VRAM: {vramGb} GB</span>
                {paramSize && <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>({paramSize} {quant})</span>}
              </div>
            );
          } else {
            return (
              <div
                title="No model currently loaded in GPU VRAM (Idle). Will auto-load on next prompt."
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-dim)' }} />
                <span>VRAM: Idle</span>
              </div>
            );
          }
        })()}
      </div>

      {/* Right Controls: New Chat Session & Context Inspector Sidebar Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {activeView === 'chat' && (
          <button
            onClick={onNewChat}
            title="Start New Chat Session"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--accent-gradient)',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
              transition: 'transform 0.15s ease',
            }}
          >
            <PlusCircle size={15} />
            <span className="header-btn-text">New Chat</span>
          </button>
        )}

        <button
          onClick={onToggleSidebar}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: sidebarOpen ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.8)',
            border: `1px solid ${sidebarOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            color: 'var(--text-main)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.825rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Sidebar size={16} color={sidebarOpen ? 'var(--accent-primary)' : 'var(--text-muted)'} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            {contextInfo ? `${contextInfo.estimatedTokens.toLocaleString()} tokens` : '0 tokens'}
          </span>
        </button>
      </div>
    </header>
  );
};
