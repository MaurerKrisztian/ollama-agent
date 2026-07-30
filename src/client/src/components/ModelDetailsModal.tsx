import React, { useState, useEffect } from 'react';
import { X, Cpu, HardDrive, Zap, Info, FileCode, Sliders, MessageSquare, Layers, Loader2 } from 'lucide-react';
import { OllamaModelInfo, OllamaRunningModelInfo } from '../types';

interface ModelDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  installedModels: OllamaModelInfo[];
  runningModels: OllamaRunningModelInfo[];
}

export const ModelDetailsModal: React.FC<ModelDetailsModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  installedModels,
  runningModels,
}) => {
  const [activeModelName, setActiveModelName] = useState<string>(selectedModel);
  const [modelDetails, setModelDetails] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'modelfile' | 'parameters' | 'template' | 'gguf'>('modelfile');

  useEffect(() => {
    if (isOpen) {
      setActiveModelName(selectedModel);
    }
  }, [isOpen, selectedModel]);

  useEffect(() => {
    if (!isOpen || !activeModelName) return;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/models/show?name=${encodeURIComponent(activeModelName)}`);
        const data = await res.json();
        if (data.success) {
          setModelDetails(data.details);
        } else {
          setError(data.error || 'Failed to load model details.');
        }
      } catch (err: any) {
        setError(err.message || 'Network error.');
      }
      setLoading(false);
    };

    fetchDetails();
  }, [isOpen, activeModelName]);

  if (!isOpen) return null;

  const installedInfo = installedModels.find((m) => m.name === activeModelName);
  const runningInfo = runningModels.find((m) => m.name === activeModelName || m.model === activeModelName);

  const diskGb = installedInfo?.size ? (installedInfo.size / (1024 * 1024 * 1024)).toFixed(2) : null;
  const vramGb = runningInfo?.size_vram ? (runningInfo.size_vram / (1024 * 1024 * 1024)).toFixed(2) : null;
  const paramSize = installedInfo?.details?.parameter_size || modelDetails?.details?.parameter_size || 'N/A';
  const quant = installedInfo?.details?.quantization_level || modelDetails?.details?.quantization_level || 'N/A';
  const family = installedInfo?.details?.family || modelDetails?.details?.family || 'N/A';
  const format = installedInfo?.details?.format || modelDetails?.details?.format || 'N/A';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '680px',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-color)',
          maxHeight: '85vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Ollama Model Inspector
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Model Picker & Summary Bar */}
        <div style={{ padding: '16px 20px 12px', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Select Model:
            </label>
            <select
              value={activeModelName}
              onChange={(e) => setActiveModelName(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '0.825rem',
                fontFamily: 'var(--font-code)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {installedModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Main Info Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Parameter Size</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-code)' }}>
                {paramSize}
              </span>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Quantization</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-code)' }}>
                {quant}
              </span>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Max Context Window</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-code)' }}>
                {(() => {
                  if (!modelDetails) return 'Loading...';
                  if (modelDetails.model_info && typeof modelDetails.model_info === 'object') {
                    for (const [key, value] of Object.entries(modelDetails.model_info)) {
                      if (key.endsWith('.context_length') && typeof value === 'number') {
                        const kVal = Math.round(value / 1024);
                        return `${value.toLocaleString()} (${kVal}k)`;
                      }
                    }
                  }
                  if (typeof modelDetails.parameters === 'string') {
                    const match = modelDetails.parameters.match(/num_ctx\s+(\d+)/i);
                    if (match) {
                      const val = parseInt(match[1], 10);
                      const kVal = Math.round(val / 1024);
                      return `${val.toLocaleString()} (${kVal}k)`;
                    }
                  }
                  return 'N/A';
                })()}
              </span>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Family / Format</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-code)' }}>
                {family} ({format})
              </span>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Disk File Size</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {diskGb ? `${diskGb} GB` : 'N/A'}
              </span>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>GPU VRAM Status</span>
              <span
                style={{
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  color: runningInfo ? '#4ade80' : 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '2px',
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: runningInfo ? '#4ade80' : 'var(--text-dim)' }} />
                {runningInfo ? `Loaded (${vramGb} GB)` : 'Idle'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Body / Tab Navigation */}
        <div style={{ padding: '12px 20px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          {[
            { id: 'modelfile', label: 'Modelfile', icon: FileCode },
            { id: 'parameters', label: 'Parameters', icon: Sliders },
            { id: 'template', label: 'Template', icon: MessageSquare },
            { id: 'gguf', label: 'GGUF Metadata', icon: Layers },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px 6px 0 0',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--border-color) var(--border-color) transparent' : 'transparent',
                  background: isActive ? 'rgba(30, 41, 59, 0.9)' : 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Display */}
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 0', color: 'var(--text-muted)' }}>
              <Loader2 size={18} className="spin" />
              <span>Fetching model specifications from Ollama...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.8rem' }}>
              {error}
            </div>
          ) : !modelDetails ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No detail information returned.
            </div>
          ) : (
            <>
              {activeTab === 'modelfile' && (
                <pre
                  style={{
                    fontFamily: 'var(--font-code)',
                    fontSize: '0.775rem',
                    background: 'rgba(10, 15, 26, 0.9)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    color: '#e2e8f0',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '340px',
                    overflowY: 'auto',
                  }}
                >
                  {modelDetails.modelfile || 'No Modelfile text provided.'}
                </pre>
              )}

              {activeTab === 'parameters' && (
                <pre
                  style={{
                    fontFamily: 'var(--font-code)',
                    fontSize: '0.775rem',
                    background: 'rgba(10, 15, 26, 0.9)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    color: '#e2e8f0',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '340px',
                    overflowY: 'auto',
                  }}
                >
                  {modelDetails.parameters || 'No parameters configured.'}
                </pre>
              )}

              {activeTab === 'template' && (
                <pre
                  style={{
                    fontFamily: 'var(--font-code)',
                    fontSize: '0.775rem',
                    background: 'rgba(10, 15, 26, 0.9)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    color: '#38bdf8',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '340px',
                    overflowY: 'auto',
                  }}
                >
                  {modelDetails.template || 'No chat template provided.'}
                </pre>
              )}

              {activeTab === 'gguf' && (
                <pre
                  style={{
                    fontFamily: 'var(--font-code)',
                    fontSize: '0.75rem',
                    background: 'rgba(10, 15, 26, 0.9)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    color: '#a5b4fc',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '340px',
                    overflowY: 'auto',
                  }}
                >
                  {modelDetails.model_info ? JSON.stringify(modelDetails.model_info, null, 2) : 'No GGUF model_info metadata available.'}
                </pre>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-gradient)',
              border: 'none',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
