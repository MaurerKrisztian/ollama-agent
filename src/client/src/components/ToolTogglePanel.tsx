import React, { useEffect, useState } from 'react';
import { Check, Info } from 'lucide-react';

export interface ToolDefinitionEntry {
  name: string;
  group: string;
  groupColor: string;
  groupDescription: string;
}

interface ToolGroup {
  name: string;
  color: string;
  description: string;
  tools: ToolDefinitionEntry[];
}

export interface ToolTogglePanelProps {
  /** Current enabled state for each tool. Missing keys are treated as enabled. */
  enabledTools: Record<string, boolean>;
  onChange: (updated: Record<string, boolean>) => void;
  /**
   * 'modal'   — styled pill toggles with Info button (ToolSettingsModal)
   * 'compact' — native checkboxes (BenchmarkView)
   */
  variant?: 'modal' | 'compact';
  /** When true, all controls are non-interactive. */
  disabled?: boolean;
  /** Called when the Info button is clicked on a tool (modal variant only). */
  onInfoClick?: (toolName: string) => void;
}

function groupTools(definitions: ToolDefinitionEntry[]): ToolGroup[] {
  const map = new Map<string, ToolGroup>();
  for (const def of definitions) {
    if (!map.has(def.group)) {
      map.set(def.group, { name: def.group, color: def.groupColor, description: def.groupDescription, tools: [] });
    }
    map.get(def.group)!.tools.push(def);
  }
  return Array.from(map.values());
}

export const ToolTogglePanel: React.FC<ToolTogglePanelProps> = ({
  enabledTools,
  onChange,
  variant = 'modal',
  disabled = false,
  onInfoClick,
}) => {
  const [definitions, setDefinitions] = useState<ToolDefinitionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tools/definitions')
      .then((r) => r.json())
      .then((data) => setDefinitions(data.definitions ?? []))
      .catch(() => setDefinitions([]))
      .finally(() => setLoading(false));
  }, []);

  const isEnabled = (name: string) => enabledTools[name] !== false;

  const toggle = (name: string) => {
    if (disabled) return;
    onChange({ ...enabledTools, [name]: !isEnabled(name) });
  };

  const setGroup = (tools: ToolDefinitionEntry[], value: boolean) => {
    if (disabled) return;
    onChange({ ...enabledTools, ...Object.fromEntries(tools.map((t) => [t.name, value])) });
  };

  const setAll = (value: boolean) => {
    if (disabled) return;
    onChange(Object.fromEntries(definitions.map((t) => [t.name, value])));
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px 0' }}>Loading tool definitions…</div>;
  }
  if (definitions.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px 0' }}>No tools available.</div>;
  }

  const groups = groupTools(definitions);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Global enable / disable all ── */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        {(['Enable all', 'Disable all'] as const).map((label) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => setAll(label === 'Enable all')}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-muted)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.72rem',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Groups ── */}
      {groups.map((group) => {
        const groupAllOn = group.tools.every((t) => isEnabled(t.name));
        const groupAnyOn = group.tools.some((t) => isEnabled(t.name));

        if (variant === 'compact') {
          return (
            <div
              key={group.name}
              style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(30,41,59,0.45)', border: '1px solid var(--border-color)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: group.color, fontWeight: 600, fontSize: '0.8rem' }}>{group.name}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={groupAllOn}
                    ref={(el) => { if (el) el.indeterminate = !groupAllOn && groupAnyOn; }}
                    onChange={(e) => setGroup(group.tools, e.target.checked)}
                  />
                  {groupAllOn ? 'All on' : groupAnyOn ? 'Partial' : 'All off'}
                </label>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                {group.tools.map((tool) => (
                  <label
                    key={tool.name}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-main)', fontSize: '0.78rem', opacity: disabled ? 0.55 : 1 }}
                  >
                    <input type="checkbox" disabled={disabled} checked={isEnabled(tool.name)} onChange={() => toggle(tool.name)} />
                    <code style={{ fontSize: '0.73rem', color: isEnabled(tool.name) ? group.color : 'var(--text-muted)' }}>{tool.name}</code>
                  </label>
                ))}
              </div>
            </div>
          );
        }

        /* variant === 'modal' */
        return (
          <div
            key={group.name}
            style={{ padding: '12px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid var(--border-color)' }}
          >
            <div className="tool-group-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>{group.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setGroup(group.tools, !groupAllOn)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${group.color}`, background: 'rgba(15, 23, 42, 0.6)', color: group.color, fontSize: '0.75rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
              >
                {groupAllOn ? 'Disable Group' : 'Enable Group'}
              </button>
            </div>
            {group.description && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.35 }}>{group.description}</p>
            )}
            <div className="tool-list-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
              {group.tools.map((tool) => {
                const checked = isEnabled(tool.name);
                return (
                  <label
                    key={tool.name}
                    onClick={() => toggle(tool.name)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: checked ? 'rgba(15, 23, 42, 0.8)' : 'rgba(15, 23, 42, 0.3)', border: `1px solid ${checked ? group.color : 'var(--border-color)'}`, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.8rem', color: checked ? 'var(--text-main)' : 'var(--text-dim)', opacity: disabled ? 0.55 : 1, minWidth: 0 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                      <div style={{ width: '15px', height: '15px', flexShrink: 0, borderRadius: '4px', border: `1px solid ${checked ? group.color : 'var(--text-dim)'}`, background: checked ? group.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {checked && <Check size={11} color="#000" />}
                      </div>
                      <span style={{ fontFamily: 'var(--font-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.75rem' }} title={tool.name}>{tool.name}</span>
                    </div>
                    {onInfoClick && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInfoClick(tool.name); }}
                        title={`Inspect description for ${tool.name}`}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', borderRadius: '4px', opacity: 0.85, flexShrink: 0 }}
                      >
                        <Info size={14} color="var(--accent-teal)" />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
