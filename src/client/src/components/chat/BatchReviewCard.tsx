/**
 * BatchReviewCard — shown after a batch-mode turn completes.
 * Lists every file the agent changed with before/after diffs.
 * The user picks which ones to keep vs revert, then submits.
 */
import React, { useState, useMemo } from 'react';
import { RotateCcw, CheckCircle2, Loader2, Layers, ChevronDown, ChevronRight } from 'lucide-react';

export interface BatchReviewFile {
  path: string;
  before: string | null;
  after: string | null;
  /** Controlled by parent — true = keep the change, false = revert it */
  revert: boolean;
}

type DiffLine = {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLine?: number;
  newLine?: number;
};
type SimpleDiff = { lines: DiffLine[]; truncated: boolean };

// Build a simple diff from before/after strings for display
function buildSimpleDiff(before: string | null, after: string | null): SimpleDiff | null {
  if (before === null && after === null) return null;
  if (before === after) return null;

  const beforeLines = (before ?? '').split('\n');
  const afterLines = (after ?? '').split('\n');

  // For new files just show the entire after as adds
  if (before === null) {
    return {
      lines: afterLines.map((content, i) => ({ type: 'add' as const, newLine: i + 1, content })),
      truncated: afterLines.length > 120,
    };
  }
  // For deleted files show before as removes
  if (after === null) {
    return {
      lines: beforeLines.map((content, i) => ({ type: 'remove' as const, oldLine: i + 1, content })),
      truncated: beforeLines.length > 120,
    };
  }

  // Simple line-by-line diff (LCS not needed — just highlight changed lines)
  const lines: DiffLine[] = [];
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  let oldLine = 1;
  let newLine = 1;
  let truncated = false;
  for (let i = 0; i < maxLen; i++) {
    if (lines.length >= 120) { truncated = true; break; }
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === undefined) {
      lines.push({ type: 'add', newLine: newLine++, content: a });
    } else if (a === undefined) {
      lines.push({ type: 'remove', oldLine: oldLine++, content: b });
    } else if (b === a) {
      lines.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, content: b });
    } else {
      lines.push({ type: 'remove', oldLine: oldLine++, content: b });
      lines.push({ type: 'add', newLine: newLine++, content: a });
    }
  }
  return { lines, truncated };
}

interface DiffViewProps {
  before: string | null;
  after: string | null;
}

const DiffView: React.FC<DiffViewProps> = ({ before, after }) => {
  const diff = useMemo<SimpleDiff | null>(() => buildSimpleDiff(before, after), [before, after]);
  if (!diff) return <div style={{ padding: '8px 12px', color: 'var(--text-dim)', fontSize: '0.78rem' }}>No visible changes.</div>;

  return (
    <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.78rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', overflow: 'auto', maxHeight: '260px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
        <tbody>
          {diff.lines.map((line, i) => {
            const bg =
              line.type === 'add' ? 'rgba(16,185,129,0.12)' :
              line.type === 'remove' ? 'rgba(239,68,68,0.12)' :
              'transparent';
            const color =
              line.type === 'add' ? '#4ade80' :
              line.type === 'remove' ? '#f87171' : 'var(--text-main)';
            const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
            return (
              <tr key={i} style={{ background: bg }}>
                <td style={{ padding: '1px 8px', color: 'var(--text-dim)', userSelect: 'none', textAlign: 'right', minWidth: '32px', fontSize: '0.7rem' }}>
                  {'oldLine' in line && line.oldLine != null ? line.oldLine : ''}
                </td>
                <td style={{ padding: '1px 8px', color: 'var(--text-dim)', userSelect: 'none', textAlign: 'right', minWidth: '32px', fontSize: '0.7rem' }}>
                  {'newLine' in line && line.newLine != null ? line.newLine : ''}
                </td>
                <td style={{ padding: '1px 6px', color, userSelect: 'none', minWidth: '16px' }}>{prefix}</td>
                <td style={{ padding: '1px 8px 1px 0', color, whiteSpace: 'pre' }}>{line.content}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {diff.truncated && (
        <div style={{ padding: '4px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          Diff truncated — showing first 120 lines.
        </div>
      )}
    </div>
  );
};

interface FileRowProps {
  file: BatchReviewFile;
  onToggleRevert: (path: string) => void;
}

const FileRow: React.FC<FileRowProps> = ({ file, onToggleRevert }) => {
  const [expanded, setExpanded] = useState(false);
  const basename = file.path.split('/').pop() ?? file.path;
  const label =
    file.before === null ? '+ New file' :
    file.after === null ? '− Deleted' : '✎ Modified';
  const labelColor =
    file.before === null ? '#4ade80' :
    file.after === null ? '#f87171' : 'var(--accent-amber)';

  return (
    <div style={{
      borderRadius: '8px',
      border: `1px solid ${file.revert ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
      background: file.revert ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)',
      overflow: 'hidden',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px' }}>
        {/* Revert toggle */}
        <input
          type="checkbox"
          id={`revert-${file.path}`}
          checked={file.revert}
          onChange={() => onToggleRevert(file.path)}
          title={file.revert ? 'Will be reverted' : 'Will be kept'}
          style={{ accentColor: '#ef4444', width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
        />
        {/* Kind badge */}
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: labelColor,
          background: `${labelColor}18`, border: `1px solid ${labelColor}40`,
          borderRadius: '4px', padding: '1px 6px', flexShrink: 0,
          fontFamily: 'var(--font-code)',
        }}>{label}</span>
        {/* File path */}
        <span
          title={file.path}
          style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', fontSize: '0.82rem', fontFamily: 'var(--font-code)',
            color: file.revert ? 'var(--text-dim)' : 'var(--text-main)',
            textDecoration: file.revert ? 'line-through' : 'none',
          }}
        >{basename}</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0 }}>{file.revert ? 'revert' : 'keep'}</span>
        {/* Expand diff */}
        <button
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? 'Hide diff' : 'Show diff'}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'none', border: '1px solid var(--border-color)',
            color: 'var(--text-muted)', borderRadius: '5px', padding: '3px 8px',
            fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          diff
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 12px' }}>
          <DiffView before={file.before} after={file.after} />
        </div>
      )}
    </div>
  );
};

interface BatchReviewCardProps {
  files: BatchReviewFile[];
  isSubmitting: boolean;
  onConfirm: (revertPaths: string[]) => void;
  onToggleRevert: (path: string) => void;
}

export const BatchReviewCard: React.FC<BatchReviewCardProps> = ({
  files,
  isSubmitting,
  onConfirm,
  onToggleRevert,
}) => {
  const toRevert = files.filter((f) => f.revert);
  const toKeep = files.filter((f) => !f.revert);
  const allReverted = toRevert.length === files.length;
  const noneReverted = toRevert.length === 0;

  const handleSelectAllToggle = () => {
    if (allReverted) {
      files.forEach((f) => { if (f.revert) onToggleRevert(f.path); });
    } else {
      files.forEach((f) => { if (!f.revert) onToggleRevert(f.path); });
    }
  };

  return (
    <div
      className="glass-panel animate-fade-in"
      style={{
        display: 'flex', flexDirection: 'column', gap: '14px',
        marginLeft: '44px', padding: '18px 20px',
        borderRadius: '14px',
        border: '2px solid rgba(20,184,166,0.45)',
        background: 'rgba(20,184,166,0.06)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px',
          background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Layers size={18} color="var(--accent-teal)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Review File Changes
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            The agent changed <strong style={{ color: 'var(--accent-teal)' }}>{files.length}</strong> file{files.length !== 1 ? 's' : ''}.
            Check the files you want to <strong style={{ color: '#ef4444' }}>revert</strong>, then confirm.
          </div>
        </div>
        <button
          onClick={handleSelectAllToggle}
          style={{
            background: 'none', border: '1px solid var(--border-color)',
            color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 10px',
            fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {allReverted ? 'Keep All' : 'Revert All'}
        </button>
      </div>

      {/* File list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {files.map((file) => (
          <FileRow key={file.path} file={file} onToggleRevert={onToggleRevert} />
        ))}
      </div>

      {/* Summary + action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {noneReverted
            ? <span style={{ color: '#4ade80' }}>✓ Keeping all {files.length} change{files.length !== 1 ? 's' : ''}</span>
            : <span><span style={{ color: '#f87171' }}>↩ {toRevert.length}</span> to revert · <span style={{ color: '#4ade80' }}>✓ {toKeep.length}</span> to keep</span>}
        </div>
        <button
          onClick={() => onConfirm(toRevert.map((f) => f.path))}
          disabled={isSubmitting}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            background: noneReverted ? 'rgba(16,185,129,0.15)' : 'rgba(20,184,166,0.2)',
            border: `1px solid ${noneReverted ? 'rgba(16,185,129,0.5)' : 'rgba(20,184,166,0.5)'}`,
            color: noneReverted ? '#4ade80' : 'var(--accent-teal)',
            padding: '10px 20px', borderRadius: '9px', fontSize: '0.875rem', fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.65 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isSubmitting
            ? <Loader2 size={16} className="spin" />
            : noneReverted
            ? <CheckCircle2 size={16} />
            : <RotateCcw size={16} />}
          <span>
            {isSubmitting ? 'Applying…' : noneReverted ? 'Keep All Changes' : `Revert ${toRevert.length} File${toRevert.length !== 1 ? 's' : ''}`}
          </span>
        </button>
      </div>
    </div>
  );
};
