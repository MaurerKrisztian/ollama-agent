import React from 'react';
import { FileText, Code2, Eye, X } from 'lucide-react';
import { TextAttachment } from '../../types';
import { HighlightedAttachment, getAttachmentLanguage } from './HighlightedAttachment';
import { MarkdownContent } from './MessageContent';

export interface AttachmentModalProps {
  viewedAttachment: TextAttachment | null;
  onClose: () => void;
  attachmentViewMode: 'source' | 'rendered';
  onSetViewMode: (mode: 'source' | 'rendered') => void;
  attachmentViewerWidth: number;
  onSetWidth: (width: number | ((curr: number) => number)) => void;
  isResizing: boolean;
  onStartResizing: () => void;
  clampWidth: (width: number) => number;
}

export const AttachmentModal: React.FC<AttachmentModalProps> = ({
  viewedAttachment,
  onClose,
  attachmentViewMode,
  onSetViewMode,
  attachmentViewerWidth,
  onSetWidth,
  isResizing,
  onStartResizing,
  clampWidth,
}) => {
  if (!viewedAttachment) return null;

  const isMarkdown = /\.(?:md|markdown)$/i.test(viewedAttachment.name);
  const language = getAttachmentLanguage(viewedAttachment.name);

  return (
    <aside className="attachment-viewer" style={{ position: 'relative', width: `${attachmentViewerWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.96)', minHeight: 0 }}>
      <div
        className="attachment-resize-handle"
        role="separator"
        aria-label="Resize file viewer"
        aria-orientation="vertical"
        aria-valuenow={attachmentViewerWidth}
        tabIndex={0}
        title="Drag to resize file viewer"
        onPointerDown={(event) => {
          event.preventDefault();
          onStartResizing();
        }}
        onDoubleClick={() => onSetWidth(clampWidth(420))}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const change = event.key === 'ArrowLeft' ? 24 : -24;
          onSetWidth((current) => clampWidth(current + change));
        }}
        style={{ position: 'absolute', zIndex: 2, insetBlock: 0, left: '-6px', width: '12px', display: 'flex', justifyContent: 'center', cursor: 'col-resize', touchAction: 'none', outline: 'none' }}
      >
        <span style={{ width: '2px', height: '100%', background: isResizing ? 'var(--accent-primary)' : 'var(--border-color)', transition: 'background 0.15s' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <FileText size={18} color="var(--accent-primary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div title={viewedAttachment.name} style={{ color: 'var(--text-main)', fontWeight: 650, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {viewedAttachment.name}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
            {(viewedAttachment.size / 1024).toFixed(1)} KB
            <span style={{ marginLeft: '7px', color: language.color }}>
              • {language.label}
            </span>
          </div>
        </div>

        {isMarkdown && (
          <div style={{ display: 'flex', gap: '2px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'rgba(30, 41, 59, 0.7)' }}>
            <button
              type="button"
              onClick={() => onSetViewMode('source')}
              aria-pressed={attachmentViewMode === 'source'}
              title="Show Markdown source"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 7px', border: 0, borderRadius: '5px', background: attachmentViewMode === 'source' ? 'rgba(99, 102, 241, 0.25)' : 'transparent', color: attachmentViewMode === 'source' ? '#c7d2fe' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <Code2 size={12} /> Source
            </button>
            <button
              type="button"
              onClick={() => onSetViewMode('rendered')}
              aria-pressed={attachmentViewMode === 'rendered'}
              title="Render Markdown"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 7px', border: 0, borderRadius: '5px', background: attachmentViewMode === 'rendered' ? 'rgba(99, 102, 241, 0.25)' : 'transparent', color: attachmentViewMode === 'rendered' ? '#c7d2fe' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <Eye size={12} /> Preview
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close attachment viewer"
          title="Close"
          style={{ display: 'flex', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'rgba(30, 41, 59, 0.7)', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      {isMarkdown && attachmentViewMode === 'rendered' ? (
        <div style={{ flex: 1, minHeight: 0, padding: '18px', overflow: 'auto', color: 'var(--text-main)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          <MarkdownContent content={viewedAttachment.content} />
        </div>
      ) : (
        <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: '16px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-main)', background: 'transparent', fontFamily: 'var(--font-code)', fontSize: '0.8rem', lineHeight: 1.55 }}>
          <HighlightedAttachment file={viewedAttachment} />
        </pre>
      )}
    </aside>
  );
};
