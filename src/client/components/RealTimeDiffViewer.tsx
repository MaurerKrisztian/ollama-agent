import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import { parseDiff } from 'diff2html';

interface FileChange {
  filePath: string;
  oldContent?: string;
  newContent: string;
  timestamp: Date;
}

interface RealTimeDiffViewerProps {
  changes: FileChange[];
  onCollapseToggle?: (collapsed: boolean) => void;
}

const RealTimeDiffViewer: React.FC<RealTimeDiffViewerProps> = ({
  changes,
  onCollapseToggle,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    if (onCollapseToggle) {
      onCollapseToggle(newCollapsed);
    }
  };

  useEffect(() => {
    // Auto-scroll to bottom when new changes arrive
    if (!collapsed && containerRef.current) {
      const container = containerRef.current;
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }, [changes, collapsed]);

  const renderFileChange = (change: FileChange, index: number) => {
    try {
      // Create a simple diff string for visualization
      let oldContent = change.oldContent || '';
      let newContent = change.newContent;

      // Generate unified diff format
      const diffLines: string[] = [];
      diffLines.push(`--- ${change.filePath}`);
      diffLines.push(`+++ ${change.filePath}`);
      
      // Simple line-by-line comparison
      const oldLines = oldContent.split('\n');
      const newLines = newContent.split('\n');
      
      let maxLen = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLen; i++) {
        const oldLine = i < oldLines.length ? oldLines[i] : '';
        const newLine = i < newLines.length ? newLines[i] : '';
        
        if (oldLine === newLine) {
          diffLines.push(` ${newLine}`);
        } else if (i >= oldLines.length) {
          diffLines.push(`+${newLine}`);
        } else if (i >= newLines.length) {
          diffLines.push(`-${oldLine}`);
        } else {
          // Modified line
          diffLines.push(`-${oldLine}`);
          diffLines.push(`+${newLine}`);
        }
      }

      const diffText = diffLines.join('\n');
      // @ts-ignore
      const diffHtml = Diff2Html.html(parseDiff(diffText), {
        inputFormat: 'diff',
        outputFormat: 'line-by-line',
        matching: 'lines',
      });

      return (
        <div key={index} className="file-change" data-file={change.filePath}>
          <div className="file-header">
            <span className="file-path">{change.filePath}</span>
            <span className="timestamp">
              {change.timestamp.toLocaleTimeString()}
            </span>
          </div>
          <div
            className="diff-content"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        </div>
      );
    } catch (error) {
      console.error('Error rendering diff:', error);
      return (
        <div key={index} className="file-change error">
          <div className="file-header">
            <span className="file-path">{change.filePath}</span>
            <span className="error-message">Error rendering diff</span>
          </div>
        </div>
      );
    }
  };

  return (
    <div className={`real-time-diff-viewer ${collapsed ? 'collapsed' : ''}`}>
      <div className="viewer-header" onClick={toggleCollapse}>
        <span className="title">Real-Time File Changes</span>
        <span className="collapse-icon">{collapsed ? '▶' : '▼'}</span>
        <span className="change-count">{changes.length} changes</span>
      </div>

      {!collapsed && (
        <div className="viewer-content" ref={containerRef}>
          {changes.length === 0 ? (
            <div className="no-changes">No file changes yet</div>
          ) : (
            changes.map((change, index) => renderFileChange(change, index))
          )}
        </div>
      )}
    </div>
  );
};

export default RealTimeDiffViewer;
