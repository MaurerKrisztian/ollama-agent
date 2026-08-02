import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { FileDiffData } from '../../types';

export interface FileDiffViewerProps {
  diff: FileDiffData;
  initialExpanded?: boolean;
}

export const FileDiffViewer: React.FC<FileDiffViewerProps> = ({ diff, initialExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const addCount = diff.lines.filter((l) => l.type === 'add').length;
  const removeCount = diff.lines.filter((l) => l.type === 'remove').length;

  return (
    <div
      className="file-diff-viewer"
      style={{
        marginTop: '8px',
        marginBottom: '8px',
        border: '1px solid var(--border-color, #334155)',
        borderRadius: '6px',
        overflow: 'hidden',
        fontSize: '13px',
        fontFamily: 'var(--font-mono, monospace)',
        background: 'var(--bg-secondary, #0f172a)',
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'var(--bg-tertiary, #1e293b)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileText size={14} style={{ color: 'var(--text-muted, #94a3b8)' }} />
        <span style={{ fontWeight: 600, color: 'var(--text-main, #f8fafc)' }}>{diff.path}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', fontSize: '12px' }}>
          {addCount > 0 && <span style={{ color: '#4ade80' }}>+{addCount}</span>}
          {removeCount > 0 && <span style={{ color: '#f87171' }}>-{removeCount}</span>}
        </div>
      </div>

      {isExpanded && (
        <div style={{ overflowX: 'auto', padding: '8px 0', lineHeight: '1.4' }}>
          {diff.lines.map((line, idx) => {
            let bg = 'transparent';
            let color = 'inherit';
            let prefix = ' ';

            if (line.type === 'add') {
              bg = 'rgba(74, 222, 128, 0.1)';
              color = '#4ade80';
              prefix = '+';
            } else if (line.type === 'remove') {
              bg = 'rgba(248, 113, 113, 0.1)';
              color = '#f87171';
              prefix = '-';
            } else if (line.type === 'meta') {
              bg = 'rgba(148, 163, 184, 0.05)';
              color = '#94a3b8';
              prefix = ' ';
            }

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  padding: '1px 12px',
                  background: bg,
                  color,
                  whiteSpace: 'pre',
                }}
              >
                <span style={{ width: '40px', color: '#64748b', userSelect: 'none', textAlign: 'right', paddingRight: '12px' }}>
                  {line.oldLine || ''}
                </span>
                <span style={{ width: '40px', color: '#64748b', userSelect: 'none', textAlign: 'right', paddingRight: '12px' }}>
                  {line.newLine || ''}
                </span>
                <span style={{ width: '16px', userSelect: 'none', color: '#94a3b8' }}>{prefix}</span>
                <span>{line.content}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
