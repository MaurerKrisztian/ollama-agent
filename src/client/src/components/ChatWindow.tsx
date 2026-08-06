import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, Bot, ShieldAlert, CheckCircle2, XCircle, Loader2, RotateCcw, FileText, Zap, X, ArrowDown } from 'lucide-react';
import { ChatMessage, ImageAttachment, BatchReviewFile, PendingApprovalCall, TextAttachment, TerminalSessionInfo } from '../types';
import { BatchReviewCard } from './chat/BatchReviewCard';
import { findActiveSkillMention } from '../skillMention';
import { categorizeError, CategorizedError } from './chat/chatUtils';
import { MarkdownContent, AssistantResponse, MetricBadge, ThinkingBlock, FileDiff } from './chat/MessageContent';
import { CompactedContextCard, ToolExecutionCard, ToolInvocationCard } from './chat/ToolExecutionCard';
import { AttachmentModal } from './chat/AttachmentModal';
import { ChatInputBar, SLASH_COMMANDS, SlashCommandItem, SkillListItem, QUICK_HELPER_PROMPTS } from './chat/ChatInputBar';

export { categorizeError, type CategorizedError };

export interface ChatWindowProps {
  messages: ChatMessage[];
  streamingText: string;
  streamingThinking?: string;
  streamingMetrics?: { liveTokPerSec: number; tokenCount: number } | null;
  isGenerating: boolean;
  isModelLoaded: boolean;
  modelLoadElapsed: number;
  activeGenerationsCount?: number;
  generationStatus: 'idle' | 'generating' | 'completed' | 'cancelled' | 'error';
  pendingApprovalCall?: PendingApprovalCall | null;
  isSubmittingToolApproval?: boolean;
  activeToolCall?: { name: string; args?: any; progress?: any } | null;
  pendingBatchEdits?: BatchReviewFile[] | null;
  isSubmittingBatchApproval?: boolean;
  supportsVision?: boolean;
  onSendMessage: (msg: string, attachments?: TextAttachment[], imageAttachments?: ImageAttachment[]) => void;
  onCancelGeneration: () => void;
  onApproveToolCall?: () => void;
  onRejectToolCall?: (reason?: string) => void;
  onBatchApprove?: (approvedIds: string[]) => void;
  onBatchRejectAll?: () => void;
  onBatchToggle?: (editId: string) => void;
  onRewindToMessage?: (messageId: string, promptContent: string) => void;
  onRegenerateDeepResearch?: (toolMessageId: string) => void;
  onClearChat?: () => void;
  onOpenToolSettings?: () => void;
  onOpenModelDetails?: () => void;
  onCompactContext?: () => void;
  terminalSessions?: TerminalSessionInfo[];
  onOpenTerminal?: (sessionId?: string) => void;
  onTerminateTerminalSession?: (sessionId: string) => Promise<void>;
  isCompacting?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  streamingText,
  streamingThinking = '',
  streamingMetrics = null,
  isGenerating,
  isModelLoaded,
  modelLoadElapsed,
  activeGenerationsCount,
  generationStatus,
  pendingApprovalCall,
  isSubmittingToolApproval = false,
  activeToolCall,
  pendingBatchEdits,
  isSubmittingBatchApproval = false,
  supportsVision,
  onSendMessage,
  onCancelGeneration,
  onApproveToolCall,
  onRejectToolCall,
  onBatchApprove,
  onBatchRejectAll,
  onBatchToggle,
  onRewindToMessage,
  onRegenerateDeepResearch,
  onClearChat,
  onOpenToolSettings,
  onOpenModelDetails,
  onCompactContext,
  terminalSessions = [],
  onOpenTerminal,
  onTerminateTerminalSession,
  isCompacting,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [viewedAttachment, setViewedAttachment] = useState<TextAttachment | null>(null);
  const [attachmentViewMode, setAttachmentViewMode] = useState<'source' | 'rendered'>('source');
  const [attachmentViewerWidth, setAttachmentViewerWidth] = useState(420);
  const [isResizingAttachmentViewer, setIsResizingAttachmentViewer] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [availableSkills, setAvailableSkills] = useState<SkillListItem[]>([]);
  const [inputCursor, setInputCursor] = useState<number | null>(0);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatMainRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAutoScrollRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);

  const openAttachmentViewer = (file: TextAttachment) => {
    setAttachmentViewMode('source');
    setViewedAttachment(file);
  };

  const clampAttachmentViewerWidth = (width: number) => {
    const availableWidth = chatMainRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const maximumWidth = Math.max(300, Math.min(900, availableWidth - 280));
    return Math.min(maximumWidth, Math.max(300, width));
  };

  useEffect(() => {
    if (!isResizingAttachmentViewer) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const mainBounds = chatMainRef.current?.getBoundingClientRect();
      if (!mainBounds) return;
      setAttachmentViewerWidth(clampAttachmentViewerWidth(mainBounds.right - event.clientX));
    };
    const handlePointerUp = () => setIsResizingAttachmentViewer(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingAttachmentViewer]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        void addImageFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [supportsVision, imageAttachments.length]);

  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const query = input.toLowerCase();
    return SLASH_COMMANDS.filter((cmd) => cmd.cmd.toLowerCase().startsWith(query));
  }, [input]);

  const activeSkillMention = useMemo(
    () => findActiveSkillMention(input, inputCursor ?? 0),
    [input, inputCursor]
  );
  const skillMentionActive = activeSkillMention !== null;
  const filteredSkills = useMemo(() => {
    if (!activeSkillMention) return [];
    return availableSkills.filter((skill) => skill.name.toLowerCase().startsWith(activeSkillMention.query));
  }, [activeSkillMention, availableSkills]);
  const skillMenuOpen = skillMentionActive && !skillMenuDismissed && filteredSkills.length > 0;

  useEffect(() => {
    if (!skillMentionActive) return;
    let cancelled = false;
    void fetch('/api/skills')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load skills.')))
      .then((data) => {
        if (!cancelled) setAvailableSkills(Array.isArray(data.skills) ? data.skills : []);
      })
      .catch(() => {
        if (!cancelled) setAvailableSkills([]);
      });
    return () => { cancelled = true; };
  }, [skillMentionActive]);

  useEffect(() => {
    setSelectedSkillIndex(0);
  }, [activeSkillMention?.query, filteredSkills.length]);

  useEffect(() => {
    if (input.startsWith('/') && filteredCommands.length > 0) {
      setSlashMenuOpen(true);
      setSelectedSlashIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [input, filteredCommands.length]);

  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    setSlashMenuOpen(false);
    if (cmd.cmd === '/compact') {
      setInput('');
      if (onCompactContext) {
        onCompactContext();
      } else {
        onSendMessage('/compact');
      }
    } else if (cmd.cmd === '/clear') {
      setInput('');
      if (onClearChat) onClearChat();
    } else if (cmd.cmd === '/skills') {
      setInput('');
      onSendMessage('/skills');
    } else if (cmd.cmd === '/settings') {
      setInput('');
      if (onOpenToolSettings) onOpenToolSettings();
    } else if (cmd.cmd === '/inspect') {
      setInput('');
      if (onOpenModelDetails) onOpenModelDetails();
    } else {
      setInput(`${cmd.cmd} `);
    }
  };

  const handleSelectSkill = (skill: SkillListItem) => {
    if (!activeSkillMention) return;
    const before = input.slice(0, activeSkillMention.start);
    const after = input.slice(activeSkillMention.end);
    const suffix = after.length === 0 || !/^\s/.test(after) ? ` ${after}` : after;
    const reference = `@skill:${skill.name}`;
    const nextInput = `${before}${reference}${suffix}`;
    const nextCursor = before.length + reference.length + (suffix.startsWith(' ') ? 1 : 0);
    setInput(nextInput);
    setInputCursor(nextCursor);
    setSkillMenuDismissed(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleRewind = (messageId: string, content: string) => {
    if (onRewindToMessage) {
      onRewindToMessage(messageId, content);
      setInput(content);
    }
  };

  const resizeImageIfNeeded = (file: File, maxDimension = 1560, quality = 0.85): Promise<{ base64: string; size: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ base64: e.target?.result as string, size: file.size });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          const base64Clean = dataUrl.split(',')[1] || '';
          const sizeInBytes = Math.round((base64Clean.length * 3) / 4);

          resolve({ base64: dataUrl, size: sizeInBytes });
        };
        img.onerror = () => reject(new Error(`Failed to load image ${file.name}`));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  const addImageFiles = async (files: File[]) => {
    setAttachmentError('');
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    if (!supportsVision) {
      setAttachmentError('The currently selected model does not support image input.');
      return;
    }

    const remainingSlots = 5 - imageAttachments.length;
    const selected = imageFiles.slice(0, remainingSlots);
    if (imageFiles.length > remainingSlots) {
      setAttachmentError('You can attach at most 5 images.');
    }

    const accepted: ImageAttachment[] = [];
    for (const file of selected) {
      try {
        const { base64, size } = await resizeImageIfNeeded(file, 1560, 0.85);
        accepted.push({ name: file.name, type: file.type, base64, size });
      } catch (_) {
        setAttachmentError(`Failed to process ${file.name}`);
      }
    }
    setImageAttachments((current) => [...current, ...accepted]);
  };

  const addFiles = async (files: File[]) => {
    setAttachmentError('');
    const textFiles = files.filter((f) => !f.type.startsWith('image/'));
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      await addImageFiles(imageFiles);
    }

    if (textFiles.length === 0) return;

    const remainingSlots = 10 - attachments.length;
    const selected = textFiles.slice(0, remainingSlots);
    if (textFiles.length > remainingSlots) setAttachmentError('You can attach at most 10 text files.');

    const accepted: TextAttachment[] = [];
    for (const file of selected) {
      if (file.size > 512 * 1024) {
        setAttachmentError(`${file.name} is larger than 512 KB.`);
        continue;
      }
      const content = await file.text();
      if (content.includes('\u0000')) {
        setAttachmentError(`${file.name} does not appear to be a text file.`);
        continue;
      }
      accepted.push({ name: file.name, content, size: file.size, type: file.type });
    }
    const currentSize = attachments.reduce((sum, file) => sum + file.size, 0);
    let addedSize = 0;
    const withinTotalLimit = accepted.filter((file) => {
      if (currentSize + addedSize + file.size > 1024 * 1024) {
        setAttachmentError('Attachments cannot exceed 1 MB in total.');
        return false;
      }
      addedSize += file.size;
      return true;
    });
    setAttachments((current) => [...current, ...withinTotalLimit]);
  };

  const isProgrammaticScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const touchStartRef = useRef(0);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      isAutoScrollRef.current = false;
      setShowScrollToBottom(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      const deltaY = e.touches[0].clientY - touchStartRef.current;
      if (deltaY > 10) {
        isAutoScrollRef.current = false;
        setShowScrollToBottom(true);
      }
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isScrollingUp = scrollTop < lastScrollTopRef.current - 4;
    lastScrollTopRef.current = scrollTop;

    // Detect user scrolling UP regardless of programmatic flag to prevent rapid streaming override
    if (isScrollingUp) {
      isAutoScrollRef.current = false;
      setShowScrollToBottom(true);
      return;
    }

    if (isProgrammaticScrollRef.current) return;

    if (distanceToBottom <= 15) {
      // User scrolled all the way DOWN to the bottom -> Re-attach!
      isAutoScrollRef.current = true;
      setShowScrollToBottom(false);
    } else if (distanceToBottom > 40) {
      // User is scrolled up away from bottom -> Ensure autoscroll is detached
      isAutoScrollRef.current = false;
      setShowScrollToBottom(true);
    }
  };

  const scrollToBottom = (force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (force) {
      isAutoScrollRef.current = true;
      setShowScrollToBottom(false);
    }
    if (isAutoScrollRef.current || force) {
      isProgrammaticScrollRef.current = true;
      container.scrollTop = container.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
  };

  useEffect(() => {
    if (isGenerating && !streamingText && !streamingThinking) {
      isAutoScrollRef.current = true;
      setShowScrollToBottom(false);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (isAutoScrollRef.current && messagesContainerRef.current) {
      isProgrammaticScrollRef.current = true;
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
  }, [messages, streamingText, streamingThinking, activeToolCall, isGenerating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    isAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    onSendMessage(input.trim(), attachments, imageAttachments);
    setInput('');
    setAttachments([]);
    setImageAttachments([]);
    setAttachmentError('');
    setTimeout(() => {
      scrollToBottom(true);
    }, 50);
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
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        if (event.dataTransfer.types.includes('Files')) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        if (!isGenerating) void addFiles(Array.from(event.dataTransfer.files));
      }}
      className="chat-window"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {isDragging && (
        <div style={{ position: 'absolute', inset: '12px', zIndex: 20, border: '2px dashed var(--accent-primary)', borderRadius: '16px', background: 'rgba(15, 23, 42, 0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-primary)', fontWeight: 700 }}>
            <FileText size={26} />
            Drop text files to attach
          </div>
        </div>
      )}

      <div ref={chatMainRef} className="chat-main" style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Floating Scroll-to-Bottom Re-attach Button */}
        {showScrollToBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="animate-fade-in"
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '32px',
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
              transition: 'transform 0.15s ease, background 0.15s ease',
            }}
            title="Re-attach auto-scroll to bottom"
          >
            <ArrowDown size={15} style={{ color: 'var(--accent-primary)' }} />
            <span>Scroll to bottom</span>
          </button>
        )}

        {/* Messages Scrollable Container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className="messages-container"
          style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
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
              <div className="quick-prompts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '780px', width: '100%', marginTop: '10px' }}>
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

          {(() => {
            const findMatchingToolResult = (
              msgIdx: number,
              tc: { id?: string; name: string },
              tcIdx: number
            ): ChatMessage | undefined => {
              if (tc.id) {
                const idMatch = messages.find((m) => m.role === 'tool' && m.tool_call_id === tc.id);
                if (idMatch) return idMatch;
              }

              const subsequentToolMsgs = messages
                .slice(msgIdx + 1)
                .filter((m) => m.role === 'tool');

              const sameNameMsgs = subsequentToolMsgs.filter((m) => m.name === tc.name);
              if (sameNameMsgs[tcIdx]) {
                return sameNameMsgs[tcIdx];
              }

              return subsequentToolMsgs[tcIdx];
            };

            return messages.map((msg, msgIdx) => {
              if (msg.role === 'system' || msg.content.startsWith('[COMPACTED CONVERSATION SUMMARY]')) {
                return <CompactedContextCard key={msg.id} message={msg} />;
              }

              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="animate-fade-in chat-message chat-message-user" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <div className="message-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', maxWidth: '75%' }}>
                      <div style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', fontSize: '0.925rem', lineHeight: 1.5, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)', width: '100%' }}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.displayContent ?? msg.content}</div>
                        {msg.imageAttachments && msg.imageAttachments.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                            {msg.imageAttachments.map((img, idx) => (
                              <div key={idx} onClick={() => setPreviewImage({ src: img.base64, alt: img.name })} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)', maxHeight: '160px', cursor: 'zoom-in' }} title="Click to enlarge">
                                <img src={img.base64} alt={img.name} style={{ maxHeight: '160px', maxWidth: '240px', objectFit: 'cover', display: 'block' }} />
                              </div>
                            ))}
                          </div>
                        )}
                        {!msg.imageAttachments && msg.images && msg.images.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                            {msg.images.map((imgBase64, idx) => {
                              const src = imgBase64.startsWith('data:') ? imgBase64 : `data:image/png;base64,${imgBase64}`;
                              return (
                                <div key={idx} onClick={() => setPreviewImage({ src, alt: `Attached Image ${idx + 1}` })} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)', maxHeight: '160px', cursor: 'zoom-in' }} title="Click to enlarge">
                                  <img src={src} alt={`Attached Image ${idx + 1}`} style={{ maxHeight: '160px', maxWidth: '240px', objectFit: 'cover', display: 'block' }} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '99px' }}>
                            {msg.attachments.map((file, index) => (
                              <button
                                type="button"
                                key={`${file.name}-${index}`}
                                onClick={() => openAttachmentViewer(file)}
                                title={`Open ${file.name}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', border: '1px solid rgba(255, 255, 255, 0.18)', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.28)', color: 'inherit', font: 'inherit', fontSize: '0.74rem', cursor: 'pointer' }}
                              >
                                <FileText size={13} /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRewind(msg.id, msg.content)}
                        disabled={isGenerating}
                        title="Rewind context & file snapshots to this prompt"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(30, 41, 59, 0.4)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          color: 'var(--text-muted)',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <RotateCcw size={11} />
                        <span>Rewind</span>
                      </button>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={18} color="#fff" />
                    </div>
                  </div>
                );
              }

              if (msg.role === 'assistant') {
                const toolCalls = msg.tool_calls || [];
                const prevMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
                const isConsecutiveAssistant = Boolean(
                  prevMsg && (prevMsg.role === 'assistant' || prevMsg.role === 'tool')
                );

                return (
                  <div key={msg.id} className="animate-fade-in chat-message" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
                    {!isConsecutiveAssistant ? (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bot size={18} color="#fff" />
                      </div>
                    ) : (
                      <div style={{ width: '32px', height: '32px', flexShrink: 0 }} />
                    )}
                    <div className="message-content" style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(msg.content || msg.thinking) && (
                        <AssistantResponse content={msg.content} thinking={msg.thinking} thinkingTokens={msg.thinkingTokens} metrics={msg.metrics} />
                      )}

                      {toolCalls.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {toolCalls.map((tc, tcIdx) => {
                            const matchingToolMsg = findMatchingToolResult(msgIdx, tc, tcIdx);
                            const isWorking = Boolean(
                              isGenerating &&
                              activeToolCall &&
                              activeToolCall.name === tc.name &&
                              !matchingToolMsg
                            );
                            return (
                              <ToolExecutionCard
                                key={tc.id || `${tc.name}-${tcIdx}`}
                                toolName={tc.name}
                                args={tc.arguments || {}}
                                resultMessage={matchingToolMsg}
                                isWorking={isWorking}
                                progress={isWorking ? activeToolCall?.progress : undefined}
                                onOpenFile={openAttachmentViewer}
                                isGenerating={isGenerating}
                                onRegenerateDeepResearch={onRegenerateDeepResearch}
                                onCancelGeneration={onCancelGeneration}
                              />
                            );
                          })}
                        </div>
                      )}

                      {!(msg.content || msg.thinking) && msg.metrics && (
                        <MetricBadge metrics={msg.metrics} />
                      )}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'tool') {
                const isClaimedByAssistant = messages.some((m, mIdx) => {
                  if (m.role !== 'assistant' || !m.tool_calls) return false;
                  return m.tool_calls.some((tc, tcIdx) => {
                    const match = findMatchingToolResult(mIdx, tc, tcIdx);
                    return match?.id === msg.id;
                  });
                });

                if (isClaimedByAssistant) {
                  return null;
                }

                const matchingCall = messages
                  .flatMap((message) => message.tool_calls || [])
                  .find((call) => call.id === msg.tool_call_id);
                return (
                  <div key={msg.id} style={{ marginLeft: '44px', maxWidth: '80%' }}>
                    <ToolExecutionCard
                      toolName={msg.name || matchingCall?.name || 'tool'}
                      args={matchingCall?.arguments || {}}
                      resultMessage={msg}
                      onOpenFile={openAttachmentViewer}
                      isGenerating={isGenerating}
                      onRegenerateDeepResearch={onRegenerateDeepResearch}
                    />
                  </div>
                );
              }

              return null;
            });
          })()}

          {/* Streaming Assistant Card */}
          {(streamingText || streamingThinking) && (() => {
            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const isStreamingConsecutive = Boolean(
              lastMsg && (lastMsg.role === 'assistant' || lastMsg.role === 'tool')
            );
            return (
              <div className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
                {!isStreamingConsecutive ? (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={18} color="#fff" />
                  </div>
                ) : (
                  <div style={{ width: '32px', height: '32px', flexShrink: 0 }} />
                )}
                <div className="glass-panel" style={{ maxWidth: '80%', padding: '14px 18px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6 }}>
                  {streamingThinking && (
                    <ThinkingBlock thinking={streamingThinking} isStreaming={!streamingText} />
                  )}
                  {streamingText && !activeToolCall?.args?._streaming && (
                    <MarkdownContent content={streamingText} streaming />
                  )}
                  {streamingMetrics && (streamingMetrics.liveTokPerSec > 0 || streamingMetrics.tokenCount > 0) && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)', fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-code, monospace)' }}>
                      <Zap size={12} className="spin" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>
                        ⚡ {streamingMetrics.liveTokPerSec > 0 ? `${streamingMetrics.liveTokPerSec} tok/s` : 'Streaming…'}
                      </span>
                      <span>· {streamingMetrics.tokenCount} tokens</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Standalone Active Tool Execution Indicator */}
          {isGenerating && activeToolCall && !messages.some((m) => m.role === 'assistant' && m.tool_calls?.some((tc) => tc.name === activeToolCall.name && !messages.some((tm) => tm.role === 'tool' && tm.tool_call_id === tc.id))) && (
            <div style={{ marginLeft: '44px', maxWidth: '80%' }}>
              <ToolExecutionCard
                toolName={activeToolCall.name}
                args={activeToolCall.args || {}}
                isWorking={true}
                progress={activeToolCall.progress}
                onCancelGeneration={onCancelGeneration}
                streamingMetrics={streamingMetrics}
              />
            </div>
          )}

          {isGenerating && !activeToolCall && !streamingText && !pendingApprovalCall && (
            <div className="glass-panel animate-fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '44px', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${isModelLoaded ? 'rgba(99, 102, 241, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, color: isModelLoaded ? 'var(--accent-primary)' : 'var(--accent-amber)', fontSize: '0.875rem' }}>
              <Loader2 size={18} className="spin" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 600, display: 'block' }}>
                  {!isModelLoaded
                    ? `⚡ Loading Model Weights into GPU VRAM… ${modelLoadElapsed}s`
                    : (activeGenerationsCount && activeGenerationsCount > 1)
                    ? `⏳ Request Queued (${activeGenerationsCount} Active Server Tasks)`
                    : 'Agent is thinking…'}
                </span>
                <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                  {!isModelLoaded
                    ? 'Ollama is initializing model weights. Progress is indeterminate because Ollama does not report bytes loaded.'
                    : (activeGenerationsCount && activeGenerationsCount > 1)
                    ? `Server has ${activeGenerationsCount} active generation tasks. Your request is queued & waiting for GPU turn…`
                    : 'Preparing the response. Token streaming will start shortly.'}
                </span>
                {!isModelLoaded && (
                  <div
                    className="model-load-track"
                    role="progressbar"
                    aria-label="Loading model weights into GPU VRAM"
                    aria-valuetext={`Loading for ${modelLoadElapsed} seconds`}
                  >
                    <div className="model-load-bar" />
                  </div>
                )}
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
                The agent is requesting to execute:
                <div style={{ marginTop: '8px' }}>
                  <ToolInvocationCard name={pendingApprovalCall.name} args={pendingApprovalCall.args || {}} defaultExpanded={true} />
                </div>
                {pendingApprovalCall.diff && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginBottom: '4px' }}>Proposed changes</div>
                    <FileDiff diff={pendingApprovalCall.diff} />
                  </div>
                )}

                <div style={{ marginTop: '10px' }}>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Optional rejection reason / instructions for model (e.g. 'Use git status instead')..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onRejectToolCall?.(rejectionReason.trim() || undefined);
                        setRejectionReason('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      background: 'rgba(15, 23, 42, 0.8)',
                      color: 'var(--text-main)',
                      fontSize: '0.825rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button
                  onClick={onApproveToolCall}
                  disabled={isSubmittingToolApproval}
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
                    cursor: isSubmittingToolApproval ? 'wait' : 'pointer',
                    opacity: isSubmittingToolApproval ? 0.65 : 1,
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  {isSubmittingToolApproval ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                  <span>{isSubmittingToolApproval ? 'Approving…' : 'Approve & Execute'}</span>
                </button>

                <button
                  onClick={() => {
                    onRejectToolCall?.(rejectionReason.trim() || undefined);
                    setRejectionReason('');
                  }}
                  disabled={isSubmittingToolApproval}
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

          {pendingBatchEdits && pendingBatchEdits.length > 0 && onBatchApprove && onBatchToggle && (
            <BatchReviewCard
              files={pendingBatchEdits}
              isSubmitting={isSubmittingBatchApproval}
              onConfirm={onBatchApprove}
              onToggleRevert={onBatchToggle}
            />
          )}
          {isCompacting && (
            <div className="glass-panel animate-fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '44px', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.12)', color: '#a5b4fc', fontSize: '0.875rem', marginBottom: '12px' }}>
              <Loader2 size={18} className="spin" style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 600, display: 'block', color: '#fff' }}>
                  ⚡ Compacting Conversation Context with Ollama...
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Distilling turn history into a clean, state-preserving package. Recent turns will remain intact.
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Text Attachment Drawer View */}
        <AttachmentModal
          viewedAttachment={viewedAttachment}
          onClose={() => setViewedAttachment(null)}
          attachmentViewMode={attachmentViewMode}
          onSetViewMode={setAttachmentViewMode}
          attachmentViewerWidth={attachmentViewerWidth}
          onSetWidth={setAttachmentViewerWidth}
          isResizing={isResizingAttachmentViewer}
          onStartResizing={() => setIsResizingAttachmentViewer(true)}
          clampWidth={clampAttachmentViewerWidth}
        />
      </div>

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="animate-fade-in"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'zoom-out',
          }}
        >
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid var(--border-color)',
                borderRadius: '50%',
                color: '#fff',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.alt || 'Enlarged Image'}
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
          </div>
        </div>
      )}

      {/* Input Prompt Box Component */}
      <ChatInputBar
        input={input}
        setInput={setInput}
        textareaRef={textareaRef}
        attachments={attachments}
        setAttachments={setAttachments}
        imageAttachments={imageAttachments}
        setImageAttachments={setImageAttachments}
        attachmentError={attachmentError}
        supportsVision={supportsVision}
        isGenerating={isGenerating}
        generationStatus={generationStatus}
        terminalSessions={terminalSessions}
        onOpenTerminal={onOpenTerminal}
        onTerminateTerminalSession={onTerminateTerminalSession}
        skillMenuOpen={skillMenuOpen}
        filteredSkills={filteredSkills}
        selectedSkillIndex={selectedSkillIndex}
        setSelectedSkillIndex={setSelectedSkillIndex}
        setSkillMenuDismissed={setSkillMenuDismissed}
        handleSelectSkill={handleSelectSkill}
        slashMenuOpen={slashMenuOpen}
        setSlashMenuOpen={setSlashMenuOpen}
        filteredCommands={filteredCommands}
        selectedSlashIndex={selectedSlashIndex}
        setSelectedSlashIndex={setSelectedSlashIndex}
        handleSelectSlashCommand={handleSelectSlashCommand}
        handleSelectHelperPrompt={handleSelectHelperPrompt}
        handleSubmit={handleSubmit}
        handleKeyDown={handleKeyDown}
        onCancelGeneration={onCancelGeneration}
        setPreviewImage={setPreviewImage}
        setViewedAttachment={setViewedAttachment}
        addImageFiles={addImageFiles}
        setInputCursor={setInputCursor}
      />
    </div>
  );
};
