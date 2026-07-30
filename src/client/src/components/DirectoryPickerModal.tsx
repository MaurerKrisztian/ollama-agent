import React, { useEffect, useState } from 'react';
import { ArrowUp, Folder, FolderCheck, RefreshCw, X } from 'lucide-react';

interface DirectoryEntry {
  name: string;
  path: string;
}

interface DirectoryPickerModalProps {
  isOpen: boolean;
  currentDir: string;
  onClose: () => void;
  onSelect: (path: string) => Promise<boolean>;
}

export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  isOpen,
  currentDir,
  onClose,
  onSelect,
}) => {
  const [browsingPath, setBrowsingPath] = useState(currentDir);
  const [pathInput, setPathInput] = useState(currentDir);
  const [parent, setParent] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const browse = async (targetPath: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/directories?path=${encodeURIComponent(targetPath)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not browse directory.');
      setBrowsingPath(data.current);
      setPathInput(data.current);
      setParent(data.parent);
      setDirectories(Array.isArray(data.directories) ? data.directories : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void browse(currentDir);
  }, [isOpen, currentDir]);

  if (!isOpen) return null;

  const selectCurrent = async () => {
    setSaving(true);
    setError('');
    const success = await onSelect(browsingPath);
    setSaving(false);
    if (success) onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: 680, height: 'min(640px, 80vh)', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <FolderCheck size={20} color="var(--accent-teal)" />
            <h2 style={{ fontSize: '1.1rem' }}>Select Working Directory</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); void browse(pathInput); }}
          style={{ display: 'flex', gap: 8, marginBottom: 12 }}
        >
          <input
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            aria-label="Directory path"
            style={{ flex: 1, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, .8)', color: 'var(--text-main)', fontFamily: 'var(--font-code)', outline: 'none' }}
          />
          <button type="submit" disabled={loading} title="Open path" style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,.06)', color: 'var(--text-main)', cursor: 'pointer' }}>
            <RefreshCw size={16} className={loading ? 'spin' : undefined} />
          </button>
        </form>

        <div style={{ color: 'var(--text-dim)', fontSize: '.76rem', marginBottom: 10 }}>
          Browse directories on the machine running the local agent server.
        </div>

        {error && <div style={{ color: '#f87171', fontSize: '.82rem', marginBottom: 10 }}>{error}</div>}

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 10, background: 'rgba(10, 15, 28, .75)' }}>
          {parent && (
            <button onClick={() => void browse(parent)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: 'transparent', border: 0, borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'left' }}>
              <ArrowUp size={16} /> <span>Parent directory</span>
            </button>
          )}
          {!loading && directories.length === 0 && (
            <div style={{ padding: 18, color: 'var(--text-dim)', fontSize: '.84rem' }}>No subdirectories.</div>
          )}
          {directories.map((directory) => (
            <button key={directory.path} onClick={() => void browse(directory.path)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: 'transparent', border: 0, borderBottom: '1px solid rgba(148,163,184,.08)', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left' }}>
              <Folder size={16} color="var(--accent-teal)" />
              <span>{directory.name}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => void selectCurrent()} disabled={saving || loading} style={{ padding: '9px 18px', borderRadius: 8, border: 0, background: 'var(--accent-gradient)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Selecting…' : 'Select This Folder'}
          </button>
        </div>
      </div>
    </div>
  );
};
