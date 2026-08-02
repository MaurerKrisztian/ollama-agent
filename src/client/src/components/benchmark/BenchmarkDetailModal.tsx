import React from 'react';
import { X, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import type { BenchmarkSnapshot } from '../../types';

export interface BenchmarkDetailModalProps {
  run: BenchmarkSnapshot | null;
  onClose: () => void;
}

export const BenchmarkDetailModal: React.FC<BenchmarkDetailModalProps> = ({ run, onClose }) => {
  if (!run) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          maxHeight: '85vh',
          background: 'var(--bg-secondary, #0f172a)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color, #334155)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-tertiary, #1e293b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
            <FileText size={18} style={{ color: 'var(--accent-primary, #3b82f6)' }} />
            <span>Benchmark Run Details</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: 'var(--bg-tertiary, #1e293b)', padding: '12px', borderRadius: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>Model</div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{run.agentConfig?.model || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>Total Cases</div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{run.summary?.total || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>Passed</div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#4ade80' }}>{run.summary?.passed || 0}</div>
            </div>
          </div>

          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main, #f8fafc)' }}>Test Results</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(run.results || []).map((res: any, index: number) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #334155)',
                  background: 'var(--bg-tertiary, #1e293b)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, fontSize: '13px' }}>
                    {res.passed ? <CheckCircle2 size={15} style={{ color: '#4ade80' }} /> : <XCircle size={15} style={{ color: '#f87171' }} />}
                    <span>{res.caseId || `Case #${index + 1}`}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>{res.durationMs ? `${res.durationMs}ms` : ''}</span>
                </div>
                {res.error && <div style={{ fontSize: '12px', color: '#f87171', marginTop: '4px' }}>{res.error}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
