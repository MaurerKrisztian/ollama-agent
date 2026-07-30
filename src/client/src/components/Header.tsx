import React, { useState } from 'react';
import {
  Bot,
  FolderOpen,
  PlusCircle,
  Sidebar,
  SlidersHorizontal,
  Cpu,
  RefreshCw,
  MessageSquare,
  Zap,
  Loader2,
  Wrench,
} from 'lucide-react';
import { AgentConfig, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo } from '../types';

interface HeaderProps {
  config: AgentConfig;
  contextInfo: ContextInfo | null;
  models: OllamaModelInfo[];
  runningModels: OllamaRunningModelInfo[];
  sidebarOpen: boolean;
  activeView: 'chat' | 'benchmark';
  isGenerating?: boolean;
  onSelectView: (view: 'chat' | 'benchmark') => void;
  onToggleSidebar: () => void;
  onSelectModel: (model: string) => void;
  onChangeTemperature: (temp: number) => void;
  onNewChat: () => void;
  onOpenSystemPrompt: () => void;
  onOpenToolSettings: () => void;
  onChangeWorkingDir: (dir: string) => void;
  onRefreshModels: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  contextInfo,
  models,
  runningModels,
  sidebarOpen,
  activeView,
  isGenerating,
  onSelectView,
  onToggleSidebar,
  onSelectModel,
  onChangeTemperature,
  onNewChat,
  onOpenSystemPrompt,
  onOpenToolSettings,
  onChangeWorkingDir,
  onRefreshModels,
}) => {
  const [editingDir, setEditingDir] = useState(false);
  const [dirInput, setDirInput] = useState(config.workingDir);

  const handleDirSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dirInput.trim()) {
      onChangeWorkingDir(dirInput.trim());
      setEditingDir(false);
    }
  };

  return (
    <header className="glass-panel" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
            <h1 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Ollama Agent Studio
            </h1>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-dim)', display: 'block' }}>
              Core Agent Engine & Benchmarks
            </span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(15, 23, 42, 0.8)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => onSelectView('chat')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeView === 'chat' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'chat' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
          >
            <MessageSquare size={14} />
            <span>Chat</span>
          </button>
          <button
            onClick={() => onSelectView('benchmark')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeView === 'benchmark' ? 'var(--accent-amber)' : 'transparent',
              color: activeView === 'benchmark' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
          >
            <Zap size={14} />
            <span>Benchmark</span>
          </button>
        </div>
      </div>

      {/* Center Controls: Model, Temp & Working Dir */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
        </div>

        {/* VRAM Loaded Indicator Badge */}
        {(() => {
          const loadedModel = runningModels.find((m) => m.name === config.model || m.model === config.model) || runningModels[0];

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
                <Loader2 size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Loading VRAM...</span>
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
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-color)',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: 'var(--text-dim)',
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-dim)' }} />
                <span>VRAM: Idle</span>
              </div>
            );
          }
        })()}

        {/* Temperature Control Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <SlidersHorizontal size={15} color="var(--accent-amber)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>Temp:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', minWidth: '24px' }}>
            {config.temperature !== undefined ? config.temperature.toFixed(1) : '0.2'}
          </span>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.1"
            value={config.temperature !== undefined ? config.temperature : 0.2}
            onChange={(e) => onChangeTemperature(parseFloat(e.target.value))}
            title="Agent Temperature (0.0 = Deterministic for tools, 1.0 = Creative)"
            style={{ width: '60px', accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
          />
        </div>

        {/* Working Directory Selector */}
        {activeView === 'chat' && (
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderOpen size={16} color="var(--accent-teal)" />
            {editingDir ? (
              <form onSubmit={handleDirSubmit} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  value={dirInput}
                  onChange={(e) => setDirInput(e.target.value)}
                  autoFocus
                  onBlur={() => setEditingDir(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid var(--accent-teal)',
                    color: '#fff',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.8rem',
                    width: '180px',
                    outline: 'none',
                  }}
                />
              </form>
            ) : (
              <span
                onClick={() => { setDirInput(config.workingDir); setEditingDir(true); }}
                title="Click to change working directory"
                style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {config.workingDir}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Controls: Actions & Sidebar Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {activeView === 'chat' && (
          <>
            <button
              onClick={onOpenToolSettings}
              title="Tool Approval & Active Toolset Settings"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Wrench size={15} color="var(--accent-primary)" />
              <span>Tool Settings</span>
            </button>

            <button
              onClick={onOpenSystemPrompt}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <SlidersHorizontal size={15} />
              <span>System Prompt</span>
            </button>

            <button
              onClick={onNewChat}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--accent-gradient)',
                border: 'none',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
              }}
            >
              <PlusCircle size={15} />
              <span>New Chat</span>
            </button>
          </>
        )}

        {/* Context Sidebar Toggle Button */}
        <button
          onClick={onToggleSidebar}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: sidebarOpen ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.8)',
            border: `1px solid ${sidebarOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            color: 'var(--text-main)',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.85rem',
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
