import React from 'react';
import { X, ShieldAlert, Terminal, Edit3, Wrench, Check, RefreshCw, Cpu, RotateCcw } from 'lucide-react';
import { ToolSettings } from '../types';
import { JsonEditor } from './JsonEditor';

interface ToolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ToolSettings;
  onUpdateSettings: (newSettings: ToolSettings) => void;
}

export const ToolSettingsModal: React.FC<ToolSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const handleToggleTool = (toolName: keyof ToolSettings['enabledTools']) => {
    onUpdateSettings({
      ...settings,
      enabledTools: {
        ...settings.enabledTools,
        [toolName]: !settings.enabledTools[toolName],
      },
    });
  };

  const handleTerminalModeChange = (mode: 'confirm' | 'auto') => {
    onUpdateSettings({ ...settings, terminalMode: mode });
  };

  const handleFileEditModeChange = (mode: 'confirm' | 'auto') => {
    onUpdateSettings({ ...settings, fileEditMode: mode });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '560px',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wrench size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Tool Approval & Safety Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Section 1: Terminal Execution Preferences */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Terminal size={18} color="var(--accent-amber)" />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Terminal Command Execution (`execute_command`)
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Choose whether the agent must ask for your confirmation before running shell commands.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleTerminalModeChange('confirm')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.terminalMode === 'confirm' ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                  background: settings.terminalMode === 'confirm' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.terminalMode === 'confirm' ? 'var(--accent-amber)' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ShieldAlert size={16} />
                <span>Require Confirmation (Default)</span>
              </button>

              <button
                onClick={() => handleTerminalModeChange('auto')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.terminalMode === 'auto' ? 'var(--accent-teal)' : 'var(--border-color)'}`,
                  background: settings.terminalMode === 'auto' ? 'rgba(20, 184, 166, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.terminalMode === 'auto' ? 'var(--accent-teal)' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>⚡ Auto-Approve</span>
              </button>
            </div>
          </div>

          {/* Section 2: File Modification Preferences */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Edit3 size={18} color="var(--accent-primary)" />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                File Edit Mode (`edit_file` / `replace_file`)
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Configure approval requirements for editing existing workspace files.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleFileEditModeChange('auto')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.fileEditMode === 'auto' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: settings.fileEditMode === 'auto' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.fileEditMode === 'auto' ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>⚡ Auto-Approve</span>
              </button>

              <button
                onClick={() => handleFileEditModeChange('confirm')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.fileEditMode === 'confirm' ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                  background: settings.fileEditMode === 'confirm' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.fileEditMode === 'confirm' ? 'var(--accent-amber)' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ShieldAlert size={16} />
                <span>Require Confirmation (Default)</span>
              </button>
            </div>
          </div>

          {/* Section 3: Max Tool Call Iterations */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={18} color="var(--accent-primary)" />
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Max Tool Call Iterations (`maxLoops`)
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-code)',
                  color: 'var(--accent-primary)',
                  background: 'rgba(99, 102, 241, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
              >
                {settings.maxLoops ?? 10} iterations
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Limits the maximum number of sequential tool calls the agent can perform in a single user turn. Increase for complex multi-file refactoring or deep research tasks.
            </p>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={settings.maxLoops ?? 10}
              onChange={(e) => onUpdateSettings({ ...settings, maxLoops: Number(e.target.value) })}
              style={{
                width: '100%',
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Section 4: Enabled Toolset Toggles */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
              Active Toolset Controls
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {(Object.keys(settings.enabledTools) as Array<keyof ToolSettings['enabledTools']>).map((toolKey) => {
                const isChecked = settings.enabledTools[toolKey];
                return (
                  <label
                    key={toolKey}
                    onClick={() => handleToggleTool(toolKey)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: isChecked ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.4)',
                      border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-color)'}`,
                      cursor: 'pointer',
                      fontSize: '0.825rem',
                      color: isChecked ? 'var(--text-main)' : 'var(--text-dim)',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: `1px solid ${isChecked ? 'var(--accent-primary)' : 'var(--text-dim)'}`,
                        background: isChecked ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isChecked && <Check size={12} color="#fff" />}
                    </div>
                    <span style={{ fontFamily: 'var(--font-code)' }}>{toolKey}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 4: MCP (Model Context Protocol) Servers */}
          <McpServersSection />
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-gradient)',
              border: 'none',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const McpServersSection: React.FC = () => {
  const [mcpEnabled, setMcpEnabled] = React.useState<boolean>(true);
  const [servers, setServers] = React.useState<Array<{ name: string; status: string; error?: string; toolsCount: number }>>([]);
  const [allToolDetails, setAllToolDetails] = React.useState<Array<{ name: string; serverName: string; description: string; parameters: any; enabled: boolean }>>([]);
  const [configPath, setConfigPath] = React.useState<string | null>(null);
  const [rawConfig, setRawConfig] = React.useState<string>('{\n  "mcpServers": {}\n}');
  const [isEditingConfig, setIsEditingConfig] = React.useState<boolean>(false);
  const [isJsonValid, setIsJsonValid] = React.useState<boolean>(true);
  const [expandedTool, setExpandedTool] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saveStatus, setSaveStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchMcpStatus = async () => {
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      if (data.success) {
        if (data.mcpEnabled !== undefined) setMcpEnabled(data.mcpEnabled);
        setServers(data.servers || []);
        setConfigPath(data.configPath || null);
        if (data.rawConfig) setRawConfig(data.rawConfig);
        setAllToolDetails(data.allToolDetails || []);
      }
    } catch (_) {}
  };

  const handleReload = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/mcp/reload', { method: 'POST' });
      const data = await res.json();
      if (data.servers) {
        setServers(data.servers);
        setConfigPath(data.configPath);
        if (data.rawConfig) setRawConfig(data.rawConfig);
        setAllToolDetails(data.allToolDetails || []);
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawConfig }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({ type: 'success', message: 'MCP configuration saved & reloaded!' });
        setServers(data.servers || []);
        setConfigPath(data.configPath || null);
        setAllToolDetails(data.allToolDetails || []);
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save configuration.' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message });
    }
    setLoading(false);
  };

  const handleToggleMcpTool = async (toolName: string, currentEnabled: boolean) => {
    try {
      const res = await fetch('/api/mcp/toggle-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setAllToolDetails(data.allToolDetails || []);
        setServers(data.servers || []);
      }
    } catch (_) {}
  };

  const handleToggleGlobal = async () => {
    const nextState = !mcpEnabled;
    setMcpEnabled(nextState);
    try {
      const res = await fetch('/api/mcp/toggle-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.mcpEnabled !== undefined) setMcpEnabled(data.mcpEnabled);
        setAllToolDetails(data.allToolDetails || []);
        setServers(data.servers || []);
      }
    } catch (_) {}
  };

  React.useEffect(() => {
    fetchMcpStatus();
  }, []);

  return (
    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
      {/* Header & Master Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cpu size={18} color={mcpEnabled ? 'var(--accent-primary)' : 'var(--text-dim)'} />
          <div>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: mcpEnabled ? 'var(--text-main)' : 'var(--text-dim)', display: 'block' }}>
              MCP (Model Context Protocol)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Master Enable/Disable Toggle */}
          <button
            type="button"
            onClick={handleToggleGlobal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: mcpEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              border: `1px solid ${mcpEnabled ? 'rgba(34, 197, 94, 0.4)' : 'var(--border-color)'}`,
              color: mcpEnabled ? '#4ade80' : 'var(--text-dim)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: mcpEnabled ? '#4ade80' : 'var(--text-dim)',
              }}
            />
            <span>{mcpEnabled ? 'MCP Enabled' : 'MCP Disabled'}</span>
          </button>

          <button
            onClick={() => setIsEditingConfig(!isEditingConfig)}
            style={{
              background: isEditingConfig ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.8)',
              border: `1px solid ${isEditingConfig ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              color: 'var(--text-main)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {isEditingConfig ? 'Hide Config' : 'Edit JSON Config'}
          </button>
          <button
            onClick={handleReload}
            disabled={loading}
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {!mcpEnabled && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '0.775rem',
          }}
        >
          Model Context Protocol (MCP) is currently <strong>disabled</strong>. The agent will not invoke any external MCP tools until toggled back ON.
        </div>
      )}

      {configPath ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
          Config loaded: <code style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>{configPath}</code>
        </p>
      ) : (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0 0 10px 0' }}>
          No active <code style={{ fontFamily: 'var(--font-code)' }}>mcp_config.json</code> or <code style={{ fontFamily: 'var(--font-code)' }}>.mcp.json</code> found.
        </p>
      )}

      {/* JSON Config Editor Panel */}
      {isEditingConfig && (
        <div style={{ marginBottom: '14px', padding: '12px', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '8px', border: '1px solid var(--accent-primary)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
            MCP Config JSON Editor (`mcp_config.json`)
          </div>
          
          <JsonEditor
            value={rawConfig}
            onChange={(val) => setRawConfig(val)}
            onValidationChange={(isValid) => setIsJsonValid(isValid)}
            rows={9}
          />

          {saveStatus && (
            <div
              style={{
                fontSize: '0.75rem',
                marginTop: '8px',
                color: saveStatus.type === 'success' ? '#4ade80' : '#f87171',
              }}
            >
              {saveStatus.message}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={handleSaveConfig}
              disabled={loading || !isJsonValid}
              style={{
                background: isJsonValid ? 'var(--accent-gradient)' : 'rgba(100, 116, 139, 0.4)',
                border: 'none',
                color: isJsonValid ? '#fff' : 'var(--text-dim)',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: loading || !isJsonValid ? 'not-allowed' : 'pointer',
              }}
            >
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {/* Active Servers Summary */}
      {servers.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
          No MCP servers currently loaded. Click <strong>Edit JSON Config</strong> above to add servers.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {servers.map((s) => (
            <div
              key={s.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{s.name}</span>
                {s.error && (
                  <div style={{ fontSize: '0.725rem', color: '#f87171', marginTop: '2px' }}>{s.error}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.toolsCount} tools</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 600,
                    background: s.status === 'connected' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: s.status === 'connected' ? '#4ade80' : '#f87171',
                    border: `1px solid ${s.status === 'connected' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}
                >
                  {s.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Discovered MCP Tools Grouped by MCP Server */}
      {allToolDetails.length > 0 && (
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
            Discovered MCP Tools ({allToolDetails.length})
          </span>

          {Object.entries(
            allToolDetails.reduce((acc, t) => {
              if (!acc[t.serverName]) acc[t.serverName] = [];
              acc[t.serverName].push(t);
              return acc;
            }, {} as Record<string, typeof allToolDetails>)
          ).map(([serverName, serverTools]) => (
            <div
              key={serverName}
              style={{
                marginBottom: '12px',
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                padding: '10px 12px',
              }}
            >
              {/* Group Server Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  paddingBottom: '6px',
                  borderBottom: '1px dashed var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={14} color="var(--accent-primary)" />
                  <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Server: <code style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>{serverName}</code>
                  </span>
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  {serverTools.length} tool{serverTools.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Group Tools List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {serverTools.map((t) => {
                  const isExpanded = expandedTool === t.name;
                  return (
                    <div
                      key={t.name}
                      style={{
                        borderRadius: '6px',
                        background: t.enabled ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.3)',
                        border: `1px solid ${t.enabled ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)'}`,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                        }}
                      >
                        <label
                          onClick={() => handleToggleMcpTool(t.name, t.enabled)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '3px',
                              border: `1px solid ${t.enabled ? 'var(--accent-primary)' : 'var(--text-dim)'}`,
                              background: t.enabled ? 'var(--accent-primary)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {t.enabled && <Check size={10} color="#fff" />}
                          </div>
                          <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: t.enabled ? 'var(--text-main)' : 'var(--text-dim)' }}>
                            {t.name}
                          </span>
                        </label>
                        <button
                          onClick={() => setExpandedTool(isExpanded ? null : t.name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-primary)',
                            fontSize: '0.725rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>{isExpanded ? 'Hide Info' : 'Inspect'}</span>
                        </button>
                      </div>

                      {/* Tool Schema & Description Inspector */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '10px 12px',
                            background: 'rgba(15, 23, 42, 0.9)',
                            borderTop: '1px solid var(--border-color)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <div style={{ color: 'var(--text-main)', marginBottom: '4px', fontWeight: 500 }}>
                            {t.description}
                          </div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>
                            Server Origin: <code style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>{t.serverName}</code>
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            Parameters Schema:
                          </div>
                          <pre
                            style={{
                              fontFamily: 'var(--font-code)',
                              fontSize: '0.7rem',
                              background: 'rgba(0, 0, 0, 0.5)',
                              padding: '8px',
                              borderRadius: '4px',
                              color: '#a5b4fc',
                              margin: 0,
                              overflowX: 'auto',
                            }}
                          >
                            {JSON.stringify(t.parameters, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
