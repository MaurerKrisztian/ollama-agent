import React, { RefObject } from 'react';
import { Terminal, X, Sparkles, Loader2, CheckCircle2, Square, XCircle, Image as ImageIcon, Send, Folder, Search, Globe, FileText, Wrench, RotateCcw, Layers, Eye } from 'lucide-react';
import { TextAttachment, ImageAttachment, TerminalSessionInfo } from '../../types';

export interface SlashCommandItem {
  cmd: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

export interface SkillListItem {
  name: string;
  description: string;
}

export const QUICK_HELPER_PROMPTS = [
  {
    icon: Folder,
    label: 'Explore Codebase',
    prompt: 'Examine the project structure and summarize the main modules and entry points.',
    category: 'directory',
  },
  {
    icon: Terminal,
    label: 'Run Tests & Lint',
    prompt: 'Run the test suite and type checking to report any failing tests or TypeScript errors.',
    category: 'terminal',
  },
  {
    icon: Search,
    label: 'Find API Routes',
    prompt: 'Grep the codebase for all REST API endpoints and list their parameters.',
    category: 'search',
  },
  {
    icon: Globe,
    label: 'Deep Research',
    prompt: 'Make deep research about ',
    category: 'web',
  },
  {
    icon: FileText,
    label: 'Package & Setup',
    prompt: 'Read package.json and summarize the project dependencies, scripts, and build setup.',
    category: 'file',
  },
  {
    icon: Wrench,
    label: 'Inspect MCP Tools',
    prompt: 'Check active MCP servers and list available external tools and schemas.',
    category: 'mcp',
  },
];

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    cmd: '/compact',
    label: '/compact',
    description: 'Summarize & compress conversation context to save tokens',
    icon: Sparkles,
  },
  {
    cmd: '/clear',
    label: '/clear',
    description: 'Reset conversation history and start fresh context',
    icon: RotateCcw,
  },
  {
    cmd: '/skills',
    label: '/skills',
    description: 'List reusable workspace and bundled skills',
    icon: Layers,
  },
  {
    cmd: '/settings',
    label: '/settings',
    description: 'Open Tool Approval & Safety Settings modal',
    icon: Wrench,
  },
  {
    cmd: '/inspect',
    label: '/inspect',
    description: 'Open Ollama Model Inspector modal for detailed specs',
    icon: Eye,
  },
];

export interface ChatInputBarProps {
  input: string;
  setInput: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  attachments: TextAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<TextAttachment[]>>;
  imageAttachments: ImageAttachment[];
  setImageAttachments: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  attachmentError: string;
  supportsVision?: boolean;
  isGenerating: boolean;
  generationStatus: 'idle' | 'generating' | 'completed' | 'cancelled' | 'error';
  terminalSessions?: TerminalSessionInfo[];
  onOpenTerminal?: (sessionId?: string) => void;
  onTerminateTerminalSession?: (sessionId: string) => Promise<void>;
  skillMenuOpen: boolean;
  filteredSkills: SkillListItem[];
  selectedSkillIndex: number;
  setSelectedSkillIndex: React.Dispatch<React.SetStateAction<number>>;
  setSkillMenuDismissed: (dismissed: boolean) => void;
  handleSelectSkill: (skill: SkillListItem) => void;
  slashMenuOpen: boolean;
  setSlashMenuOpen: (open: boolean) => void;
  filteredCommands: SlashCommandItem[];
  selectedSlashIndex: number;
  setSelectedSlashIndex: React.Dispatch<React.SetStateAction<number>>;
  handleSelectSlashCommand: (cmd: SlashCommandItem) => void;
  handleSelectHelperPrompt: (prompt: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCancelGeneration: () => void;
  setPreviewImage: (img: { src: string; alt: string } | null) => void;
  setViewedAttachment: (file: TextAttachment | null) => void;
  addImageFiles: (files: File[]) => Promise<void>;
  setInputCursor: (pos: number | null) => void;
  planMode?: boolean;
  onTogglePlanMode?: (enabled: boolean) => void;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  input,
  setInput,
  textareaRef,
  attachments,
  setAttachments,
  imageAttachments,
  setImageAttachments,
  attachmentError,
  supportsVision,
  isGenerating,
  generationStatus,
  terminalSessions,
  onOpenTerminal,
  onTerminateTerminalSession,
  skillMenuOpen,
  filteredSkills,
  selectedSkillIndex,
  setSelectedSkillIndex,
  setSkillMenuDismissed,
  handleSelectSkill,
  slashMenuOpen,
  setSlashMenuOpen,
  filteredCommands,
  selectedSlashIndex,
  setSelectedSlashIndex,
  handleSelectSlashCommand,
  handleSelectHelperPrompt,
  handleSubmit,
  handleKeyDown,
  onCancelGeneration,
  setPreviewImage,
  setViewedAttachment,
  addImageFiles,
  setInputCursor,
  planMode,
  onTogglePlanMode,
}) => {
  return (
    <div className="chat-composer" style={{ padding: '14px 24px', background: 'rgba(15, 23, 42, 0.8)', borderTop: '1px solid var(--border-color)', zIndex: 5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Active Terminal Sessions Bar */}
      {terminalSessions && terminalSessions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '6px', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
          <button
            onClick={() => onOpenTerminal?.()}
            title="Open Terminal Sessions View"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'none',
              border: 'none',
              color: 'var(--accent-teal)',
              fontSize: '0.725rem',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '2px 4px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <Terminal size={13} color="var(--accent-teal)" />
            <span>Terminals ({terminalSessions.filter(s => s.status === 'running').length} running):</span>
          </button>

          {terminalSessions.map((sess) => {
            const isRunning = sess.status === 'running';
            return (
              <div
                key={sess.sessionId}
                onClick={() => onOpenTerminal?.(sess.sessionId)}
                title={`Click to open terminal session ${sess.sessionId} ($ ${sess.command})`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isRunning ? 'rgba(16, 185, 129, 0.12)' : 'rgba(30, 41, 59, 0.6)',
                  border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-color)'}`,
                  color: isRunning ? '#10b981' : 'var(--text-muted)',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  fontSize: '0.73rem',
                  fontFamily: 'var(--font-code)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isRunning ? '#10b981' : '#ef4444',
                    boxShadow: isRunning ? '0 0 6px #10b981' : 'none',
                  }}
                />
                <span>{sess.sessionId}</span>
                <span style={{ color: 'var(--text-dim)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  $ {sess.command}
                </span>
                {onTerminateTerminalSession && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTerminateTerminalSession(sess.sessionId);
                    }}
                    title="Remove Terminal Session"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '1px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '3px',
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

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

      {generationStatus !== 'idle' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            color:
              generationStatus === 'completed'
                ? 'var(--accent-teal)'
                : generationStatus === 'cancelled' || generationStatus === 'error'
                  ? 'var(--accent-amber)'
                  : 'var(--text-muted)',
          }}
        >
          {generationStatus === 'generating' && <Loader2 size={14} className="spin" />}
          {generationStatus === 'completed' && <CheckCircle2 size={14} />}
          {generationStatus === 'cancelled' && <Square size={12} />}
          {generationStatus === 'error' && <XCircle size={14} />}
          <span>
            {generationStatus === 'generating'
              ? 'Generating…'
              : generationStatus === 'completed'
                ? 'Generation complete'
                : generationStatus === 'cancelled'
                  ? 'Generation cancelled'
                  : 'Generation failed'}
          </span>
        </div>
      )}

      {(attachments.length > 0 || imageAttachments.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
          {imageAttachments.map((img, index) => (
            <span key={`${img.name}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 5px 3px 8px', border: '1px solid var(--accent-primary)', borderRadius: '8px', color: 'var(--text-main)', background: 'rgba(99, 102, 241, 0.15)', fontSize: '0.76rem' }}>
              <button type="button" onClick={() => setPreviewImage({ src: img.base64, alt: img.name })} title={`View ${img.name} in full size`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 0', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                <ImageIcon size={13} color="var(--accent-primary)" />
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
              </button>
              <button type="button" aria-label={`Remove ${img.name}`} onClick={() => setImageAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ display: 'flex', padding: 0, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            </span>
          ))}
          {attachments.map((file, index) => (
            <span key={`${file.name}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 5px 3px 8px', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', background: 'rgba(30, 41, 59, 0.7)', fontSize: '0.76rem' }}>
              <button type="button" onClick={() => setViewedAttachment(file)} title={`Open ${file.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 0', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                <FileText size={13} color="var(--accent-primary)" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </button>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ display: 'flex', padding: 0, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      {attachmentError && <div style={{ color: 'var(--accent-amber)', fontSize: '0.76rem' }}>{attachmentError}</div>}

      {/* Skill reference autocomplete. It only opens for a standalone @ token. */}
      {skillMenuOpen && (
        <div
          className="animate-fade-in"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--accent-primary)',
            borderRadius: '10px',
            padding: '6px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '4px',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Skills (Use ↑↓ Arrow Keys & Enter)
          </div>
          {filteredSkills.map((skill, idx) => {
            const isSelected = idx === selectedSkillIndex;
            return (
              <button
                key={skill.name}
                type="button"
                onClick={() => handleSelectSkill(skill)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <Sparkles size={14} color={isSelected ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                    @skill:{skill.name}
                  </span>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill.description}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Slash Command Autocomplete Popup Menu */}
      {slashMenuOpen && filteredCommands.length > 0 && (
        <div
          className="animate-fade-in"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--accent-primary)',
            borderRadius: '10px',
            padding: '6px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '4px',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Slash Commands (Use ↑↓ Arrow Keys & Enter)
          </div>
          {filteredCommands.map((cmdItem: SlashCommandItem, idx: number) => {
            const IconComp = cmdItem.icon;
            const isSelected = idx === selectedSlashIndex;
            return (
              <button
                key={cmdItem.cmd}
                type="button"
                onClick={() => handleSelectSlashCommand(cmdItem)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconComp size={14} color={isSelected ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                    {cmdItem.cmd}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {cmdItem.description}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', background: 'rgba(30, 41, 59, 0.8)', padding: '8px 14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        {onTogglePlanMode && (
          <button
            type="button"
            onClick={() => onTogglePlanMode(!planMode)}
            title={planMode ? 'Plan Mode is ACTIVE: Research & generate plan before editing code' : 'Enable Plan Mode: Read-only research & plan review before edits'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '36px',
              padding: '0 12px',
              borderRadius: '8px',
              border: planMode ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid var(--border-color)',
              background: planMode ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.05)',
              color: planMode ? '#60a5fa' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '2px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '14px' }}>📋</span>
            <span>{planMode ? 'Plan: ON' : 'Plan: OFF'}</span>
          </button>
        )}

        {supportsVision && (
          <label
            title="Upload image for vision model"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--accent-primary)',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              marginBottom: '2px',
              transition: 'all 0.15s ease',
            }}
          >
            <ImageIcon size={18} />
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={isGenerating}
              onChange={(e) => {
                if (e.target.files) {
                  void addImageFiles(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
              style={{ display: 'none' }}
            />
          </label>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setInputCursor(e.target.selectionStart);
            setSkillMenuDismissed(false);
          }}
          onClick={(e) => setInputCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setInputCursor(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (skillMenuOpen) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSkillIndex((prev) => (prev + 1) % filteredSkills.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleSelectSkill(filteredSkills[selectedSkillIndex]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setSkillMenuDismissed(true);
                return;
              }
            }
            if (slashMenuOpen && filteredCommands.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSlashIndex((prev) => (prev + 1) % filteredCommands.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleSelectSlashCommand(filteredCommands[selectedSlashIndex]);
                return;
              }
              if (e.key === 'Escape') {
                setSlashMenuOpen(false);
                return;
              }
            }
            handleKeyDown(e);
          }}
          placeholder={supportsVision ? "Type a message, @ for skills, or attach images..." : "Type a message, @ for skills, or / for commands..."}
          rows={2}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-main)',
            fontSize: '0.925rem',
            lineHeight: '1.4',
            resize: 'none',
            outline: 'none',
            fontFamily: 'var(--font-main)',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        />
        <button
          type={isGenerating ? 'button' : 'submit'}
          onClick={isGenerating ? onCancelGeneration : undefined}
          disabled={!isGenerating && !input.trim() && imageAttachments.length === 0}
          title={isGenerating ? 'Cancel generation' : 'Send message'}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: isGenerating
              ? 'rgba(239, 68, 68, 0.85)'
              : (input.trim() || imageAttachments.length > 0)
                ? 'var(--accent-gradient)'
                : 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isGenerating || input.trim() || imageAttachments.length > 0 ? 'pointer' : 'not-allowed',
            opacity: isGenerating || input.trim() || imageAttachments.length > 0 ? 1 : 0.4,
            transition: 'all 0.2s',
          }}
        >
          {isGenerating ? <Square size={16} fill="currentColor" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
};
