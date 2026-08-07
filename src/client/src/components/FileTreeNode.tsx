import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  File,
  FileCode,
  FileJson,
  Image,
} from 'lucide-react';

export interface FileTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileTreeEntry[];
}

interface FileTreeNodeProps {
  entry: FileTreeEntry;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  depth?: number;
  onContextMenu?: (e: React.MouseEvent, entry: FileTreeEntry) => void;
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx'].includes(ext)) return <FileCode size={14} style={{ color: '#4ec9b0' }} />;
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return <FileCode size={14} style={{ color: '#f0db4f' }} />;
  if (['json', 'jsonc'].includes(ext)) return <FileJson size={14} style={{ color: '#f4b942' }} />;
  if (['md', 'mdx'].includes(ext)) return <FileText size={14} style={{ color: '#89b4fa' }} />;
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return <FileCode size={14} style={{ color: '#89b4fa' }} />;
  if (['html', 'htm', 'xml', 'svg'].includes(ext)) return <FileCode size={14} style={{ color: '#e06c75' }} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) return <Image size={14} style={{ color: '#a6e3a1' }} />;
  if (['yaml', 'yml', 'toml', 'env'].includes(ext)) return <FileText size={14} style={{ color: '#cba6f7' }} />;
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return <FileCode size={14} style={{ color: '#a6e3a1' }} />;
  if (['py'].includes(ext)) return <FileCode size={14} style={{ color: '#3572A5' }} />;
  return <File size={14} style={{ color: '#6c7086' }} />;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  entry,
  selectedPath,
  onSelectFile,
  depth = 0,
  onContextMenu,
}) => {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selectedPath === entry.path;
  const isDir = entry.type === 'dir';
  const indent = depth * 12 + 8;

  if (isDir) {
    return (
      <div>
        <button
          onContextMenu={(e) => onContextMenu?.(e, entry)}
          onClick={() => setExpanded((p) => !p)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            width: '100%',
            padding: `3px 8px 3px ${indent}px`,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary, #a6adc8)',
            fontSize: '13px',
            textAlign: 'left',
            borderRadius: '4px',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(137,180,250,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ flexShrink: 0, color: '#585b70' }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <span style={{ flexShrink: 0, color: '#f9e2af' }}>
            {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name}
          </span>
        </button>
        {expanded && entry.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            depth={depth + 1}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onContextMenu={(e) => onContextMenu?.(e, entry)}
      onClick={() => onSelectFile(entry.path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        padding: `3px 8px 3px ${indent + 16}px`,
        background: isSelected ? 'rgba(137,180,250,0.15)' : 'transparent',
        border: isSelected ? '1px solid rgba(137,180,250,0.25)' : '1px solid transparent',
        cursor: 'pointer',
        color: isSelected ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
        fontSize: '13px',
        textAlign: 'left',
        borderRadius: '4px',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'rgba(137,180,250,0.06)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {fileIcon(entry.name)}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.name}
      </span>
    </button>
  );
};

export default FileTreeNode;
