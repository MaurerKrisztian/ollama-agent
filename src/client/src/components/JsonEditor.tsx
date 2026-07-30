import React from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  rows?: number;
}

export const highlightJson = (jsonStr: string): string => {
  if (!jsonStr) return '';
  const escaped = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = '#f59e0b'; // number (amber)
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = '#818cf8'; // key (indigo)
        } else {
          cls = '#4ade80'; // string (emerald)
        }
      } else if (/true|false/.test(match)) {
        cls = '#ec4899'; // boolean (pink)
      } else if (/null/.test(match)) {
        cls = '#94a3b8'; // null (slate)
      }
      return `<span style="color: ${cls};">${match}</span>`;
    }
  );
};

export const JsonEditor: React.FC<JsonEditorProps> = ({
  value,
  onChange,
  onValidationChange,
  rows = 10,
}) => {
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const preRef = React.useRef<HTMLPreElement>(null);

  // Validate JSON whenever value changes
  React.useEffect(() => {
    try {
      if (!value.trim()) {
        setError('JSON cannot be empty.');
        onValidationChange?.(false, 'JSON cannot be empty.');
        return;
      }
      JSON.parse(value);
      setError(null);
      onValidationChange?.(true);
    } catch (err: any) {
      const errMsg = err.message || 'Invalid JSON syntax.';
      setError(errMsg);
      onValidationChange?.(false, errMsg);
    }
  }, [value, onValidationChange]);

  const handleSyncScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange(formatted);
    } catch (_) {}
  };

  const lineCount = Math.max(1, value.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* Editor Controls Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'rgba(15, 23, 42, 0.9)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          fontSize: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {error ? (
            <>
              <AlertCircle size={14} color="#f87171" />
              <span style={{ color: '#f87171', fontWeight: 600 }}>Invalid JSON Syntax</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} color="#4ade80" />
              <span style={{ color: '#4ade80', fontWeight: 600 }}>Valid JSON</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleFormatJson}
          disabled={!!error}
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid var(--border-color)',
            color: error ? 'var(--text-dim)' : 'var(--accent-primary)',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '0.7rem',
            cursor: error ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Sparkles size={11} />
          <span>Format JSON</span>
        </button>
      </div>

      {/* Editor Main Container */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          background: 'rgba(10, 15, 26, 0.9)',
          borderRadius: '8px',
          border: `1px solid ${error ? '#f87171' : 'var(--border-color)'}`,
          overflow: 'hidden',
          minHeight: `${rows * 20}px`,
        }}
      >
        {/* Line Numbers Column */}
        <pre
          style={{
            margin: 0,
            padding: '10px 8px',
            fontFamily: 'var(--font-code)',
            fontSize: '0.775rem',
            lineHeight: '1.5',
            color: 'var(--text-dim)',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRight: '1px solid var(--border-color)',
            textAlign: 'right',
            userSelect: 'none',
            minWidth: '32px',
            boxSizing: 'border-box',
          }}
        >
          {lineNumbers}
        </pre>

        {/* Textarea & Color Overlay Area */}
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {/* Syntax Highlighted Overlay */}
          <pre
            ref={preRef}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlightJson(value) + '\n' }}
            style={{
              position: 'absolute',
              inset: 0,
              margin: 0,
              padding: '10px 12px',
              fontFamily: 'var(--font-code)',
              fontSize: '0.775rem',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: 'hidden',
              pointerEvents: 'none',
              color: '#e2e8f0',
              boxSizing: 'border-box',
            }}
          />

          {/* Editable Transparent Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleSyncScroll}
            rows={rows}
            spellCheck={false}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              margin: 0,
              padding: '10px 12px',
              fontFamily: 'var(--font-code)',
              fontSize: '0.775rem',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'transparent',
              color: 'transparent',
              caretColor: '#38bdf8',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Syntax Error Banner */}
      {error && (
        <div
          style={{
            fontSize: '0.725rem',
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontFamily: 'var(--font-code)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
