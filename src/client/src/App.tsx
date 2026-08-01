import React, { useState, useEffect } from 'react';
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
import { TerminalSessionsModal } from './components/TerminalSessionsModal';
import { RightTerminalSidebar } from './components/RightTerminalSidebar';
import { AgentConfig, ChatMessage, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo, PendingApprovalCall, SystemMetrics, TerminalSessionInfo, TextAttachment, ToolSettings } from './types';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'chat' | 'benchmark'>('chat');

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
    fileEditMode: 'confirm',
    allowedCommands: ['ls', 'pwd'],
    enabledTools: {
      list_directory: true,
      read_file: true,
      edit_file: true,
      replace_file: true,
      create_file: true,
      grep_search: true,
      execute_command: true,
      web_search: true,
      read_web_page: true,
    },
  });

  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [runningModels, setRunningModels] = useState<OllamaRunningModelInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [toolSettingsModalOpen, setToolSettingsModalOpen] = useState(false);
  const [connectionSettingsModalOpen, setConnectionSettingsModalOpen] = useState(false);
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [modelDetailsModalOpen, setModelDetailsModalOpen] = useState(false);

  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelLoadElapsed, setModelLoadElapsed] = useState(0);
  const [generationStatus, setGenerationStatus] =
    useState<'idle' | 'generating' | 'completed' | 'cancelled' | 'error'>('idle');
  const [pendingApprovalCall, setPendingApprovalCall] = useState<PendingApprovalCall | null>(null);
  const [isSubmittingToolApproval, setIsSubmittingToolApproval] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<{ name: string; args?: any } | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionInfo[]>([]);
  const [terminalSessionsModalOpen, setTerminalSessionsModalOpen] = useState(false);
  const [terminalSidebarOpen, setTerminalSidebarOpen] = useState(false);

  const fetchRunningModels = async () => {
    try {
      const res = await fetch('/api/models/running');
      if (res.ok) {
        const data = await res.json();
        if (data.runningModels) {
          setRunningModels(data.runningModels);
        }
      }
    } catch (_) {}
  };

  const fetchSystemMetrics = async () => {
    try {
      const res = await fetch('/api/system/metrics');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          setSystemMetrics(data);
          return;
        }
      }
      setSystemMetrics(null);
    } catch (_) {
      setSystemMetrics(null);
    }
  };

  const fetchTerminalSessions = async () => {
    try {
      const res = await fetch('/api/terminal/sessions');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.sessions) {
          setTerminalSessions(data.sessions);
        }
      }
    } catch (_) {}
  };

  const handleTerminateTerminalSession = async (sessionId: string) => {
    try {
      await fetch(`/api/terminal/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      fetchTerminalSessions();
    } catch (_) {}
  };

  const fetchConfig = async () => {
    try {
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const data = await configRes.json();
        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            ...data.config,
          }));
          if (data.config.workingDir) {
            localStorage.setItem('local-model-chat.workingDir', data.config.workingDir);
          }
        }
        if (data.context) {
          setContextInfo(data.context);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchSystemMetrics();
    fetchTerminalSessions();
    const interval = setInterval(() => {
      fetchSystemMetrics();
      fetchTerminalSessions();
      fetchConfig();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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

      await fetchRunningModels();

      const contextRes = await fetch('/api/context');
      if (contextRes.ok) {
        const data = await contextRes.json();
        setContextInfo(data);
      }

      const messagesRes = await fetch('/api/messages');
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch (err) {
      console.error('Error loading initial app state:', err);
    }
  };

  const isActiveModelLoaded = runningModels.some(
    (model) =>
      (model.name === config.model || model.model === config.model) &&
      model.size_vram > 0
  );

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    void fetchRunningModels();
    const interval = setInterval(fetchRunningModels, isGenerating ? 750 : 4000);
    return () => clearInterval(interval);
  }, [isGenerating]);

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
    setConfig((prev) => ({ ...prev, contextWindow: newCtx }));
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextWindow: newCtx }),
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

    const configRes = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const configData = await configRes.json();
    if (!configRes.ok || !configData.success) {
      throw new Error(configData.error || 'Could not save Ollama connection.');
    }

    const modelsRes = await fetch('/api/models');
    const modelsData = await modelsRes.json();
    if (!modelsRes.ok || !modelsData.success) {
      throw new Error(modelsData.error || 'Saved, but could not connect to the Ollama server.');
    }

    setConfig(configData.config);
    setModels(modelsData.models || []);
    setRunningModels([]);
    await fetchRunningModels();
  };

  const handleNewChat = async () => {
    setMessages([]);
    setStreamingText('');
    setGenerationStatus('idle');
    setTerminalSessions([]);
    setTerminalSidebarOpen(false);
    setTerminalSessionsModalOpen(false);
    const res = await fetch('/api/clear', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setContextInfo(data.context);
    }
  };

  const handleRewindToMessage = async (messageId: string) => {
    try {
      const res = await fetch('/api/chat/rewind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setContextInfo(data.context);
          setMessages((prev) => {
            const targetIdx = prev.findIndex((m) => m.id === messageId);
            return targetIdx !== -1 ? prev.slice(0, targetIdx) : prev;
          });
        }
      }
    } catch (_) {}
  };

  const handleCompactContext = async () => {
    try {
      const res = await fetch('/api/chat/compact', { method: 'POST' });
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
        body: JSON.stringify({ decision: 'approve' }),
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
        body: JSON.stringify({ decision: 'reject', reason }),
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

  const handleSendMessage = async (
    userPrompt: string,
    attachments: TextAttachment[] = [],
    imageAttachments: import('./types').ImageAttachment[] = []
  ) => {
    setIsGenerating(true);
    setGenerationStatus('generating');
    setStreamingText('');
    setStreamingThinking('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userPrompt, attachments, imageAttachments }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server response error ${response.status}`);
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

            if (eventType === 'message_added') {
              setMessages((prev) => {
                if (prev.some((m) => m.id === eventData.id)) return prev;
                return [...prev, eventData];
              });
            } else if (eventType === 'chunk') {
              setStreamingText((prev) => prev + eventData.chunk);
            } else if (eventType === 'thinking_chunk') {
              setStreamingThinking((prev) => prev + eventData.chunk);
            } else if (eventType === 'context_update') {
              setContextInfo(eventData);
            } else if (eventType === 'tool_approval_required') {
              setPendingApprovalCall({ name: eventData.name, args: eventData.args, diff: eventData.diff });
            } else if (eventType === 'tool_start') {
              setPendingApprovalCall(null);
              setActiveToolCall({ name: eventData.name, args: eventData.args });
            } else if (eventType === 'tool_end') {
              setActiveToolCall(null);
              setPendingApprovalCall(null);
            } else if (eventType === 'done') {
              setActiveToolCall(null);
              setPendingApprovalCall(null);
              setStreamingText('');
              setStreamingThinking('');
              setGenerationStatus('completed');
            } else if (eventType === 'cancelled') {
              setActiveToolCall(null);
              setPendingApprovalCall(null);
              setStreamingText('');
              setStreamingThinking('');
              setGenerationStatus('cancelled');
            } else if (eventType === 'error') {
              setActiveToolCall(null);
              setPendingApprovalCall(null);
              setStreamingText('');
              setStreamingThinking('');
              setGenerationStatus('error');
              alert(`Error: ${eventData.error}`);
            }
          }
        }
      }
    } catch (err: any) {
      setActiveToolCall(null);
      setGenerationStatus('error');
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setStreamingText('');
      setStreamingThinking('');
      setActiveToolCall(null);
      const ctxRes = await fetch('/api/context');
      if (ctxRes.ok) {
        const data = await ctxRes.json();
        setContextInfo(data);
      }
    }
  };

  const handleCancelGeneration = async () => {
    try {
      const response = await fetch('/api/chat/cancel', { method: 'POST' });
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Header
        config={config}
        contextInfo={contextInfo}
        models={models}
        runningModels={runningModels}
        sidebarOpen={sidebarOpen}
        activeView={activeView}
        isGenerating={isGenerating}
        modelLoadElapsed={modelLoadElapsed}
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
        systemMetrics={systemMetrics}
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeftSidebar={() => setLeftSidebarOpen((prev) => !prev)}
        activeTerminalCount={terminalSessions.filter((s) => s.status === 'running').length}
        onOpenTerminalSessions={() => setTerminalSidebarOpen((prev) => !prev)}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LeftSidebar
          isOpen={leftSidebarOpen}
          onClose={() => setLeftSidebarOpen(false)}
          config={config}
          activeView={activeView}
          onSelectView={setActiveView}
          onNewChat={handleNewChat}
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
        />
        {activeView === 'chat' ? (
          <ChatWindow
            messages={messages}
            streamingText={streamingText}
            streamingThinking={streamingThinking}
            isGenerating={isGenerating}
            isModelLoaded={isActiveModelLoaded}
            modelLoadElapsed={modelLoadElapsed}
            generationStatus={generationStatus}
            pendingApprovalCall={pendingApprovalCall}
            isSubmittingToolApproval={isSubmittingToolApproval}
            activeToolCall={activeToolCall}
            supportsVision={supportsVision}
            onSendMessage={handleSendMessage}
            onCancelGeneration={handleCancelGeneration}
            onApproveToolCall={handleApproveToolCall}
            onRejectToolCall={handleRejectToolCall}
            onRewindToMessage={handleRewindToMessage}
            onClearChat={handleNewChat}
            onOpenToolSettings={() => setToolSettingsModalOpen(true)}
            onOpenModelDetails={() => setModelDetailsModalOpen(true)}
            onCompactContext={handleCompactContext}
          />
        ) : (
          <BenchmarkView
            models={models}
            activeModel={config.model}
            onSelectModel={handleSelectModel}
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
    </div>
  );
};

export default App;
