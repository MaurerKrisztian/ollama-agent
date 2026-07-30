import React, { useEffect, useState } from 'react';
import { KeyRound, Server, X } from 'lucide-react';

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  host: string;
  tokenConfigured: boolean;
  onClose: () => void;
  onSave: (host: string, token?: string) => Promise<void>;
}

export const ConnectionSettingsModal: React.FC<ConnectionSettingsModalProps> = ({
  isOpen,
  host,
  tokenConfigured,
  onClose,
  onSave,
}) => {
  const [serverUrl, setServerUrl] = useState(host);
  const [token, setToken] = useState('');
  const [removeToken, setRemoveToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setServerUrl(host);
      setToken('');
      setRemoveToken(false);
      setError('');
    }
  }, [isOpen, host]);

  if (!isOpen) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const nextToken = removeToken ? '' : token.trim() || undefined;
      await onSave(serverUrl.trim(), nextToken);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.8)',
    color: 'var(--text-main)', outline: 'none', fontFamily: 'var(--font-code)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={save} className="glass-panel" style={{ width: '100%', maxWidth: 540, borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={20} color="var(--accent-teal)" />
            <h2 style={{ fontSize: '1.1rem' }}>Ollama Connection</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.85rem', marginBottom: 8 }}>Server URL</label>
        <input required type="url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://ollama.example.com" style={inputStyle} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: '.85rem', margin: '18px 0 8px' }}>
          <KeyRound size={15} /> Bearer token (optional)
        </label>
        <input type="password" autoComplete="new-password" value={token} disabled={removeToken} onChange={(e) => setToken(e.target.value)} placeholder={tokenConfigured ? 'Leave blank to keep the saved token' : 'No token'} style={inputStyle} />

        {tokenConfigured && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, color: 'var(--text-muted)', fontSize: '.8rem' }}>
            <input type="checkbox" checked={removeToken} onChange={(e) => setRemoveToken(e.target.checked)} />
            Remove saved token
          </label>
        )}

        <p style={{ color: 'var(--text-dim)', fontSize: '.78rem', lineHeight: 1.5, marginTop: 14 }}>
          The token is stored only in backend memory and is never returned to the browser.
        </p>
        {error && <p style={{ color: '#f87171', fontSize: '.82rem', marginTop: 10 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
          <button disabled={saving} type="submit" style={{ padding: '9px 18px', borderRadius: 8, border: 0, background: 'var(--accent-gradient)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Connecting…' : 'Save & Connect'}</button>
        </div>
      </form>
    </div>
  );
};
