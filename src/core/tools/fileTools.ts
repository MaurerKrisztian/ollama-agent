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
  const normOriginal = original.replace(/\r\n/g, '\n');
  const normMatch = match.replace(/\r\n/g, '\n');
  const normReplacement = replacement.replace(/\r\n/g, '\n');

  let matchStart = normOriginal.indexOf(normMatch);
  if (matchStart === -1) {
    const trimMatch = normMatch.trim();
    if (trimMatch && normOriginal.includes(trimMatch)) {
      matchStart = normOriginal.indexOf(trimMatch);
    }
  }

  const effectiveMatch = matchStart !== -1 ? normOriginal.slice(matchStart, matchStart + normMatch.length) : normMatch;
  const matchLen = effectiveMatch.length;
  const safeStart = matchStart !== -1 ? matchStart : 0;
  const matchEnd = safeStart + matchLen;

  const lineStart = normOriginal.lastIndexOf('\n', Math.max(0, safeStart - 1));
  const actualLineStart = lineStart === -1 ? 0 : lineStart + 1;
  const nextNewline = normOriginal.indexOf('\n', matchEnd);
  const actualLineEnd = nextNewline === -1 ? normOriginal.length : nextNewline;

  const beforeText = normOriginal.slice(0, actualLineStart);
  const beforeLines = beforeText ? beforeText.split('\n') : [];
  if (beforeLines.length > 0 && beforeText.endsWith('\n')) {
    beforeLines.pop();
  }

  const afterText = normOriginal.slice(actualLineEnd === normOriginal.length ? normOriginal.length : actualLineEnd + 1);
  const afterLines = afterText ? afterText.split('\n') : [];

  const oldChangedLines = normOriginal.slice(actualLineStart, actualLineEnd).split('\n');
  const newChangedText =
    normOriginal.slice(actualLineStart, safeStart) + normReplacement + normOriginal.slice(matchEnd, actualLineEnd);
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

export interface PatchHunk {
  oldStartLine: number;
  oldLines: string[];
  newLines: string[];
}

export function applyUnifiedDiff(
  originalContent: string,
  patchText: string
): { success: boolean; updatedContent?: string; error?: string } {
  const normOriginal = originalContent.replace(/\r\n/g, '\n');
  const cleanPatch = normalizeModelText(patchText).replace(/\r\n/g, '\n');

  const patchLines = cleanPatch.split('\n');
  const hunks: PatchHunk[] = [];
  let currentHunk: PatchHunk | null = null;

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];

    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }

    const hunkMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStartLine: parseInt(hunkMatch[1], 10),
        oldLines: [],
        newLines: [],
      };
      continue;
    }

    if (!currentHunk) {
      currentHunk = {
        oldStartLine: 1,
        oldLines: [],
        newLines: [],
      };
    }

    if (line.startsWith('-')) {
      currentHunk.oldLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      const addedContent = line.slice(1);
      const lastContextIdx = currentHunk.newLines.length - 1;
      if (
        lastContextIdx >= 0 &&
        currentHunk.oldLines.length === currentHunk.newLines.length &&
        currentHunk.oldLines[lastContextIdx] === currentHunk.newLines[lastContextIdx]
      ) {
        const targetCtx = currentHunk.newLines[lastContextIdx];
        if (targetCtx && (addedContent.trim().startsWith(targetCtx.trim().slice(0, 10)) || targetCtx.trim().startsWith(addedContent.trim().slice(0, 10)))) {
          currentHunk.newLines.pop();
        }
      }
      currentHunk.newLines.push(addedContent);
    } else if (line.startsWith(' ')) {
      const content = line.slice(1);
      currentHunk.oldLines.push(content);
      currentHunk.newLines.push(content);
    } else if (line.startsWith('\\')) {
      continue;
    } else {
      currentHunk.oldLines.push(line);
      currentHunk.newLines.push(line);
    }
  }

  if (currentHunk && (currentHunk.oldLines.length > 0 || currentHunk.newLines.length > 0)) {
    hunks.push(currentHunk);
  }

  if (hunks.length === 0) {
    return { success: false, error: 'No valid patch hunks found in the provided patch text.' };
  }

  let lines = normOriginal.split('\n');

  for (const hunk of hunks) {
    const { oldStartLine, oldLines, newLines } = hunk;
    if (oldLines.length === 0 && newLines.length === 0) continue;

    let matchIdx = -1;
    const targetIdx = Math.max(0, oldStartLine - 1);

    const isMatchAt = (idx: number, requireExactWs = false) => {
      if (idx + oldLines.length > lines.length) return false;
      for (let j = 0; j < oldLines.length; j++) {
        const fileLine = lines[idx + j];
        const patchLine = oldLines[j];
        if (requireExactWs) {
          if (fileLine !== patchLine) return false;
        } else {
          if (fileLine.trim() !== patchLine.trim()) return false;
        }
      }
      return true;
    };

    if (isMatchAt(targetIdx, true)) {
      matchIdx = targetIdx;
    } else if (isMatchAt(targetIdx, false)) {
      matchIdx = targetIdx;
    } else {
      let bestDist = Infinity;
      for (let i = 0; i <= lines.length - oldLines.length; i++) {
        if (isMatchAt(i, true) || isMatchAt(i, false)) {
          const dist = Math.abs(i - targetIdx);
          if (dist < bestDist) {
            bestDist = dist;
            matchIdx = i;
          }
        }
      }
    }

    if (matchIdx === -1) {
      const nonAttrOldLines = oldLines.map((l) => l.trim());
      if (nonAttrOldLines.filter(Boolean).length > 0) {
        for (let i = 0; i <= lines.length - oldLines.length; i++) {
          const window = lines.slice(i, i + oldLines.length).map((l) => l.trim());
          if (window.every((l, idx) => l === nonAttrOldLines[idx])) {
            matchIdx = i;
            break;
          }
        }
      }
    }

    if (matchIdx === -1) {
      return {
        success: false,
        error: `Failed to find context lines for patch hunk starting near line ${oldStartLine}:\n${oldLines.slice(0, 3).join('\n')}`,
      };
    }

    lines.splice(matchIdx, oldLines.length, ...newLines);
  }

  return {
    success: true,
    updatedContent: lines.join('\n'),
  };
}

export function buildPatchFileDiff(filePath: string, originalContent: string, patchText: string): FileDiff {
  const patchResult = applyUnifiedDiff(originalContent, patchText);
  if (!patchResult.success || !patchResult.updatedContent) {
    return buildCreatedFileDiff(filePath, originalContent);
  }

  const normOriginal = originalContent.replace(/\r\n/g, '\n');
  const cleanPatch = normalizeModelText(patchText).replace(/\r\n/g, '\n');
  const patchLines = cleanPatch.split('\n');

  const hunks: PatchHunk[] = [];
  let currentHunk: PatchHunk | null = null;

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }

    const hunkMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStartLine: parseInt(hunkMatch[1], 10),
        oldLines: [],
        newLines: [],
      };
      continue;
    }

    if (!currentHunk) {
      currentHunk = {
        oldStartLine: 1,
        oldLines: [],
        newLines: [],
      };
    }

    if (line.startsWith('-')) {
      currentHunk.oldLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      const addedContent = line.slice(1);
      const lastContextIdx = currentHunk.newLines.length - 1;
      if (
        lastContextIdx >= 0 &&
        currentHunk.oldLines.length === currentHunk.newLines.length &&
        currentHunk.oldLines[lastContextIdx] === currentHunk.newLines[lastContextIdx]
      ) {
        const targetCtx = currentHunk.newLines[lastContextIdx];
        if (targetCtx && (addedContent.trim().startsWith(targetCtx.trim().slice(0, 10)) || targetCtx.trim().startsWith(addedContent.trim().slice(0, 10)))) {
          currentHunk.newLines.pop();
        }
      }
      currentHunk.newLines.push(addedContent);
    } else if (line.startsWith(' ')) {
      const content = line.slice(1);
      currentHunk.oldLines.push(content);
      currentHunk.newLines.push(content);
    } else if (line.startsWith('\\')) {
      continue;
    } else {
      currentHunk.oldLines.push(line);
      currentHunk.newLines.push(line);
    }
  }

  if (currentHunk && (currentHunk.oldLines.length > 0 || currentHunk.newLines.length > 0)) {
    hunks.push(currentHunk);
  }

  const origLines = normOriginal.split('\n');
  const diffLines: DiffLine[] = [];

  for (const hunk of hunks) {
    const { oldStartLine, oldLines, newLines } = hunk;
    if (oldLines.length === 0 && newLines.length === 0) continue;

    let matchIdx = Math.max(0, oldStartLine - 1);
    const isMatchAt = (idx: number, exact = false) => {
      if (idx + oldLines.length > origLines.length) return false;
      for (let j = 0; j < oldLines.length; j++) {
        const fileLine = origLines[idx + j];
        const patchLine = oldLines[j];
        if (exact ? fileLine !== patchLine : fileLine.trim() !== patchLine.trim()) return false;
      }
      return true;
    };

    if (!isMatchAt(matchIdx, true) && !isMatchAt(matchIdx, false)) {
      let bestDist = Infinity;
      let found = -1;
      for (let i = 0; i <= origLines.length - oldLines.length; i++) {
        if (isMatchAt(i, true) || isMatchAt(i, false)) {
          const dist = Math.abs(i - matchIdx);
          if (dist < bestDist) {
            bestDist = dist;
            found = i;
          }
        }
      }
      if (found !== -1) matchIdx = found;
    }

    const ctxStart = Math.max(0, matchIdx - 3);
    for (let c = ctxStart; c < matchIdx; c++) {
      diffLines.push({ type: 'context', content: origLines[c], oldLine: c + 1, newLine: c + 1 });
    }

    let oldIdx = matchIdx;
    let newIdx = matchIdx;
    let o = 0;
    let n = 0;

    while (o < oldLines.length || n < newLines.length) {
      if (o < oldLines.length && n < newLines.length && oldLines[o] === newLines[n]) {
        diffLines.push({ type: 'context', content: oldLines[o], oldLine: oldIdx + 1, newLine: newIdx + 1 });
        oldIdx++;
        newIdx++;
        o++;
        n++;
      } else {
        const oldInNew = o < oldLines.length ? newLines.indexOf(oldLines[o], n) : -1;
        const newInOld = n < newLines.length ? oldLines.indexOf(newLines[n], o) : -1;

        if (oldInNew !== -1 && (newInOld === -1 || oldInNew - n <= newInOld - o)) {
          while (n < oldInNew) {
            diffLines.push({ type: 'add', content: newLines[n], newLine: newIdx + 1 });
            newIdx++;
            n++;
          }
        } else if (newInOld !== -1) {
          while (o < newInOld) {
            diffLines.push({ type: 'remove', content: oldLines[o], oldLine: oldIdx + 1 });
            oldIdx++;
            o++;
          }
        } else {
          if (o < oldLines.length) {
            diffLines.push({ type: 'remove', content: oldLines[o], oldLine: oldIdx + 1 });
            oldIdx++;
            o++;
          }
          if (n < newLines.length) {
            diffLines.push({ type: 'add', content: newLines[n], newLine: newIdx + 1 });
            newIdx++;
            n++;
          }
        }
      }
    }

    const afterEnd = Math.min(origLines.length, matchIdx + oldLines.length + 3);
    for (let c = matchIdx + oldLines.length; c < afterEnd; c++) {
      diffLines.push({ type: 'context', content: origLines[c], oldLine: c + 1, newLine: c + 1 });
    }
  }

  return {
    path: filePath,
    oldPath: filePath,
    newPath: filePath,
    ...limitDiffLines(diffLines),
  };
}



