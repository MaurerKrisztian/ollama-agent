import React, { useRef, useEffect } from 'react';
import { X, Circle } from 'lucide-react';

export interface EditorTab {
  path: string;      // relative path — used as key
  name: string;      // filename for display
  dirty: boolean;    // unsaved changes
}

interface EditorTabBarProps {
  tabs: EditorTab[];
  activeTab: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
}

export const EditorTabBar: React.FC<EditorTabBarProps> = ({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
}) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  if (tabs.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        overflowX: 'auto',
        overflowY: 'hidden',
        background: 'var(--bg-secondary, #1e1e2e)',
        borderBottom: '1px solid var(--border, #313244)',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRight: '1px solid var(--border, #313244)',
              background: isActive ? 'var(--bg-primary, #11111b)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent, #89b4fa)' : '2px solid transparent',
              padding: '0 12px 0 14px',
              height: '36px',
              flexShrink: 0,
              transition: 'background 0.1s',
            }}
          >
            <button
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelectTab(tab.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isActive ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #6c7086)',
                fontSize: '13px',
                padding: 0,
                maxWidth: '160px',
                overflow: 'hidden',
              }}
              title={tab.path}
            >
              {tab.dirty && (
                <Circle
                  size={7}
                  fill="var(--accent-warn, #f38ba8)"
                  stroke="none"
                  style={{ flexShrink: 0 }}
                />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab.name}
              </span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.path); }}
              title="Close tab"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted, #585b70)',
                padding: '2px',
                borderRadius: '4px',
                flexShrink: 0,
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary, #cdd6f4)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted, #585b70)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default EditorTabBar;
