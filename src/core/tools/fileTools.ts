export type DiffLine = {
  type: 'context' | 'add' | 'remove' | 'meta';
  content: string;
  oldLine?: number;
  newLine?: number;
};

export type FileDiff = {
  path: string;
  oldPath: string;
  newPath: string;
  lines: DiffLine[];
  truncated?: boolean;
};

export const MAX_DIFF_LINES = 400;

export function limitDiffLines(lines: DiffLine[]): Pick<FileDiff, 'lines' | 'truncated'> {
  if (lines.length <= MAX_DIFF_LINES) return { lines };

  const half = MAX_DIFF_LINES / 2;
  return {
    lines: [
      ...lines.slice(0, half),
      { type: 'meta', content: `… ${lines.length - MAX_DIFF_LINES} diff lines hidden …` },
      ...lines.slice(-half),
    ],
    truncated: true,
  };
}

export function buildCreatedFileDiff(filePath: string, content: string): FileDiff {
  const addedLines = content.split('\n').map((line, index): DiffLine => ({
    type: 'add',
    content: line,
    newLine: index + 1,
  }));
  const limited = limitDiffLines(addedLines);

  return {
    path: filePath,
    oldPath: '/dev/null',
    newPath: filePath,
    ...limited,
  };
}

export function buildEditedFileDiff(filePath: string, original: string, match: string, replacement: string): FileDiff {
  const matchStart = original.indexOf(match);
  const matchEnd = matchStart + match.length;
  const lineStart = original.lastIndexOf('\n', Math.max(0, matchStart - 1)) + 1;
  const nextNewline = original.indexOf('\n', matchEnd);
  const lineEnd = nextNewline === -1 ? original.length : nextNewline;

  const beforeLines = original.slice(0, lineStart).split('\n').slice(0, -1);
  const afterLines = original.slice(nextNewline === -1 ? original.length : nextNewline + 1).split('\n');
  const oldChangedLines = original.slice(lineStart, lineEnd).split('\n');
  const newChangedText =
    original.slice(lineStart, matchStart) + replacement + original.slice(matchEnd, lineEnd);
  const newChangedLines = newChangedText.split('\n');
  const contextBefore = beforeLines.slice(-3);
  const contextAfter = afterLines.slice(0, 3);
  const oldStartLine = beforeLines.length + 1;
  const newStartLine = oldStartLine;
  const lines: DiffLine[] = [];

  contextBefore.forEach((line, index) => {
    const lineNumber = oldStartLine - contextBefore.length + index;
    lines.push({ type: 'context', content: line, oldLine: lineNumber, newLine: lineNumber });
  });
  oldChangedLines.forEach((line, index) => {
    lines.push({ type: 'remove', content: line, oldLine: oldStartLine + index });
  });
  newChangedLines.forEach((line, index) => {
    lines.push({ type: 'add', content: line, newLine: newStartLine + index });
  });
  contextAfter.forEach((line, index) => {
    lines.push({
      type: 'context',
      content: line,
      oldLine: oldStartLine + oldChangedLines.length + index,
      newLine: newStartLine + newChangedLines.length + index,
    });
  });

  return {
    path: filePath,
    oldPath: filePath,
    newPath: filePath,
    ...limitDiffLines(lines),
  };
}

export function stripCopiedLineNumbers(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const numberedLine = line.match(/^\s*\d+:\s?(.*)$/);
      return numberedLine ? numberedLine[1] : line;
    })
    .join('\n');
}

export function normalizeModelText(text: string): string {
  let cleaned = text;
  if (typeof cleaned === 'string' && !cleaned.includes('\n') && cleaned.includes('\\n')) {
    cleaned = cleaned.replace(/\\n/g, '\n');
  }
  return stripCopiedLineNumbers(cleaned);
}

export function preserveFirstLineIndent(match: string, replacement: string): string {
  const firstMatchLine = match.split('\n')[0] ?? '';
  const indentation = firstMatchLine.match(/^\s*/)?.[0] ?? '';
  if (!indentation || !replacement || /^\s/.test(replacement)) return replacement;
  return indentation + replacement;
}
