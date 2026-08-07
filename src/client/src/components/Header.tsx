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
  Terminal,
  MessageSquare,
  Zap,
  Code2,
  FolderOpen,
  Brain,
  Square,
  SlidersHorizontal,
} from 'lucide-react';
import { AgentConfig, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo, SystemMetrics, ollamaModelNamesMatch } from '../types';

interface HeaderProps {
  config: AgentConfig;
  contextInfo: ContextInfo | null;
  models: OllamaModelInfo[];
  runningModels: OllamaRunningModelInfo[];
  sidebarOpen: boolean;
  activeView: 'chat' | 'benchmark' | 'editor';
  isGenerating?: boolean;
  modelLoadElapsed?: number;
  onSelectView: (view: 'chat' | 'benchmark' | 'editor') => void;
  onToggleSidebar: () => void;
  onSelectModel: (model: string) => void;
  onChangeTemperature: (temp: number) => void;
  onChangeContextWindow?: (ctx: number) => void;
  onToggleThinking?: (enabled: boolean) => void;
  onTogglePlanMode?: (enabled: boolean) => void;
  onNewChat: () => void;
  onOpenSystemPrompt: () => void;
  onOpenToolSettings: () => void;
  onOpenConnectionSettings: () => void;
  onOpenWorkingDirPicker: () => void;
  onToggleWorkingDirInfo: (enabled: boolean) => void;
  onRefreshModels: () => void;
  onOpenModelDetails: () => void;
  onOpenModelSettings: () => void;
  isOllamaConnected?: boolean;
  connectionError?: string | null;
  systemMetrics?: SystemMetrics | null;
  leftSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  activeTerminalCount?: number;
  onOpenTerminalSessions?: () => void;
  activeGenerationsCount?: number;
  onCancelAllGenerations?: () => void;
  isCompacting?: boolean;
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
  activeGenerationsCount = 0,
  onCancelAllGenerations,
  onSelectView,
  onToggleSidebar,
  onSelectModel,
  onChangeTemperature,
  onChangeContextWindow,
  onToggleThinking,
  onTogglePlanMode,
  onNewChat,
  onOpenSystemPrompt,
  onOpenToolSettings,
  onOpenConnectionSettings,
  onOpenWorkingDirPicker,
  onToggleWorkingDirInfo,
  onRefreshModels,
  onOpenModelDetails,
  onOpenModelSettings,
  isOllamaConnected = true,
  connectionError = null,
  systemMetrics,
  leftSidebarOpen = false,
  onToggleLeftSidebar,
  activeTerminalCount = 0,
  onOpenTerminalSessions,
  isCompacting,
}) => {
  const headerLoadedModel = runningModels.find((model) =>
    (ollamaModelNamesMatch(model.name, config.model) || ollamaModelNamesMatch(model.model, config.model)) &&
    model.size_vram > 0
  );
  const modelRuntimeStatus = headerLoadedModel ? 'loaded' : isGenerating ? 'loading' : 'idle';
  const modelRuntimeLabel = modelRuntimeStatus === 'loaded'
    ? 'Loaded in VRAM'
    : modelRuntimeStatus === 'loading'
      ? 'Loading into VRAM'
      : 'Idle';

  return (
    <header className="glass-panel app-header" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
      {/* Brand & Logo */}
      <div className="header-left-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
        <div className="header-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

      {/* Navigation View Switcher Tabs: Chat Agent Studio, Code Editor & Benchmark Runner */}
      <div className="header-view-switcher" style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.7)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)', gap: '4px' }}>
        <button
          onClick={() => onSelectView('chat')}
          title="Switch to Chat Agent Studio View"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.825rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: activeView === 'chat' ? 'var(--accent-gradient)' : 'transparent',
            color: activeView === 'chat' ? '#fff' : 'var(--text-muted)',
            boxShadow: activeView === 'chat' ? '0 2px 10px rgba(99, 102, 241, 0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <MessageSquare size={15} />
          <span>Chat Agent Studio</span>
        </button>

        <button
          onClick={() => onSelectView('editor')}
          title="Switch to Code Editor View"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px',
            border: activeView === 'editor' ? '1px solid rgba(137, 180, 250, 0.5)' : '1px solid transparent',
            fontSize: '0.825rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: activeView === 'editor' ? 'rgba(137, 180, 250, 0.2)' : 'transparent',
            color: activeView === 'editor' ? 'var(--accent, #89b4fa)' : 'var(--text-muted)',
            transition: 'all 0.15s ease',
          }}
        >
          <Code2 size={15} color={activeView === 'editor' ? 'var(--accent, #89b4fa)' : 'var(--text-muted)'} />
          <span>Code Editor</span>
        </button>

        <button
          onClick={() => onSelectView('benchmark')}
          title="Switch to Benchmark Runner View"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px',
            border: activeView === 'benchmark' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
            fontSize: '0.825rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: activeView === 'benchmark' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
            color: activeView === 'benchmark' ? 'var(--accent-amber)' : 'var(--text-muted)',
            transition: 'all 0.15s ease',
          }}
        >
          <Zap size={15} color={activeView === 'benchmark' ? 'var(--accent-amber)' : 'var(--text-muted)'} />
          <span>Benchmark Runner</span>
        </button>
      </div>

      {/* Center Controls: Workdir, Model Selector & Connection Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          className="header-model-settings-button"
          onClick={onOpenModelSettings}
          title={`Model settings · ${config.model} · ${modelRuntimeLabel}`}
        >
          <Cpu size={16} />
          <span className="header-model-name">{config.model}</span>
          <span
            className={`header-model-runtime-dot ${modelRuntimeStatus}`}
            role="status"
            aria-label={modelRuntimeLabel}
            title={modelRuntimeLabel}
          />
          <SlidersHorizontal size={14} />
        </button>

        {/* Ollama Connection Status Badge */}
        <button
          type="button"
          onClick={onOpenConnectionSettings}
          title={
            isOllamaConnected
              ? `Ollama Connected (${config.ollamaHost})\nClick to configure Ollama connection settings`
              : `Ollama Not Connected (${config.ollamaHost})\n${connectionError || 'Server unreachable'}\nClick to configure Ollama connection settings`
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px',
            border: isOllamaConnected
              ? '1px solid rgba(16, 185, 129, 0.35)'
              : '1px solid rgba(239, 68, 68, 0.6)',
            background: isOllamaConnected
              ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(239, 68, 68, 0.18)',
            color: isOllamaConnected ? '#10b981' : '#f87171',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            boxShadow: isOllamaConnected ? 'none' : '0 0 10px rgba(239, 68, 68, 0.3)',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isOllamaConnected ? '#10b981' : '#f87171',
              boxShadow: isOllamaConnected ? '0 0 8px #10b981' : '0 0 8px #f87171',
            }}
          />
          <span>{isOllamaConnected ? 'Ollama Connected' : '⚠️ Ollama Not Connected'}</span>
        </button>
      </div>
      {onChangeContextWindow && (
        <label
          className="header-context-window-control"
          title="Ollama context window (num_ctx). Larger values retain more conversation and tool evidence but use more memory."
        >
          <span className="header-context-window-label">Context</span>
          <select
            aria-label="Model context window"
            value={config.contextWindow || 16384}
            onChange={(event) => onChangeContextWindow(Number(event.target.value))}
          >
            <option value={16384}>16K</option>
            <option value={32768}>32K</option>
            <option value={65536}>64K</option>
            <option value={131072}>128K</option>
            <option value={262144}>256K</option>
          </select>
        </label>
      )}
      <div className="header-center-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Model Selector */}
        <div className="header-model-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
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

        {/* Thinking Toggle */}
        {onToggleThinking && (() => {
          const isUserEnabled = config.enableThinking !== false;
          const supportsThinking = config.supportsThinking !== false;
          const isEffectiveON = isUserEnabled && supportsThinking;
          const isUnsupported = isUserEnabled && !supportsThinking;

          let btnColor = 'var(--text-muted)';
          let btnBorder = '1px solid var(--border-color)';
          let btnBg = 'rgba(15, 23, 42, 0.6)';
          let btnText = 'Thinking: OFF';
          let btnTitle = 'Enable Model Reasoning / Thinking';

          if (isEffectiveON) {
            btnColor = '#c084fc';
            btnBorder = '1px solid rgba(168, 85, 247, 0.5)';
            btnBg = 'rgba(168, 85, 247, 0.15)';
            btnText = 'Thinking: ON';
            btnTitle = 'Disable Model Reasoning / Thinking';
          } else if (isUnsupported) {
            btnColor = '#eab308';
            btnBorder = '1px solid rgba(234, 179, 8, 0.4)';
            btnBg = 'rgba(234, 179, 8, 0.12)';
            btnText = 'Thinking: OFF (Unsupported)';
            btnTitle = `Current model "${config.model}" does not support reasoning/thinking output`;
          } else {
            btnTitle = 'Enable Model Reasoning / Thinking (Currently User Disabled)';
          }

          return (
            <button
              className="header-thinking-control"
              type="button"
              onClick={() => onToggleThinking(!isUserEnabled)}
              title={btnTitle}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: btnBorder,
                background: btnBg,
                color: btnColor,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Brain size={15} color={btnColor} />
              <span>{btnText}</span>
            </button>
          );
        })()}

        {/* Plan Mode Toggle */}
        {onTogglePlanMode && (() => {
          const isPlanEnabled = config.planMode === true;
          return (
            <button
              className="header-thinking-control"
              type="button"
              onClick={() => onTogglePlanMode(!isPlanEnabled)}
              title={isPlanEnabled ? 'Plan Mode active: Research & generate plan before editing code' : 'Enable Plan Mode: Read-only research & plan review before edits'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: isPlanEnabled ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.6)',
                border: isPlanEnabled ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid var(--border-color)',
                color: isPlanEnabled ? '#60a5fa' : 'var(--text-muted)',
              }}
            >
              <span>{isPlanEnabled ? '📋 Plan: ON' : '📋 Plan: OFF'}</span>
            </button>
          );
        })()}

        {/* Tool Calling Capability & Mode Indicator */}
        {(() => {
          const supportsNative = config.supportsNativeTools !== false;
          const toolMode = config.toolMode || (supportsNative ? 'native' : 'prompt_fallback');

          let badgeColor = 'var(--accent-teal)';
          let badgeBorder = '1px solid rgba(20, 184, 166, 0.4)';
          let badgeBg = 'rgba(20, 184, 166, 0.12)';
          let badgeText = 'Tools: Native';
          let badgeTitle = `Model "${config.model}" natively supports Ollama function/tool calling.`;

          if (!supportsNative || toolMode === 'prompt_fallback') {
            badgeColor = '#f59e0b';
            badgeBorder = '1px solid rgba(245, 158, 11, 0.4)';
            badgeBg = 'rgba(245, 158, 11, 0.12)';
            badgeText = 'Tools: Prompt Fallback';
            badgeTitle = `Model "${config.model}" does not natively support Ollama tools. Using System-Prompt Tool Calling Fallback (<tool_call> parsing).`;
          }

          return (
            <button
              className="header-tool-mode-control"
              type="button"
              onClick={onOpenToolSettings}
              title={`${badgeTitle}\nClick to open Tool Settings`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: badgeBorder,
                background: badgeBg,
                color: badgeColor,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Terminal size={15} color={badgeColor} />
              <span>{badgeText}</span>
            </button>
          );
        })()}

        {/* VRAM Loaded Indicator Badge */}
        {(() => {
          const loadedModel = headerLoadedModel;

          if (isGenerating && (!loadedModel || loadedModel.size_vram === 0)) {
            return (
              <div
                className="animate-fade-in header-vram-control"
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
                className="animate-fade-in header-vram-control"
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
                className="header-vram-control"
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
      <div className="header-right-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

        {onOpenTerminalSessions && (
          <button
            onClick={onOpenTerminalSessions}
            title="Manage Long-Running Terminal Sessions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTerminalCount > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.8)',
              border: `1px solid ${activeTerminalCount > 0 ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
              color: activeTerminalCount > 0 ? '#10b981' : 'var(--text-main)',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Terminal size={15} color={activeTerminalCount > 0 ? '#10b981' : 'var(--text-muted)'} />
            <span className="header-btn-text">Terminal ({activeTerminalCount})</span>
          </button>
        )}

        <button
          onClick={onToggleSidebar}
          title={isCompacting ? 'Compacting context into structured state package with Ollama...' : 'Toggle Context Inspector'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isCompacting
              ? 'rgba(245, 158, 11, 0.15)'
              : sidebarOpen
                ? 'rgba(99, 102, 241, 0.2)'
                : 'rgba(15, 23, 42, 0.8)',
            border: `1px solid ${isCompacting ? 'rgba(245, 158, 11, 0.4)' : sidebarOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            color: isCompacting ? 'var(--accent-amber)' : 'var(--text-main)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.825rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {isCompacting ? (
            <>
              <Loader2 size={16} className="spin" color="var(--accent-amber)" />
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--accent-amber)' }}>Compacting…</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                ⚡ Summarizing State
              </span>
            </>
          ) : (
            <>
              <Sidebar size={16} color={sidebarOpen ? 'var(--accent-primary)' : 'var(--text-muted)'} />
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: sidebarOpen ? 'var(--accent-primary)' : 'var(--text-main)' }}>Context Inspector</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.3)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-code, monospace)', display: 'inline-block', textAlign: 'center', minWidth: '90px' }}>
                {contextInfo ? `${contextInfo.estimatedTokens.toLocaleString()} tokens` : '0 tokens'}
              </span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
