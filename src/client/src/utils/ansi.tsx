import React from 'react';

const COLOR_MAP: Record<number, string> = {
  30: '#64748b',
  31: '#ef4444',
  32: '#10b981',
  33: '#f59e0b',
  34: '#3b82f6',
  35: '#a855f7',
  36: '#06b6d4',
  37: '#f8fafc',
  90: '#94a3b8',
  91: '#f87171',
  92: '#34d399',
  93: '#fbbf24',
  94: '#60a5fa',
  95: '#c084fc',
  96: '#22d3ee',
  97: '#ffffff',
};

export function renderAnsiLine(line: string): React.ReactNode {
  if (!line || (!line.includes('\u001b') && !line.includes('\u009b'))) {
    return line;
  }

  const regex = /(?:\u001b|\u009b)\[([0-9;]*)m/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let currentFg: string | null = null;
  let isBold = false;
  let isDim = false;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const textChunk = line.substring(lastIndex, match.index);
    if (textChunk) {
      const style: React.CSSProperties = {};
      if (currentFg) style.color = currentFg;
      if (isBold) style.fontWeight = 700;
      if (isDim) style.opacity = 0.7;

      if (Object.keys(style).length > 0) {
        parts.push(
          <span key={parts.length} style={style}>
            {textChunk}
          </span>
        );
      } else {
        parts.push(textChunk);
      }
    }

    const rawCodes = match[1] ? match[1].split(';').map(Number) : [0];
    for (const code of rawCodes) {
      if (code === 0) {
        currentFg = null;
        isBold = false;
        isDim = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 2) {
        isDim = true;
      } else if (COLOR_MAP[code]) {
        currentFg = COLOR_MAP[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  const remaining = line.substring(lastIndex);
  if (remaining) {
    const style: React.CSSProperties = {};
    if (currentFg) style.color = currentFg;
    if (isBold) style.fontWeight = 700;
    if (isDim) style.opacity = 0.7;

    if (Object.keys(style).length > 0) {
      parts.push(
        <span key={parts.length} style={style}>
          {remaining}
        </span>
      );
    } else {
      parts.push(remaining);
    }
  }

  return parts.length > 0 ? parts : line;
}
