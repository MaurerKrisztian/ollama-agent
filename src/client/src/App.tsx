import React, { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Header } from './components/Header';
import { ChatWindow } from './components/ChatWindow';
import { ContextSidebar } from './components/ContextSidebar';
import { LeftSidebar } from './components/LeftSidebar';
import { SystemPromptModal } from './components/SystemPromptModal';
import { BenchmarkView } from './components/BenchmarkView';
import { ToolSettingsModal } from './components/ToolSettingsModal';
import { ConnectionSettingsModal } from './components/ConnectionSettingsModal';
import { DirectoryPickerModal } from './components/DirectoryPickerModal';
import { ModelDetailsModal } from './components/ModelDetailsModal';
import { ModelSettingsModal } from './components/ModelSettingsModal';
import { TerminalSessionsModal } from './components/TerminalSessionsModal';
import { RightTerminalSidebar } from './components/RightTerminalSidebar';
import { AgentConfig, BatchReviewFile, ChatMessage, ChatSessionSummary, CheckpointEntry, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo, PendingApprovalCall, SystemMetrics, TerminalSessionInfo, TextAttachment, ToolSettings, ollamaModelNamesMatch } from './types';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'chat' | 'benchmark'>('chat');
  const benchmarkContextWindowSetter = useRef<((ctx: number) => void) | null>(null);
  const [benchmarkContextWindow, setBenchmarkContextWindow] = useState<number>(16384);

  const [config, setConfig] = useState<AgentConfig>({
    ollamaHost: 'http://127.0.0.1:11434',
    model: 'qwen3.5:9b',
    temperature: 0.2,
    systemPrompt: 'You are an intelligent AI assistant with tools for workspace files, terminal commands, web search, and reading public web pages.',
    workingDir: '',
    showWorkingDirInfo: true,
  });

  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    terminalMode: 'confirm',
    fileEditMode: 'batch',
    allowedCommands: ['ls', 'pwd'],
    maxLoops: 25,
    preventRepeatedCalls: true,
    enabledTools: {
      list_directory: true,
      read_file: true,
      edit_file: true,
      replace_file: true,
      create_file: true,
      apply_patch: false,
      grep_search: true,
      execute_command: true,
      web_search: true,
      read_web_page: true,
      deep_research: true,
      get_working_directory: true,
      set_working_directory: true,
      start_terminal_session: true,
      send_terminal_input: true,
      read_terminal_output: true,
      list_terminal_sessions: true,
      terminate_terminal_session: true,
    },
  });

  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [runningModels, setRunningModels] = useState<OllamaRunningModelInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [toolSettingsModalOpen, setToolSettingsModalOpen] = useState(false);
  const [connectionSettingsModalOpen, setConnectionSettingsModalOpen] = useState(false);
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [modelDetailsModalOpen, setModelDetailsModalOpen] = useState(false);
  const [modelSettingsModalOpen, setModelSettingsModalOpen] = useState(false);

  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelLoadElapsed, setModelLoadElapsed] = useState(0);
  const [generationStatus, setGenerationStatus] =
    useState<'idle' | 'generating' | 'completed' | 'cancelled' | 'error'>('idle');
  const [pendingApprovalCall, setPendingApprovalCall] = useState<PendingApprovalCall | null>(null);
  const [isSubmittingToolApproval, setIsSubmittingToolApproval] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<{ name: string; args?: any; progress?: any } | null>(null);
  const [batchReview, setBatchReview] = useState<BatchReviewFile[] | null>(null);
  const [batchReviewPromptId, setBatchReviewPromptId] = useState<string | null>(null);
  const [isSubmittingBatchReview, setIsSubmittingBatchReview] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[]>([]);
  const [isReverting, setIsReverting] = useState(false);
  const [rewindConfirm, setRewindConfirm] = useState<{ messageId: string; promptId: string; snapshotPaths: string[] } | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionInfo[]>([]);
  const [terminalSessionsModalOpen, setTerminalSessionsModalOpen] = useState(false);
  const [terminalSidebarOpen, setTerminalSidebarOpen] = useState(false);
  const [activeGenerationsCount, setActiveGenerationsCount] = useState<number>(0);
  const liveSocketRef = useRef<Socket | null>(null);
  const activeSessionIdRef = useRef('');

  const applyChatStreamEvent = (eventType: string, eventData: any) => {
    if (eventType === 'message_added') {
      setMessages((prev) => {
        if (prev.some((message) => message.id === eventData.id)) return prev;
        return [...prev, eventData];
      });
    } else if (eventType === 'message_updated') {
      setMessages((prev) => prev.map((message) => message.id === eventData.id ? eventData : message));
    } else if (eventType === 'chunk') {
      setStreamingText((prev) => prev + eventData.chunk);
    } else if (eventType === 'thinking_chunk') {
      setStreamingThinking((prev) => prev + eventData.chunk);
    } else if (eventType === 'context_update') {
      setContextInfo(eventData);
    } else if (eventType === 'tool_approval_required') {
      setPendingApprovalCall({ name: eventData.name, args: eventData.args, diff: eventData.diff });
    } else if (eventType === 'batch_review_ready') {
      setBatchReviewPromptId(eventData.promptId ?? null);
      setBatchReview(
        (eventData.files ?? []).map((f: any) => ({ path: f.path, before: f.before, after: f.after, revert: false }))
      );
    } else if (eventType === 'checkpoint_saved') {
      setCheckpoints((prev) => [
        ...prev,
        {
          promptId: eventData.promptId,
          promptText: eventData.promptText,
          timestamp: eventData.timestamp,
          sessionId: activeSessionId,
          snapshots: [],
          snapshotPaths: eventData.snapshotPaths ?? [],
        },
      ]);
    } else if (eventType === 'tool_start') {
      setPendingApprovalCall(null);
      setActiveToolCall({ name: eventData.name, args: eventData.args });
    } else if (eventType === 'tool_progress') {
      setActiveToolCall((current) => current?.name === eventData.name
        ? { ...current, progress: eventData.progress }
        : current);
    } else if (eventType === 'tool_end') {
      setActiveToolCall(null);
      setPendingApprovalCall(null);
    } else if (eventType === 'done') {
      setActiveToolCall(null);
      setPendingApprovalCall(null);
      setStreamingText('');
      setStreamingThinking('');
      setGenerationStatus('idle');
      setIsGenerating(false);
    } else if (eventType === 'cancelled') {
      setActiveToolCall(null);
      setPendingApprovalCall(null);
      setStreamingText('');
      setStreamingThinking('');
      setGenerationStatus('cancelled');
      setIsGenerating(false);
    } else if (eventType === 'error') {
      setActiveToolCall(null);
      setPendingApprovalCall(null);
      setStreamingText('');
      setStreamingThinking('');
      setGenerationStatus('error');
      setIsGenerating(false);
      alert(`Error: ${eventData.error}`);
    }
  };

  const requestRunningModels = async () => {
    liveSocketRef.current?.emit('models:running:request');
  };

  const refreshModels = async () => {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not refresh installed models.');
    setModels(data.models || []);
  };

  const unloadModel = async (model: string) => {
    const response = await fetch('/api/models/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to release model RAM/VRAM.');
    setRunningModels(data.runningModels || []);
  };

  const fetchTerminalSessions = async () => {
    liveSocketRef.current?.emit('terminal:sessions:request');
  };

  const handleTerminateTerminalSession = async (sessionId: string) => {
    try {
      await fetch(`/api/terminal/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      fetchTerminalSessions();
    } catch (_) {}
  };

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    liveSocketRef.current = socket;
    socket.on('system:metrics', (metrics: SystemMetrics) => setSystemMetrics(metrics));
    socket.on('system:metrics:error', () => setSystemMetrics(null));
    socket.on('terminal:sessions', (sessions: TerminalSessionInfo[]) => setTerminalSessions(sessions));
    socket.on('models:running', (activeModels: OllamaRunningModelInfo[]) => setRunningModels(activeModels));
    socket.on('chat:sessions', (data: { sessions?: ChatSessionSummary[]; activeSessionId?: string; activeGenerationsCount?: number }) => {
      if (Array.isArray(data.sessions)) setChatSessions(data.sessions);
      if (typeof data.activeGenerationsCount === 'number') setActiveGenerationsCount(data.activeGenerationsCount);
    });
    socket.on('chat:stream', (payload: { sessionId?: string; event?: string; data?: any }) => {
      if (!payload.sessionId || payload.sessionId !== activeSessionIdRef.current || !payload.event) return;
      if (!['done', 'cancelled', 'error'].includes(payload.event)) {
        setIsGenerating(true);
        setGenerationStatus('generating');
      }
      applyChatStreamEvent(payload.event, payload.data);
    });
    socket.on('config:state', (data: { config?: AgentConfig; context?: ContextInfo }) => {
      if (data.config) {
        setConfig((prev) => ({ ...prev, ...data.config }));
        if (data.config.workingDir) {
          localStorage.setItem('local-model-chat.workingDir', data.config.workingDir);
        }
      }
    });
    return () => {
      liveSocketRef.current = null;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const loadInitialState = async () => {
    try {
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const data = await configRes.json();
        let activeConfig = data.config;
        let activeContext = data.context;

        const savedWorkingDir = localStorage.getItem('local-model-chat.workingDir');
        if (savedWorkingDir && savedWorkingDir !== data.config?.workingDir) {
          const savedDirRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workingDir: savedWorkingDir }),
          });
          if (savedDirRes.ok) {
            const savedDirData = await savedDirRes.json();
            if (savedDirData.success) {
              activeConfig = savedDirData.config;
              activeContext = savedDirData.context;
            }
          }
        }

        if (activeConfig) {
          setConfig(activeConfig);
          if (activeConfig.contextWindow) setBenchmarkContextWindow(activeConfig.contextWindow);
          if (activeConfig.workingDir) {
            localStorage.setItem('local-model-chat.workingDir', activeConfig.workingDir);
          }
          setToolSettings((prev) => ({
            ...prev,
            terminalMode: activeConfig.terminalMode || prev.terminalMode,
            fileEditMode: activeConfig.fileEditMode || prev.fileEditMode,
            allowedCommands: Array.isArray(activeConfig.allowedCommands)
              ? activeConfig.allowedCommands
              : prev.allowedCommands,
            complexityProfile: activeConfig.complexityProfile || prev.complexityProfile,
            maxLoops: activeConfig.maxLoops ?? prev.maxLoops,
            enableThinking: activeConfig.enableThinking ?? prev.enableThinking,
            enabledTools: activeConfig.enabledTools
              ? { ...prev.enabledTools, ...activeConfig.enabledTools }
              : prev.enabledTools,
          }));
        }
        if (activeContext) {
          setContextInfo(activeContext);
        }
      }

      const modelsRes = await fetch('/api/models');
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(data.models || []);
        if (data.activeModel) {
          setConfig((prev) => ({ ...prev, model: data.activeModel }));
        }
      }

      const sessionsRes = await fetch('/api/chat/sessions');
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        const sessions: ChatSessionSummary[] = Array.isArray(data.sessions) ? data.sessions : [];
        const linkedSessionId = new URLSearchParams(window.location.search).get('session');
        const savedSessionId = sessionStorage.getItem('local-model-chat.activeSessionId');
        const initialSessionId = sessions.some((session) => session.id === linkedSessionId)
          ? linkedSessionId!
          : sessions.some((session) => session.id === savedSessionId)
          ? savedSessionId!
          : (sessions[0]?.id || data.activeSessionId || '');
        setChatSessions(sessions);
        if (initialSessionId) {
          const activeRes = await fetch(`/api/chat/sessions/${encodeURIComponent(initialSessionId)}/activate`, { method: 'POST' });
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            setMessages(activeData.messages || []);
            setContextInfo(activeData.context);
            setActiveSessionId(initialSessionId);
            setIsGenerating(Boolean(activeData.isGenerating));
            if (activeData.isGenerating) {
              setGenerationStatus('generating');
              if (activeData.activeToolState) {
                setActiveToolCall(activeData.activeToolState);
              }
            } else {
              setActiveToolCall(null);
            }
            sessionStorage.setItem('local-model-chat.activeSessionId', initialSessionId);
            fetchCheckpoints(initialSessionId);
          }
        }
      }

      await requestRunningModels();
    } catch (err) {
      console.error('Error loading initial app state:', err);
    }
  };

  const isActiveModelLoaded = runningModels.some(
    (model) =>
      (ollamaModelNamesMatch(model.name, config.model) || ollamaModelNamesMatch(model.model, config.model)) &&
      model.size_vram > 0
  );

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    if (!isGenerating || isActiveModelLoaded) {
      setModelLoadElapsed(0);
      return;
    }

    const startedAt = Date.now();
    const updateElapsed = () => setModelLoadElapsed(Math.floor((Date.now() - startedAt) / 1000));
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isGenerating, isActiveModelLoaded, config.model]);

  const handleSelectModel = async (newModel: string) => {
    setConfig((prev) => ({ ...prev, model: newModel }));
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: newModel }),
    });
  };

  const handleChangeTemperature = async (newTemp: number) => {
    setConfig((prev) => ({ ...prev, temperature: newTemp }));
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: newTemp }),
    });
  };

  const handleChangeContextWindow = async (newCtx: number) => {
    if (activeView === 'benchmark') {
      benchmarkContextWindowSetter.current?.(newCtx);
      setBenchmarkContextWindow(newCtx);
      return;
    }
    setConfig((prev) => ({ ...prev, contextWindow: newCtx }));
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextWindow: newCtx }),
    });
  };

  const handleChangeClassifierModel = async (classifierModel: string) => {
    setConfig((prev) => ({ ...prev, classifierModel }));
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classifierModel }),
    });
  };

  const handleChangeWorkingDir = async (newDir: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDir: newDir }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setContextInfo(data.context);
        localStorage.setItem('local-model-chat.workingDir', data.config.workingDir);
        return true;
      } else {
        alert(`Failed to set working directory: ${data.error}`);
        return false;
      }
    } catch (err: any) {
      alert(`Error setting working dir: ${err.message}`);
      return false;
    }
  };

  const handleToggleWorkingDirInfo = async (enabled: boolean) => {
    setConfig((prev) => ({ ...prev, showWorkingDirInfo: enabled }));
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showWorkingDirInfo: enabled }),
    });
    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
      setContextInfo(data.context);
    }
  };

  const handleSaveSystemPrompt = async (newPrompt: string) => {
    setConfig((prev) => ({ ...prev, systemPrompt: newPrompt }));
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: newPrompt }),
    });
    if (res.ok) {
      const data = await res.json();
      setContextInfo(data.context);
    }
  };

  const handleSaveConnection = async (ollamaHost: string, ollamaToken?: string) => {
    const body: Record<string, string> = { ollamaHost };
    if (ollamaToken !== undefined) body.ollamaToken = ollamaToken;

    const parseResponse = async (res: Response) => {
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch (_) {
        return {};
      }
    };

    const configRes = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const configData = await parseResponse(configRes);
    if (!configRes.ok || !configData.success) {
      throw new Error(configData.error || `Could not save Ollama connection (${configRes.status}).`);
    }

    const modelsRes = await fetch('/api/models');
    const modelsData = await parseResponse(modelsRes);
    if (!modelsRes.ok || !modelsData.success) {
      throw new Error(modelsData.error || `Could not connect to Ollama server at ${ollamaHost}`);
    }

    setConfig(configData.config);
    setModels(modelsData.models || []);
    setRunningModels([]);
    await requestRunningModels();
  };

  const handleNewChat = async () => {
    if (isGenerating) return;
    const res = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages([]);
      setStreamingText('');
      setStreamingThinking('');
      setGenerationStatus('idle');
      setContextInfo(data.context);
      setChatSessions(data.sessions || []);
      setActiveSessionId(data.activeSessionId || '');
      sessionStorage.setItem('local-model-chat.activeSessionId', data.activeSessionId || '');
    }
  };

  const fetchCheckpoints = async (sid: string) => {
    if (!sid) return;
    try {
      const res = await fetch(`/api/chat/checkpoints?sessionId=${encodeURIComponent(sid)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.checkpoints)) {
          setCheckpoints(data.checkpoints);
        }
      }
    } catch (_) {}
  };

  const handleSelectChatSession = async (sessionId: string) => {
    if (isGenerating || sessionId === activeSessionId) return;
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Could not switch chat sessions.');
      return;
    }
    setMessages(data.messages || []);
    setContextInfo(data.context);
    setChatSessions(data.sessions || []);
    setActiveSessionId(data.activeSessionId || sessionId);
    sessionStorage.setItem('local-model-chat.activeSessionId', data.activeSessionId || sessionId);
    setStreamingText('');
    setStreamingThinking('');
    setIsGenerating(Boolean(data.isGenerating));
    setGenerationStatus(data.isGenerating ? 'generating' : 'idle');
    if (data.isGenerating && data.activeToolState) {
      setActiveToolCall(data.activeToolState);
    } else if (!data.isGenerating) {
      setActiveToolCall(null);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('session', data.activeSessionId || sessionId);
    window.history.replaceState(null, '', url);
    // Reset per-session state and fetch checkpoints
    setBatchReview(null);
    setBatchReviewPromptId(null);
    fetchCheckpoints(data.activeSessionId || sessionId);
  };

  const handleRenameChatSession = async (sessionId: string, title: string) => {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (res.ok) setChatSessions(data.sessions || []);
  };

  const handleDeleteChatSession = async (sessionId: string) => {
    if (isGenerating) return;
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Could not delete the chat session.');
      return;
    }
    const sessions: ChatSessionSummary[] = data.sessions || [];
    setChatSessions(sessions);
    if (sessionId === activeSessionId) {
      const nextSessionId = sessions[0]?.id || '';
      setActiveSessionId('');
      sessionStorage.removeItem('local-model-chat.activeSessionId');
      if (nextSessionId) await handleSelectChatSession(nextSessionId);
    }
  };

  const handleRewindToMessage = async (messageId: string) => {
    let currentCheckpoints = checkpoints;
    try {
      const cpRes = await fetch(`/api/chat/checkpoints?sessionId=${encodeURIComponent(activeSessionId)}`);
      if (cpRes.ok) {
        const cpData = await cpRes.json();
        if (cpData.success && Array.isArray(cpData.checkpoints)) {
          currentCheckpoints = cpData.checkpoints;
          setCheckpoints(cpData.checkpoints);
        }
      }
    } catch (_) {}

    const targetIdx = currentCheckpoints.findIndex((c) => c.promptId === messageId);
    let paths: string[] = [];
    if (targetIdx !== -1) {
      const affectedCheckpoints = currentCheckpoints.slice(targetIdx);
      paths = Array.from(new Set(affectedCheckpoints.flatMap((c) => c.snapshotPaths || [])));
    }
    setRewindConfirm({ messageId, promptId: messageId, snapshotPaths: paths });
  };

  const handleConfirmRewind = async () => {
    if (!rewindConfirm) return;
    const { messageId, promptId, snapshotPaths } = rewindConfirm;
    setRewindConfirm(null);
    setIsReverting(true);
    try {
      // 1. Revert files first if there are any file snapshots
      if (snapshotPaths.length > 0) {
        await fetch('/api/chat/revert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSessionId, promptId }),
        });
      }
      // 2. Rewind conversation context
      const rewindRes = await fetch('/api/chat/rewind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, sessionId: activeSessionId }),
      });
      if (rewindRes.ok) {
        const data = await rewindRes.json();
        if (data.success) {
          setContextInfo(data.context);
          setMessages((prev) => {
            const targetIdx = prev.findIndex((m) => m.id === messageId);
            return targetIdx !== -1 ? prev.slice(0, targetIdx) : prev;
          });
        }
      }
      fetchCheckpoints(activeSessionId);
    } catch (err: any) {
      alert(`Rewind failed: ${err?.message || err}`);
    } finally {
      setIsReverting(false);
    }
  };

  const handleCompactContext = async () => {
    try {
      const res = await fetch('/api/chat/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setContextInfo(data.context);
          if (data.messages) {
            setMessages(data.messages);
          } else if (data.message) {
            setMessages([data.message]);
          }
        }
      }
    } catch (_) {}
  };

  const handleUpdateToolSettings = async (newSettings: ToolSettings) => {
    setToolSettings(newSettings);
    if (newSettings.enableThinking !== undefined) {
      setConfig((prev) => ({ ...prev, enableThinking: newSettings.enableThinking }));
    }
    // Sync approval modes & maxLoops & thinking to server
    await fetch('/api/chat/tool-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        terminalMode: newSettings.terminalMode,
        fileEditMode: newSettings.fileEditMode,
        allowedCommands: newSettings.allowedCommands,
        maxLoops: newSettings.maxLoops,
        enableThinking: newSettings.enableThinking,
        complexityProfile: newSettings.complexityProfile,
        enabledTools: newSettings.enabledTools,
      }),
    });
  };

  const handleToggleThinking = async (enabled: boolean) => {
    setConfig((prev) => ({ ...prev, enableThinking: enabled }));
    setToolSettings((prev) => ({ ...prev, enableThinking: enabled }));
    await fetch('/api/chat/tool-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enableThinking: enabled }),
    });
  };

  const handleApproveToolCall = async () => {
    if (isSubmittingToolApproval) return;
    setIsSubmittingToolApproval(true);
    try {
      const response = await fetch('/api/chat/tool-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve', sessionId: activeSessionId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Server response error ${response.status}`);
      }
      setPendingApprovalCall(null);
    } catch (err: any) {
      alert(`Failed to approve tool call: ${err.message}`);
    } finally {
      setIsSubmittingToolApproval(false);
    }
  };

  const handleRejectToolCall = async (reason?: string) => {
    if (isSubmittingToolApproval) return;
    setIsSubmittingToolApproval(true);
    try {
      const response = await fetch('/api/chat/tool-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'reject', reason, sessionId: activeSessionId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Server response error ${response.status}`);
      }
      setPendingApprovalCall(null);
    } catch (err: any) {
      alert(`Failed to reject tool call: ${err.message}`);
    } finally {
      setIsSubmittingToolApproval(false);
    }
  };

  const handleBatchReviewToggle = (path: string) => {
    setBatchReview((prev) =>
      prev ? prev.map((f) => f.path === path ? { ...f, revert: !f.revert } : f) : prev
    );
  };

  const handleBatchReviewConfirm = async (revertPaths: string[]) => {
    if (isSubmittingBatchReview) return;
    // Nothing to revert — just dismiss the card
    if (revertPaths.length === 0) {
      setBatchReview(null);
      setBatchReviewPromptId(null);
      return;
    }
    setIsSubmittingBatchReview(true);
    try {
      const response = await fetch('/api/chat/revert-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, promptId: batchReviewPromptId, revertPaths }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Server response error ${response.status}`);
      }
      setBatchReview(null);
      setBatchReviewPromptId(null);
    } catch (err: any) {
      alert(`Failed to revert files: ${err.message}`);
    } finally {
      setIsSubmittingBatchReview(false);
    }
  };

  const handleRevertToCheckpoint = async (promptId: string) => {
    if (isReverting) return;
    if (!window.confirm('Revert all file changes made after this prompt? This cannot be undone.')) return;
    setIsReverting(true);
    try {
      const response = await fetch('/api/chat/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, promptId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || `Revert failed (${response.status})`);
      }
      setCheckpoints((prev) => {
        const idx = prev.findIndex((c) => c.promptId === promptId);
        return idx >= 0 ? prev.slice(0, idx + 1) : prev;
      });
      alert(`Reverted ${data.reverted} file(s) to this checkpoint.`);
    } catch (err: any) {
      alert(`Revert failed: ${err.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  const runChatStream = async (body: Record<string, unknown>, actionLabel: string) => {
    setIsGenerating(true);
    setGenerationStatus('generating');
    setStreamingText('');
    setStreamingThinking('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, sessionId: activeSessionId }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Server response error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventLine = block.match(/^event:\s*(.+)$/m);
          const dataLine = block.match(/^data:\s*(.+)$/m);

          if (eventLine && dataLine) {
            const eventType = eventLine[1].trim();
            const eventData = JSON.parse(dataLine[1].trim());

            applyChatStreamEvent(eventType, eventData);
          }
        }
      }
    } catch (err: any) {
      setActiveToolCall(null);
      setGenerationStatus('error');
      alert(`Failed to ${actionLabel}: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setStreamingText('');
      setStreamingThinking('');
      setActiveToolCall(null);
      const ctxRes = await fetch(`/api/context?sessionId=${encodeURIComponent(activeSessionId)}`);
      if (ctxRes.ok) {
        const data = await ctxRes.json();
        setContextInfo(data);
      }
    }
  };

  const handleSendMessage = async (
    userPrompt: string,
    attachments: TextAttachment[] = [],
    imageAttachments: import('./types').ImageAttachment[] = []
  ) => runChatStream({ message: userPrompt, attachments, imageAttachments }, 'send message');

  const handleRegenerateDeepResearch = async (toolMessageId: string) => {
    setMessages((current) => {
      const toolIndex = current.findIndex((message) => message.id === toolMessageId);
      return toolIndex >= 0 ? current.slice(0, toolIndex + 1) : current;
    });
    await runChatStream({ regenerateFromToolMessageId: toolMessageId }, 'regenerate the research answer');
  };

  const handleCancelAllGenerations = async () => {
    try {
      const response = await fetch('/api/chat/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`Server response error ${response.status}`);
      }
      setGenerationStatus('idle');
      setIsGenerating(false);
      setActiveToolCall(null);
      setPendingApprovalCall(null);
      setStreamingText('');
      setStreamingThinking('');
    } catch (err: any) {
      setGenerationStatus('error');
      alert(`Failed to cancel generations: ${err.message}`);
    }
  };

  const handleCancelGeneration = async () => {
    try {
      const response = await fetch('/api/chat/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`Server response error ${response.status}`);
      }
    } catch (err: any) {
      setGenerationStatus('error');
      alert(`Failed to cancel generation: ${err.message}`);
    }
  };

  const activeModelObj = models.find((m) => m.name === config.model);
  const supportsVision = Boolean(
    config.model.toLowerCase().includes('vision') ||
    config.model.toLowerCase().includes('llava') ||
    config.model.toLowerCase().includes('bakllava') ||
    config.model.toLowerCase().includes('minicpm-v') ||
    config.model.toLowerCase().includes('gemma') ||
    activeModelObj?.details?.family?.toLowerCase().includes('clip') ||
    activeModelObj?.details?.family?.toLowerCase().includes('vision') ||
    activeModelObj?.details?.family?.toLowerCase().includes('gemma') ||
    activeModelObj?.details?.family?.toLowerCase().includes('llava')
  );

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Header
        config={activeView === 'benchmark' ? { ...config, contextWindow: benchmarkContextWindow } : config}
        contextInfo={contextInfo}
        models={models}
        runningModels={runningModels}
        sidebarOpen={sidebarOpen}
        activeView={activeView}
        isGenerating={isGenerating}
        modelLoadElapsed={modelLoadElapsed}
        activeGenerationsCount={activeGenerationsCount}
        onCancelAllGenerations={handleCancelAllGenerations}
        onSelectView={setActiveView}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onSelectModel={handleSelectModel}
        onChangeTemperature={handleChangeTemperature}
        onChangeContextWindow={handleChangeContextWindow}
        onToggleThinking={handleToggleThinking}
        onNewChat={handleNewChat}
        onOpenSystemPrompt={() => setSystemPromptModalOpen(true)}
        onOpenToolSettings={() => setToolSettingsModalOpen(true)}
        onOpenConnectionSettings={() => setConnectionSettingsModalOpen(true)}
        onOpenWorkingDirPicker={() => setDirectoryPickerOpen(true)}
        onToggleWorkingDirInfo={handleToggleWorkingDirInfo}
        onRefreshModels={loadInitialState}
        onOpenModelDetails={() => setModelDetailsModalOpen(true)}
        onOpenModelSettings={() => setModelSettingsModalOpen(true)}
        systemMetrics={systemMetrics}
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeftSidebar={() => setLeftSidebarOpen((prev) => !prev)}
        activeTerminalCount={terminalSessions.filter((s) => s.status === 'running').length}
        onOpenTerminalSessions={() => setTerminalSidebarOpen((prev) => !prev)}
      />

      <div className="app-content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LeftSidebar
          isOpen={leftSidebarOpen}
          onClose={() => setLeftSidebarOpen(false)}
          config={config}
          activeView={activeView}
          onSelectView={setActiveView}
          onNewChat={handleNewChat}
          chatSessions={chatSessions}
          activeSessionId={activeSessionId}
          isGenerating={isGenerating}
          onSelectChatSession={handleSelectChatSession}
          onRenameChatSession={handleRenameChatSession}
          onDeleteChatSession={handleDeleteChatSession}
          onOpenSystemPrompt={() => setSystemPromptModalOpen(true)}
          onOpenToolSettings={() => setToolSettingsModalOpen(true)}
          onOpenConnectionSettings={() => setConnectionSettingsModalOpen(true)}
          onOpenWorkingDirPicker={() => setDirectoryPickerOpen(true)}
          onToggleWorkingDirInfo={handleToggleWorkingDirInfo}
          onChangeTemperature={handleChangeTemperature}
          onToggleThinking={handleToggleThinking}
          onOpenModelDetails={() => setModelDetailsModalOpen(true)}
          systemMetrics={systemMetrics}
          activeTerminalCount={terminalSessions.filter((s) => s.status === 'running').length}
          onOpenTerminalSessions={() => setTerminalSidebarOpen((prev) => !prev)}
          checkpoints={checkpoints}
          isReverting={isReverting}
          onRevertToCheckpoint={handleRevertToCheckpoint}
        />
        {activeView === 'chat' ? (
          <ChatWindow
            messages={messages}
            streamingText={streamingText}
            streamingThinking={streamingThinking}
            isGenerating={isGenerating}
            isModelLoaded={isActiveModelLoaded}
            modelLoadElapsed={modelLoadElapsed}
            activeGenerationsCount={activeGenerationsCount}
            generationStatus={generationStatus}
            pendingApprovalCall={pendingApprovalCall}
            isSubmittingToolApproval={isSubmittingToolApproval}
            activeToolCall={activeToolCall}
            pendingBatchEdits={batchReview}
            isSubmittingBatchApproval={isSubmittingBatchReview}
            supportsVision={supportsVision}
            onSendMessage={handleSendMessage}
            onCancelGeneration={handleCancelGeneration}
            onApproveToolCall={handleApproveToolCall}
            onRejectToolCall={handleRejectToolCall}
            onBatchApprove={handleBatchReviewConfirm}
            onBatchRejectAll={() => handleBatchReviewConfirm([])}
            onBatchToggle={handleBatchReviewToggle}
            onRewindToMessage={handleRewindToMessage}
            onRegenerateDeepResearch={handleRegenerateDeepResearch}
            onClearChat={handleNewChat}
            onOpenToolSettings={() => setToolSettingsModalOpen(true)}
            onOpenModelDetails={() => setModelDetailsModalOpen(true)}
            onCompactContext={handleCompactContext}
          />
        ) : (
          <BenchmarkView
            models={models}
            currentConfig={config}
            toolSettings={toolSettings}
            onRegisterContextWindowSetter={(setter) => { benchmarkContextWindowSetter.current = setter; }}
          />
        )}

        <ContextSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          contextInfo={contextInfo}
          activeModel={config.model}
          onCompactContext={handleCompactContext}
          onContextInfoChange={setContextInfo}
        />

        <RightTerminalSidebar
          isOpen={terminalSidebarOpen}
          onClose={() => setTerminalSidebarOpen(false)}
          sessions={terminalSessions}
          onRefreshSessions={fetchTerminalSessions}
          onTerminateSession={handleTerminateTerminalSession}
          onOpenModal={() => {
            setTerminalSidebarOpen(false);
            setTerminalSessionsModalOpen(true);
          }}
        />
      </div>

      <SystemPromptModal
        isOpen={systemPromptModalOpen}
        currentPrompt={config.systemPrompt}
        onClose={() => setSystemPromptModalOpen(false)}
        onSave={handleSaveSystemPrompt}
      />

      <ModelSettingsModal
        isOpen={modelSettingsModalOpen}
        config={config}
        models={models}
        runningModels={runningModels}
        systemMetrics={systemMetrics}
        onClose={() => setModelSettingsModalOpen(false)}
        onSelectModel={handleSelectModel}
        onChangeClassifierModel={handleChangeClassifierModel}
        onChangeTemperature={handleChangeTemperature}
        onChangeContextWindow={handleChangeContextWindow}
        onToggleThinking={handleToggleThinking}
        onModelsChanged={refreshModels}
        onUnloadModel={unloadModel}
        onOpenModelDetails={() => {
          setModelSettingsModalOpen(false);
          setModelDetailsModalOpen(true);
        }}
      />

      <ToolSettingsModal
        isOpen={toolSettingsModalOpen}
        onClose={() => setToolSettingsModalOpen(false)}
        settings={toolSettings}
        onUpdateSettings={handleUpdateToolSettings}
      />

      <ConnectionSettingsModal
        isOpen={connectionSettingsModalOpen}
        host={config.ollamaHost}
        tokenConfigured={Boolean(config.ollamaTokenConfigured)}
        onClose={() => setConnectionSettingsModalOpen(false)}
        onSave={handleSaveConnection}
      />

      <DirectoryPickerModal
        isOpen={directoryPickerOpen}
        currentDir={config.workingDir}
        onClose={() => setDirectoryPickerOpen(false)}
        onSelect={handleChangeWorkingDir}
      />

      <ModelDetailsModal
        isOpen={modelDetailsModalOpen}
        onClose={() => setModelDetailsModalOpen(false)}
        selectedModel={config.model}
        installedModels={models}
        runningModels={runningModels}
      />

      <TerminalSessionsModal
        isOpen={terminalSessionsModalOpen}
        onClose={() => setTerminalSessionsModalOpen(false)}
        sessions={terminalSessions}
        onRefreshSessions={fetchTerminalSessions}
        onTerminateSession={handleTerminateTerminalSession}
      />

      {/* Rewind confirmation modal */}
      {rewindConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setRewindConfirm(null)}
        >
          <div
            style={{
              background: 'var(--bg-secondary, #1e1e2e)',
              border: '1px solid var(--border, #313244)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
              ⏪ Rewind to this prompt?
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary, #a6adc8)' }}>
              The conversation context will be rewound. All messages after this point will be removed.
            </p>
            {rewindConfirm.snapshotPaths.length > 0 ? (
              <>
                <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary, #a6adc8)' }}>
                  The following {rewindConfirm.snapshotPaths.length} file{rewindConfirm.snapshotPaths.length !== 1 ? 's' : ''} will also be reverted to their state before this prompt:
                </p>
                <ul style={{
                  margin: '0 0 20px', padding: '10px 14px',
                  background: 'var(--bg-tertiary, #181825)',
                  borderRadius: '8px', listStyle: 'none',
                  maxHeight: '160px', overflowY: 'auto',
                  border: '1px solid var(--border, #313244)',
                }}>
                  {rewindConfirm.snapshotPaths.map((p) => (
                    <li key={p} style={{
                      fontSize: '12px', fontFamily: 'monospace',
                      color: 'var(--text-accent, #89b4fa)',
                      padding: '2px 0',
                      wordBreak: 'break-all',
                    }}>
                      {p}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-muted, #6c7086)', fontStyle: 'italic' }}>
                No file changes will be reverted (no files were modified by this prompt).
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRewindConfirm(null)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border, #313244)',
                  background: 'transparent', color: 'var(--text-secondary, #a6adc8)',
                  fontSize: '13px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRewind}
                disabled={isReverting}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: 'var(--accent-warn, #f38ba8)', color: '#11111b',
                  fontSize: '13px', fontWeight: 600, cursor: isReverting ? 'not-allowed' : 'pointer',
                  opacity: isReverting ? 0.6 : 1,
                }}
              >
                {isReverting ? 'Reverting…' : rewindConfirm.snapshotPaths.length > 0 ? 'Rewind & Revert Files' : 'Rewind'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
