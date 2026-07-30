import React from 'react';
import { X, ShieldAlert, Terminal, Edit3, Wrench, Check } from 'lucide-react';
import { ToolSettings } from '../types';

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

          {/* Section 3: Enabled Toolset Toggles */}
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
