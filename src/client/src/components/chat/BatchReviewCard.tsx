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
  type: 'context' | 'add' | 'remove' | 'hunk_header';
  content: string;
  oldLine?: number;
  newLine?: number;
};
type SimpleDiff = { lines: DiffLine[]; firstChangedIndex: number; truncated: boolean };

// Build a smart hunk-based diff from before/after strings focusing on actual changes
function buildSimpleDiff(before: string | null, after: string | null): SimpleDiff | null {
  if (before === null && after === null) return null;
  if (before === after) return null;

  const beforeLines = (before ?? '').split('\n');
  const afterLines = (after ?? '').split('\n');

  if (before === null) {
    const lines: DiffLine[] = afterLines.map((content, i) => ({ type: 'add' as const, newLine: i + 1, content }));
    return { lines: lines.slice(0, 500), firstChangedIndex: 0, truncated: lines.length > 500 };
  }

  if (after === null) {
    const lines: DiffLine[] = beforeLines.map((content, i) => ({ type: 'remove' as const, oldLine: i + 1, content }));
    return { lines: lines.slice(0, 500), firstChangedIndex: 0, truncated: lines.length > 500 };
  }

  // Calculate line diffs
  const allDiffs: { type: 'context' | 'add' | 'remove'; b?: string; a?: string; oldL?: number; newL?: number }[] = [];
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  let oldL = 1;
  let newL = 1;

  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === undefined) {
      allDiffs.push({ type: 'add', a, newL: newL++ });
    } else if (a === undefined) {
      allDiffs.push({ type: 'remove', b, oldL: oldL++ });
    } else if (b === a) {
      allDiffs.push({ type: 'context', b, oldL: oldL++, newL: newL++ });
    } else {
      allDiffs.push({ type: 'remove', b, oldL: oldL });
      allDiffs.push({ type: 'add', a, newL: newL });
      oldL++;
      newL++;
    }
  }

  const changedIndices: number[] = [];
  allDiffs.forEach((d, idx) => {
    if (d.type !== 'context') changedIndices.push(idx);
  });

  if (changedIndices.length === 0) return null;

  // Build context windows around changes (radius 3 lines)
  const contextRadius = 3;
  const showIndices = new Set<number>();
  changedIndices.forEach((idx) => {
    for (let c = Math.max(0, idx - contextRadius); c <= Math.min(allDiffs.length - 1, idx + contextRadius); c++) {
      showIndices.add(c);
    }
  });

  const sortedIndices = Array.from(showIndices).sort((a, b) => a - b);
  const lines: DiffLine[] = [];
  let firstChangedIndex = -1;
  let lastIdx = -1;

  for (const idx of sortedIndices) {
    if (lastIdx !== -1 && idx > lastIdx + 1) {
      const item = allDiffs[idx];
      lines.push({
        type: 'hunk_header',
        content: `@@ -${item.oldL ?? '...'} +${item.newL ?? '...'} @@`,
      });
    }
    const d = allDiffs[idx];
    if (d.type !== 'context' && firstChangedIndex === -1) {
      firstChangedIndex = lines.length;
    }

    if (d.type === 'add') {
      lines.push({ type: 'add', content: d.a ?? '', newLine: d.newL });
    } else if (d.type === 'remove') {
      lines.push({ type: 'remove', content: d.b ?? '', oldLine: d.oldL });
    } else {
      lines.push({ type: 'context', content: d.b ?? '', oldLine: d.oldL, newLine: d.newL });
    }
    lastIdx = idx;
  }

  return {
    lines,
    firstChangedIndex: firstChangedIndex >= 0 ? firstChangedIndex : 0,
    truncated: lines.length > 500,
  };
}

interface DiffViewProps {
  before: string | null;
  after: string | null;
}

const DiffView: React.FC<DiffViewProps> = ({ before, after }) => {
  const diff = useMemo<SimpleDiff | null>(() => buildSimpleDiff(before, after), [before, after]);
  const firstChangeRef = React.useRef<HTMLTableRowElement | null>(null);

  React.useEffect(() => {
    if (firstChangeRef.current) {
      firstChangeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [diff]);

  if (!diff) return <div style={{ padding: '8px 12px', color: 'var(--text-dim)', fontSize: '0.78rem' }}>No visible changes.</div>;

  return (
    <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.78rem', background: 'rgba(10,12,18,0.75)', borderRadius: '6px', overflow: 'auto', maxHeight: '280px', border: '1px solid rgba(255,255,255,0.1)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
        <tbody>
          {diff.lines.map((line, i) => {
            if (line.type === 'hunk_header') {
              return (
                <tr key={i} style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', borderLeft: '3px solid #3b82f6' }}>
                  <td colSpan={4} style={{ padding: '3px 12px', fontSize: '0.72rem', fontWeight: 600, fontStyle: 'italic', fontFamily: 'var(--font-code)' }}>
                    {line.content}
                  </td>
                </tr>
              );
            }
            const isFirstChange = i === diff.firstChangedIndex;
            const isAdd = line.type === 'add';
            const isRemove = line.type === 'remove';

            const rowBg =
              isAdd ? 'rgba(16,185,129,0.14)' :
              isRemove ? 'rgba(239,68,68,0.14)' :
              'transparent';

            const borderLeft =
              isAdd ? '3px solid #10b981' :
              isRemove ? '3px solid #ef4444' :
              '3px solid transparent';

            const textColor =
              isAdd ? '#4ade80' :
              isRemove ? '#f87171' :
              'rgba(229,231,235,0.85)';

            const numBg =
              isAdd ? 'rgba(16,185,129,0.2)' :
              isRemove ? 'rgba(239,68,68,0.2)' :
              'rgba(0,0,0,0.2)';

            const numColor =
              isAdd ? '#a7f3d0' :
              isRemove ? '#fca5a5' :
              'var(--text-dim, #9ca3af)';

            const prefix = isAdd ? '+' : isRemove ? '-' : ' ';

            return (
              <tr key={i} ref={isFirstChange ? firstChangeRef : undefined} style={{ background: rowBg, borderLeft }}>
                <td style={{ padding: '1px 8px', background: numBg, color: numColor, userSelect: 'none', textAlign: 'right', minWidth: '34px', fontSize: '0.7rem', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                  {'oldLine' in line && line.oldLine != null ? line.oldLine : ''}
                </td>
                <td style={{ padding: '1px 8px', background: numBg, color: numColor, userSelect: 'none', textAlign: 'right', minWidth: '34px', fontSize: '0.7rem', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                  {'newLine' in line && line.newLine != null ? line.newLine : ''}
                </td>
                <td style={{ padding: '1px 6px', color: textColor, fontWeight: 700, userSelect: 'none', minWidth: '16px', textAlign: 'center' }}>{prefix}</td>
                <td style={{ padding: '1px 10px 1px 2px', color: textColor, whiteSpace: 'pre' }}>{line.content}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {diff.truncated && (
        <div style={{ padding: '4px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          Diff truncated — showing first 500 lines.
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
