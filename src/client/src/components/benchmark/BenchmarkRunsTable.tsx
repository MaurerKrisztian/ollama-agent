import React from 'react';
import { FileText, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { BenchmarkSnapshot } from '../../types';

export interface BenchmarkRunsTableProps {
  runs: BenchmarkSnapshot[];
  onSelectRun: (run: BenchmarkSnapshot) => void;
  onDeleteRun: (runId: string) => void;
}

export const BenchmarkRunsTable: React.FC<BenchmarkRunsTableProps> = ({ runs, onSelectRun, onDeleteRun }) => {
  if (!runs || runs.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
        No saved benchmark runs found. Execute a benchmark suite to view recorded metrics.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', color: 'var(--text-muted, #94a3b8)' }}>
            <th style={{ padding: '10px 12px' }}>Run Name / Timestamp</th>
            <th style={{ padding: '10px 12px' }}>Model</th>
            <th style={{ padding: '10px 12px' }}>Score / Pass Rate</th>
            <th style={{ padding: '10px 12px' }}>Duration</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const passRate = run.summary ? Math.round((run.summary.passed / (run.summary.total || 1)) * 100) : 0;
            return (
              <tr key={run.id || run.timestamp} style={{ borderBottom: '1px solid var(--border-color, #334155)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-main, #f8fafc)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={14} style={{ color: 'var(--accent-primary, #3b82f6)' }} />
                    <span>{run.id || new Date(run.timestamp).toLocaleString()}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--text-secondary, #cbd5e1)' }}>
                  {run.agentConfig?.model || 'Default Model'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      background: passRate >= 80 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                      color: passRate >= 80 ? '#4ade80' : '#f87171',
                    }}
                  >
                    {passRate}% ({run.summary?.passed || 0}/{run.summary?.total || 0})
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted, #94a3b8)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    <span>{run.summary?.durationMs ? `${(run.summary.durationMs / 1000).toFixed(1)}s` : 'N/A'}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button
                    onClick={() => onSelectRun(run)}
                    style={{
                      marginRight: '8px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color, #334155)',
                      background: 'var(--bg-tertiary, #1e293b)',
                      color: 'var(--text-main, #f8fafc)',
                      cursor: 'pointer',
                    }}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => onDeleteRun(run.id || '')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(248, 113, 113, 0.3)',
                      background: 'rgba(248, 113, 113, 0.1)',
                      color: '#f87171',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
