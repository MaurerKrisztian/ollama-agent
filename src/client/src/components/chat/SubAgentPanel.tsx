import React from 'react';
import { Bot, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export interface SubAgentTask {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
}

export interface SubAgentPanelProps {
  tasks: SubAgentTask[];
}

export const SubAgentPanel: React.FC<SubAgentPanelProps> = ({ tasks }) => {
  if (!tasks || tasks.length === 0) return null;

  return (
    <div
      className="sub-agent-panel"
      style={{
        marginTop: '8px',
        marginBottom: '12px',
        padding: '10px 14px',
        background: 'var(--bg-tertiary, #1e293b)',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main, #f8fafc)' }}>
        <Bot size={16} style={{ color: 'var(--accent-primary, #3b82f6)' }} />
        <span>Sub-Agent Execution Plan ({tasks.length})</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {tasks.map((task) => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary, #cbd5e1)' }}>
            {task.status === 'running' && <Loader2 size={14} className="spin" style={{ color: 'var(--accent-primary, #3b82f6)' }} />}
            {task.status === 'completed' && <CheckCircle2 size={14} style={{ color: '#4ade80' }} />}
            {task.status === 'failed' && <XCircle size={14} style={{ color: '#f87171' }} />}
            <span style={{ fontWeight: 500 }}>{task.name}</span>
            {task.result && <span style={{ color: 'var(--text-muted, #94a3b8)', marginLeft: 'auto' }}>{task.result}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
