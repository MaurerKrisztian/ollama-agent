import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ChatWindow } from './components/ChatWindow';
import { ContextSidebar } from './components/ContextSidebar';
import { SystemPromptModal } from './components/SystemPromptModal';
import { BenchmarkView } from './components/BenchmarkView';
import { ToolSettingsModal } from './components/ToolSettingsModal';
import { AgentConfig, ChatMessage, ContextInfo, OllamaModelInfo, OllamaRunningModelInfo, ToolSettings } from './types';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'chat' | 'benchmark'>('chat');

  const [config, setConfig] = useState<AgentConfig>({
    ollamaHost: 'http://127.0.0.1:11434',
    model: 'qwen2.5-coder:7b',
    temperature: 0.2,
    systemPrompt: 'You are an intelligent AI assistant equipped with workspace tools for inspecting directories and reading files.',
    workingDir: '',
  });

  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    terminalMode: 'confirm',
    fileEditMode: 'auto',
    enabledTools: {
      list_directory: true,
      read_file: true,
      edit_file: true,
      create_file: true,
      grep_search: true,
      execute_command: true,
    },
  });

  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [runningModels, setRunningModels] = useState<OllamaRunningModelInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [toolSettingsModalOpen, setToolSettingsModalOpen] = useState(false);

  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingApprovalCall, setPendingApprovalCall] = useState<{ name: string; args: Record<string, any> } | null>(null);

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
        setConfig(data.config);
        setContextInfo(data.context);
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
    } catch (err) {
      console.error('Error loading initial app state:', err);
    }
  };

  useEffect(() => {
    loadInitialState();
    const interval = setInterval(fetchRunningModels, 4000);
    return () => clearInterval(interval);
  }, []);

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

  const handleChangeWorkingDir = async (newDir: string) => {
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
      } else {
        alert(`Failed to set working directory: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error setting working dir: ${err.message}`);
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

  const handleNewChat = async () => {
    setMessages([]);
    setStreamingText('');
    const res = await fetch('/api/clear', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setContextInfo(data.context);
    }
  };

  const handleUpdateToolSettings = async (newSettings: ToolSettings) => {
    setToolSettings(newSettings);
    // Sync terminal mode to server
    await fetch('/api/chat/tool-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalMode: newSettings.terminalMode }),
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

  const handleSendMessage = async (userPrompt: string) => {
    setIsGenerating(true);
    setStreamingText('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userPrompt }),
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
              setPendingApprovalCall({ name: eventData.name, args: eventData.args });
            } else if (eventType === 'tool_start') {
              setPendingApprovalCall(null);
            } else if (eventType === 'done') {
              setStreamingText('');
            } else if (eventType === 'error') {
              alert(`Error: ${eventData.error}`);
            }
          }
        }
      }
    } catch (err: any) {
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
        onSelectView={setActiveView}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onSelectModel={handleSelectModel}
        onChangeTemperature={handleChangeTemperature}
        onNewChat={handleNewChat}
        onOpenSystemPrompt={() => setSystemPromptModalOpen(true)}
        onOpenToolSettings={() => setToolSettingsModalOpen(true)}
        onChangeWorkingDir={handleChangeWorkingDir}
        onRefreshModels={loadInitialState}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeView === 'chat' ? (
          <ChatWindow
            messages={messages}
            streamingText={streamingText}
            isGenerating={isGenerating}
            pendingApprovalCall={pendingApprovalCall}
            onSendMessage={handleSendMessage}
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
    </div>
  );
};

export default App;
