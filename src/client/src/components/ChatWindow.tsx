import React, { useState, useRef, useEffect } from 'react';
import { Send, Wrench, CheckCircle2, XCircle, ShieldAlert, User, Bot, Loader2, FileText, Folder, Terminal, Edit3, Search, PlusCircle, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatWindowProps {
  messages: ChatMessage[];
  streamingText: string;
  isGenerating: boolean;
  pendingApprovalCall?: { name: string; args: Record<string, any> } | null;
  onSendMessage: (msg: string) => void;
  onApproveToolCall?: () => void;
  onRejectToolCall?: () => void;
}

const QUICK_HELPER_PROMPTS = [
  {
    icon: Folder,
    label: 'List Directory',
    prompt: 'List all files in the root working directory.',
    category: 'directory',
  },
  {
    icon: FileText,
    label: 'Read File',
    prompt: 'Read user_profile.json and tell me what the userId is.',
    category: 'file',
  },
  {
    icon: Terminal,
    label: 'Run Terminal Cmd',
    prompt: 'Run a terminal command using execute_command to list directory files in long format.',
    category: 'terminal',
  },
  {
    icon: Edit3,
    label: 'Edit File',
    prompt: 'Edit config/app_settings.env to change PORT=9090 to PORT=8080.',
    category: 'edit',
  },
  {
    icon: Search,
    label: 'Search Code',
    prompt: 'Search the workspace for the word computeHash.',
    category: 'search',
  },
  {
    icon: PlusCircle,
    label: 'Create File',
    prompt: 'Create a new file named services/logger.ts containing "export const log = (msg) => console.log(msg);".',
    category: 'create',
  },
];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  streamingText,
  isGenerating,
  pendingApprovalCall,
  onSendMessage,
  onApproveToolCall,
  onRejectToolCall,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, isGenerating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleSelectHelperPrompt = (promptText: string) => {
    setInput(promptText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Messages Scrollable Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.length === 0 && !streamingText && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80%', color: 'var(--text-dim)', textAlign: 'center', gap: '20px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={36} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                Ollama Agent Studio Ready
              </h2>
              <p style={{ maxWidth: '520px', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                Select a quick prompt template below or type custom instructions to inspect files, edit code, run terminal commands, and perform workspace search.
              </p>
            </div>

            {/* Starter Template Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '780px', width: '100%', marginTop: '10px' }}>
              {QUICK_HELPER_PROMPTS.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectHelperPrompt(item.prompt)}
                    className="glass-panel animate-fade-in"
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      background: 'rgba(30, 41, 59, 0.4)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
                      <IconComponent size={16} color="var(--accent-primary)" />
                      <span>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      "{item.prompt}"
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '75%', background: 'var(--accent-gradient)', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', fontSize: '0.925rem', lineHeight: 1.5, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)' }}>
                  {msg.content}
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={18} color="#fff" />
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={18} color="#fff" />
                </div>
                <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '4px' }}>
                        <Wrench size={14} />
                        <span>Tool Invocation Request</span>
                      </div>
                      {msg.tool_calls.map((tc, idx) => (
                        <div key={idx} style={{ fontFamily: 'var(--font-code)', color: '#fcd34d', fontSize: '0.8rem' }}>
                          {tc.name}({JSON.stringify(tc.arguments)})
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.content && (
                    <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'tool') {
            let parsedContent: any = null;
            try {
              parsedContent = JSON.parse(msg.content);
            } catch (_) {}

            return (
              <div key={msg.id} className="animate-fade-in" style={{ marginLeft: '44px', maxWidth: '80%' }}>
                <div style={{ background: 'rgba(20, 184, 166, 0.08)', border: '1px solid rgba(20, 184, 166, 0.25)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.825rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--accent-teal)', fontWeight: 600, marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} />
                      <span>Tool Result: {msg.name}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>ID: {msg.tool_call_id || 'system'}</span>
                  </div>
                  <pre style={{ margin: 0, maxHeight: '200px', fontSize: '0.775rem' }}>
                    {parsedContent ? JSON.stringify(parsedContent, null, 2) : msg.content}
                  </pre>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Streaming Assistant Card */}
        {streamingText && (
          <div className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={18} color="#fff" />
            </div>
            <div className="glass-panel" style={{ maxWidth: '80%', padding: '14px 18px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {streamingText}
              <span className="pulse-glow" style={{ display: 'inline-block', width: '8px', height: '15px', background: 'var(--accent-primary)', marginLeft: '4px', verticalAlign: 'middle' }} />
            </div>
          </div>
        )}

        {isGenerating && !streamingText && !pendingApprovalCall && (
          <div className="glass-panel animate-fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '44px', padding: '12px 18px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--accent-amber)', fontSize: '0.875rem' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>⚡ Loading Model Weights into GPU VRAM...</span>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>Ollama is initializing neural network weights. Token streaming will start shortly.</span>
            </div>
          </div>
        )}

        {/* Pending Tool Execution Approval Card */}
        {pendingApprovalCall && (
          <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '44px', padding: '16px 20px', borderRadius: '14px', border: '2px solid var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.95rem' }}>
              <ShieldAlert size={20} />
              <span>⚠️ Pending Execution Approval</span>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
              The agent is requesting to execute tool call:
              <div style={{ fontFamily: 'var(--font-code)', background: 'rgba(15, 23, 42, 0.8)', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', color: '#fcd34d', fontSize: '0.825rem' }}>
                {pendingApprovalCall.name}({JSON.stringify(pendingApprovalCall.args, null, 2)})
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={onApproveToolCall}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#10b981',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <CheckCircle2 size={16} />
                <span>Approve & Execute</span>
              </button>

              <button
                onClick={onRejectToolCall}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <XCircle size={16} />
                <span>Reject Execution</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Prompt Box */}
      <div style={{ padding: '14px 24px', background: 'rgba(15, 23, 42, 0.8)', borderTop: '1px solid var(--border-color)', zIndex: 5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Quick Helper Chips Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.725rem', fontWeight: 600, color: 'var(--accent-primary)', paddingRight: '6px', whiteSpace: 'nowrap' }}>
            <Sparkles size={13} />
            <span>Quick Prompts:</span>
          </div>
          {QUICK_HELPER_PROMPTS.map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSelectHelperPrompt(item.prompt)}
                disabled={isGenerating}
                title={item.prompt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  padding: '4px 10px',
                  borderRadius: '14px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <IconComponent size={13} color="var(--accent-primary)" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', background: 'rgba(30, 41, 59, 0.8)', padding: '8px 14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message or ask to read files / list directory..."
            rows={2}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-main)',
              fontSize: '0.925rem',
              resize: 'none',
              outline: 'none',
              fontFamily: 'var(--font-main)',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: input.trim() && !isGenerating ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !isGenerating ? 'pointer' : 'not-allowed',
              opacity: input.trim() && !isGenerating ? 1 : 0.4,
              transition: 'all 0.2s',
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
