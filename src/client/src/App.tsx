import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ChatWindow } from './components/ChatWindow';
import { ContextSidebar } from './components/ContextSidebar';
import { SystemPromptModal } from './components/SystemPromptModal';
import { BenchmarkView } from './components/BenchmarkView';
import { ToolSettingsModal } from './components/ToolSettingsModal';
import { ConnectionSettingsModal } from './components/ConnectionSettingsModal';
import { DirectoryPickerModal } from './components/DirectoryPickerModal';
import { AgentConfig, ChatMessage, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo, PendingApprovalCall, TextAttachment, ToolSettings } from './types';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'chat' | 'benchmark'>('chat');

  const [config, setConfig] = useState<AgentConfig>({
    ollamaHost: 'http://127.0.0.1:11434',
    model: 'qwen2.5-coder:7b',
    temperature: 0.2,
    systemPrompt: 'You are an intelligent AI assistant with tools for workspace files, terminal commands, web search, and reading public web pages.',
    workingDir: '',
    showWorkingDirInfo: false,
  });

  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    terminalMode: 'confirm',
    fileEditMode: 'confirm',
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
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [toolSettingsModalOpen, setToolSettingsModalOpen] = useState(false);
  const [connectionSettingsModalOpen, setConnectionSettingsModalOpen] = useState(false);
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);

  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelLoadElapsed, setModelLoadElapsed] = useState(0);
  const [generationStatus, setGenerationStatus] =
    useState<'idle' | 'generating' | 'completed' | 'cancelled' | 'error'>('idle');
  const [pendingApprovalCall, setPendingApprovalCall] = useState<PendingApprovalCall | null>(null);

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

  const loadInitialState = async () => {
    try {
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const data = await configRes.json();
        const savedWorkingDir = localStorage.getItem('local-model-chat.workingDir');
        if (savedWorkingDir && savedWorkingDir !== data.config.workingDir) {
          const savedDirRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workingDir: savedWorkingDir }),
          });
          const savedDirData = await savedDirRes.json();
          if (savedDirRes.ok && savedDirData.success) {
            setConfig(savedDirData.config);
            setContextInfo(savedDirData.context);
          } else {
            localStorage.removeItem('local-model-chat.workingDir');
            setConfig(data.config);
            setContextInfo(data.context);
          }
        } else {
          setConfig(data.config);
          setContextInfo(data.context);
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
    const res = await fetch('/api/clear', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setContextInfo(data.context);
    }
  };

  const handleUpdateToolSettings = async (newSettings: ToolSettings) => {
    setToolSettings(newSettings);
    // Sync approval modes to server
    await fetch('/api/chat/tool-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        terminalMode: newSettings.terminalMode,
        fileEditMode: newSettings.fileEditMode,
      }),
    });
  };

  const handleApproveToolCall = async () => {
    setPendingApprovalCall(null);
    await fetch('/api/chat/tool-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
  };

  const handleRejectToolCall = async () => {
    setPendingApprovalCall(null);
    await fetch('/api/chat/tool-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });
  };

  const handleSendMessage = async (userPrompt: string, attachments: TextAttachment[] = []) => {
    setIsGenerating(true);
    setGenerationStatus('generating');
    setStreamingText('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userPrompt, attachments }),
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
            } else if (eventType === 'context_update') {
              setContextInfo(eventData);
            } else if (eventType === 'tool_approval_required') {
              setPendingApprovalCall({ name: eventData.name, args: eventData.args, diff: eventData.diff });
            } else if (eventType === 'tool_start') {
              setPendingApprovalCall(null);
            } else if (eventType === 'done') {
              setStreamingText('');
              setGenerationStatus('completed');
            } else if (eventType === 'cancelled') {
              setStreamingText('');
              setGenerationStatus('cancelled');
            } else if (eventType === 'error') {
              setGenerationStatus('error');
              alert(`Error: ${eventData.error}`);
            }
          }
        }
      }
    } catch (err: any) {
      setGenerationStatus('error');
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setStreamingText('');
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
        onNewChat={handleNewChat}
        onOpenSystemPrompt={() => setSystemPromptModalOpen(true)}
        onOpenToolSettings={() => setToolSettingsModalOpen(true)}
        onOpenConnectionSettings={() => setConnectionSettingsModalOpen(true)}
        onOpenWorkingDirPicker={() => setDirectoryPickerOpen(true)}
        onToggleWorkingDirInfo={handleToggleWorkingDirInfo}
        onRefreshModels={loadInitialState}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeView === 'chat' ? (
          <ChatWindow
            messages={messages}
            streamingText={streamingText}
            isGenerating={isGenerating}
            isModelLoaded={isActiveModelLoaded}
            modelLoadElapsed={modelLoadElapsed}
            generationStatus={generationStatus}
            pendingApprovalCall={pendingApprovalCall}
            onSendMessage={handleSendMessage}
            onCancelGeneration={handleCancelGeneration}
            onApproveToolCall={handleApproveToolCall}
            onRejectToolCall={handleRejectToolCall}
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
    </div>
  );
};

export default App;
