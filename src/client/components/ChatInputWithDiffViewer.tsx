import React, { useState, useEffect } from 'react';
import RealTimeDiffViewer from './RealTimeDiffViewer';

interface FileChange {
  filePath: string;
  oldContent?: string;
  newContent: string;
  timestamp: Date;
}

const ChatInputWithDiffViewer: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Simulate receiving file changes from the agent
  useEffect(() => {
    // In a real implementation, this would be connected to the agent's file operations
    // For demonstration, we'll simulate some changes
    const timer = setTimeout(() => {
      setFileChanges(prev => [
        ...prev,
        {
          filePath: 'src/client/components/RealTimeDiffViewer.tsx',
          oldContent: '',
          newContent: 'import React from \'react\';\n\nexport default function RealTimeDiffViewer() {\n  return <div>Real-Time Diff Viewer</div>;\n}\n',
          timestamp: new Date(),
        },
      ]);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log('Submitted:', inputValue);
    setInputValue('');
  };

  return (
    <div className="chat-input-container">
      <RealTimeDiffViewer
        changes={fileChanges}
        onCollapseToggle={(collapsed: boolean) => setIsCollapsed(collapsed)}
      />

      <form onSubmit={handleSubmit} className="chat-input-form">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          className={`chat-input ${isCollapsed ? 'expanded' : 'collapsed'}`}
        />
        <button type="submit" className="send-button">Send</button>
      </form>
    </div>
  );
};

export default ChatInputWithDiffViewer;
