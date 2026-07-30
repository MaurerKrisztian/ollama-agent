import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { ToolDefinition } from './types.js';
import { WebClient } from './web.js';

type DiffLine = {
  type: 'context' | 'add' | 'remove' | 'meta';
  content: string;
  oldLine?: number;
  newLine?: number;
};

type FileDiff = {
  path: string;
  oldPath: string;
  newPath: string;
  lines: DiffLine[];
  truncated?: boolean;
};

const MAX_DIFF_LINES = 400;

function limitDiffLines(lines: DiffLine[]): Pick<FileDiff, 'lines' | 'truncated'> {
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

function buildCreatedFileDiff(filePath: string, content: string): FileDiff {
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

function buildEditedFileDiff(filePath: string, original: string, match: string, replacement: string): FileDiff {
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

function stripCopiedLineNumbers(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const numberedLine = line.match(/^\s*\d+:\s?(.*)$/);
      return numberedLine ? numberedLine[1] : line;
    })
    .join('\n');
}

function preserveFirstLineIndent(match: string, replacement: string): string {
  const firstMatchLine = match.split('\n')[0] ?? '';
  const indentation = firstMatchLine.match(/^\s*/)?.[0] ?? '';
  if (!indentation || !replacement || /^\s/.test(replacement)) return replacement;
  return indentation + replacement;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_directory',
    description: 'List contents of a directory in the active working directory.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Subdirectory path relative to current working directory. Leave empty or use "." for root of working directory.',
        },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read the raw contents of a text file within the working directory.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file from current working directory.',
        },
      },
      required: ['relative_path'],
    },
  },
  {
    name: 'edit_file',
    description: 'Partially edit a text or code file by literal text replacement. target_text must be exact text that exists in the latest read_file output, without display line numbers or regex patterns. Use separate edit_file calls for non-contiguous changes.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file from current working directory.',
        },
        target_text: {
          type: 'string',
          description: 'Exact literal text currently present in the file. This is not a regex: do not use patterns such as [0-9]+, .*, ^, or $.',
        },
        replacement_text: {
          type: 'string',
          description: 'The new text content to substitute in place of target_text. Use empty string "" to delete target_text.',
        },
      },
      required: ['relative_path', 'target_text', 'replacement_text'],
    },
  },
  {
    name: 'replace_file',
    description: 'Replace the complete contents of an existing text file. Read the file first. Prefer this over edit_file for broad rewrites, restyling, or many non-contiguous changes.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to an existing file from the current working directory.',
        },
        content: {
          type: 'string',
          description: 'The complete new contents of the file.',
        },
      },
      required: ['relative_path', 'content'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new text or code file in the working directory.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file to create.',
        },
        content: {
          type: 'string',
          description: 'Initial text/code content for the new file.',
        },
      },
      required: ['relative_path', 'content'],
    },
  },
  {
    name: 'grep_search',
    description: 'Search for a text or symbol query across files in the working directory.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text or pattern string to search for.',
        },
        relative_path: {
          type: 'string',
          description: 'Subdirectory path to restrict search (leave empty for entire workspace).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_working_directory',
    description: 'Get the current active working directory path.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_working_directory',
    description: 'Set a new working directory path.',
    parameters: {
      type: 'object',
      properties: {
        absolute_path: {
          type: 'string',
          description: 'Absolute system directory path to set as active working directory.',
        },
      },
      required: ['absolute_path'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a bash shell command in the working directory.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash shell command string to execute.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the public web. Returns a short list of result titles, URLs, and snippets. Use read_web_page on a result URL to inspect its contents.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Short web search query.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_web_page',
    description: 'Read one public HTTP/HTTPS page and return its main content as clean, bounded Markdown instead of raw HTML.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL copied from a web_search result.',
        },
      },
      required: ['url'],
    },
  },
];

export class ToolExecutor {
  private workingDir: string;
  private webClient: WebClient;

  constructor(initialWorkingDir: string = process.cwd(), webClient: WebClient = new WebClient()) {
    this.workingDir = path.resolve(initialWorkingDir);
    this.webClient = webClient;
  }

  public getWorkingDir(): string {
    return this.workingDir;
  }

  public setWorkingDir(newDir: string): { success: boolean; path: string; error?: string } {
    try {
      const resolved = path.resolve(newDir);
      this.workingDir = resolved;
      return { success: true, path: this.workingDir };
    } catch (err: any) {
      return { success: false, path: this.workingDir, error: err.message };
    }
  }

  public async previewFileDiff(name: string, args: Record<string, any>): Promise<FileDiff | undefined> {
    if (name === 'create_file' && args.relative_path && args.content !== undefined) {
      return buildCreatedFileDiff(args.relative_path, args.content);
    }

    if (
      name !== 'edit_file' &&
      name !== 'replace_file'
    ) {
      return undefined;
    }
    if (
      !args.relative_path ||
      (name === 'edit_file' && (args.target_text === undefined || args.replacement_text === undefined)) ||
      (name === 'replace_file' && args.content === undefined)
    ) {
      return undefined;
    }

    let filePath = path.resolve(this.workingDir, args.relative_path);
    let actualRelativePath = args.relative_path;

    try {
      await fs.stat(filePath);
    } catch (_) {
      const foundPath = await this.findFileRecursive(this.workingDir, path.basename(args.relative_path));
      if (!foundPath) return undefined;
      filePath = foundPath;
      actualRelativePath = path.relative(this.workingDir, foundPath);
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (name === 'replace_file') {
        if (content === args.content) return undefined;
        return buildEditedFileDiff(actualRelativePath, content, content, args.content);
      }
      const targetText = stripCopiedLineNumbers(args.target_text);
      const replacementText = stripCopiedLineNumbers(args.replacement_text);
      const match = this.findMatchingTargetCode(content, targetText);
      if (!match) return undefined;
      return buildEditedFileDiff(
        actualRelativePath,
        content,
        match,
        preserveFirstLineIndent(match, replacementText)
      );
    } catch (_) {
      return undefined;
    }
  }

  private async findFileRecursive(dir: string, targetName: string, depth: number = 0): Promise<string | null> {
    if (depth > 3) return null;
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isFile() && item.name.toLowerCase() === targetName.toLowerCase()) {
          return full;
        }
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          const res = await this.findFileRecursive(full, targetName, depth + 1);
          if (res) return res;
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Smart code target resolution logic: matches exact string first, then falls back to whitespace/statement matching
   */
  private findMatchingTargetCode(content: string, targetText: string): string | null {
    if (content.includes(targetText)) return targetText;

    const trimmedTarget = targetText.trim();
    if (!trimmedTarget) return null;

    const lines = content.split('\n');
    const targetLines = trimmedTarget.split('\n');

    // 1. Multi-line block match that tolerates copied display line numbers and indentation drift.
    if (targetLines.length > 1) {
      const normalizedTargetLines = targetLines.map((line) => line.trim());
      for (let start = 0; start <= lines.length - targetLines.length; start++) {
        const candidateLines = lines.slice(start, start + targetLines.length);
        if (candidateLines.every((line, index) => line.trim() === normalizedTargetLines[index])) {
          return candidateLines.join('\n');
        }
      }
    }

    // 2. Single line match with whitespace trimming
    for (const line of lines) {
      if (line.trim() === trimmedTarget) return line;
    }

    // 3. Match text whose newlines/indentation were collapsed by a small model.
    // Build a normalized string while retaining offsets into the original file.
    const normalizedChars: string[] = [];
    const originalOffsets: number[] = [];
    let previousWasWhitespace = false;
    for (let index = 0; index < content.length; index++) {
      const char = content[index];
      if (/\s/.test(char)) {
        if (!previousWasWhitespace) {
          normalizedChars.push(' ');
          originalOffsets.push(index);
          previousWasWhitespace = true;
        }
      } else {
        normalizedChars.push(char);
        originalOffsets.push(index);
        previousWasWhitespace = false;
      }
    }
    const normalizedContent = normalizedChars.join('');
    const normalizedTarget = trimmedTarget.replace(/\s+/g, ' ');
    const normalizedStart = normalizedContent.indexOf(normalizedTarget);
    if (normalizedStart !== -1) {
      const normalizedEnd = normalizedStart + normalizedTarget.length - 1;
      const originalStart = originalOffsets[normalizedStart];
      const originalEnd = originalOffsets[normalizedEnd] + 1;
      return content.slice(originalStart, originalEnd);
    }

    // 4. Substring statement matching fallback (e.g. return statement or function signature)
    if (trimmedTarget.includes('return ') || trimmedTarget.includes('function ') || trimmedTarget.includes('export ')) {
      for (const line of lines) {
        if (
          (trimmedTarget.includes('return') && line.includes('return')) ||
          (trimmedTarget.includes('function') && line.includes('function')) ||
          (trimmedTarget.includes('computeHash') && line.includes('computeHash'))
        ) {
          return line;
        }
      }
    }

    return null;
  }

  private async grepDirectory(
    dir: string,
    query: string,
    results: Array<{ file: string; line: number; content: string }>,
    depth: number = 0
  ): Promise<void> {
    if (depth > 4) return;
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isFile() && !item.name.startsWith('.')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            lines.forEach((lineText, idx) => {
              if (lineText.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  file: path.relative(this.workingDir, fullPath),
                  line: idx + 1,
                  content: lineText.trim(),
                });
              }
            });
          } catch (_) {}
        } else if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          await this.grepDirectory(fullPath, query, results, depth + 1);
        }
      }
    } catch (_) {}
  }

  public async executeTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'list_directory': {
        const subPath = args.relative_path || '.';
        const targetDir = path.resolve(this.workingDir, subPath);
        
        try {
          const stats = await fs.stat(targetDir);
          if (!stats.isDirectory()) {
            return { error: `Path "${subPath}" is not a directory.` };
          }
          const items = await fs.readdir(targetDir, { withFileTypes: true });
          const entries = await Promise.all(
            items.map(async (item) => {
              const itemPath = path.join(targetDir, item.name);
              let size = 0;
              try {
                if (item.isFile()) {
                  const s = await fs.stat(itemPath);
                  size = s.size;
                }
              } catch (_) {}

              return {
                name: item.name,
                type: item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'other',
                size: item.isFile() ? `${size} bytes` : undefined,
              };
            })
          );
          return { working_directory: this.workingDir, relative_path: subPath, entries };
        } catch (err: any) {
          return { error: `Failed to list directory: ${err.message}` };
        }
      }

      case 'read_file': {
        if (!args.relative_path) {
          return { error: 'Parameter relative_path is required.' };
        }
        let filePath = path.resolve(this.workingDir, args.relative_path);
        let actualRelativePath = args.relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const baseName = path.basename(args.relative_path);
          const foundPath = await this.findFileRecursive(this.workingDir, baseName);
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          if (stats.size > 500 * 1024) {
            return { error: `File "${actualRelativePath}" exceeds 500KB limit.` };
          }
          const rawContent = await fs.readFile(filePath, 'utf-8');

          return {
            file_path: actualRelativePath,
            content: rawContent,
            line_count: rawContent.split('\n').length,
            size_bytes: stats.size,
          };
        } catch (err: any) {
          return { error: `Failed to read file: ${err.message}` };
        }
      }

      case 'edit_file': {
        const { relative_path, target_text, replacement_text } = args;
        if (!relative_path || target_text === undefined || replacement_text === undefined) {
          return { error: 'Parameters relative_path, target_text, and replacement_text are required.' };
        }
        let filePath = path.resolve(this.workingDir, relative_path);
        let actualRelativePath = relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const baseName = path.basename(relative_path);
          const foundPath = await this.findFileRecursive(this.workingDir, baseName);
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          const content = await fs.readFile(filePath, 'utf-8');
          const cleanTargetText = stripCopiedLineNumbers(target_text);
          const cleanReplacementText = stripCopiedLineNumbers(replacement_text);
          const matchToReplace = this.findMatchingTargetCode(content, cleanTargetText);

          if (!matchToReplace) {
            return {
              error: `Literal target_text "${target_text}" was not found in file "${actualRelativePath}". No changes were made. target_text does not support regex. Copy exact text from the latest read_file result (without line-number prefixes), and use separate edit_file calls for non-contiguous changes.`,
              file_path: actualRelativePath,
              changed: false,
            };
          }

          const replacementToWrite = preserveFirstLineIndent(matchToReplace, cleanReplacementText);
          const updatedContent = content.replace(matchToReplace, replacementToWrite);
          if (updatedContent === content) {
            return {
              error: `The edit matched "${actualRelativePath}" but produced no change. Use different replacement_text, or use replace_file for a broad rewrite.`,
              file_path: actualRelativePath,
              changed: false,
            };
          }
          await fs.writeFile(filePath, updatedContent, 'utf-8');

          return {
            success: true,
            file_path: actualRelativePath,
            message: `Successfully updated ${actualRelativePath}.`,
            size_bytes: updatedContent.length,
            diff: buildEditedFileDiff(actualRelativePath, content, matchToReplace, replacementToWrite),
          };
        } catch (err: any) {
          return { error: `Failed to edit file: ${err.message}` };
        }
      }

      case 'replace_file': {
        const { relative_path, content: replacementContent } = args;
        if (!relative_path || replacementContent === undefined) {
          return { error: 'Parameters relative_path and content are required.' };
        }
        let filePath = path.resolve(this.workingDir, relative_path);
        let actualRelativePath = relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const foundPath = await this.findFileRecursive(this.workingDir, path.basename(relative_path));
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          const originalContent = await fs.readFile(filePath, 'utf-8');
          if (originalContent === replacementContent) {
            return {
              error: `replace_file produced no change in "${actualRelativePath}".`,
              file_path: actualRelativePath,
              changed: false,
            };
          }
          await fs.writeFile(filePath, replacementContent, 'utf-8');
          return {
            success: true,
            file_path: actualRelativePath,
            message: `Successfully replaced ${actualRelativePath}.`,
            size_bytes: Buffer.byteLength(replacementContent, 'utf-8'),
            diff: buildEditedFileDiff(actualRelativePath, originalContent, originalContent, replacementContent),
          };
        } catch (err: any) {
          return { error: `Failed to replace file: ${err.message}` };
        }
      }

      case 'create_file': {
        const { relative_path, content } = args;
        if (!relative_path || content === undefined) {
          return { error: 'Parameters relative_path and content are required.' };
        }
        const filePath = path.resolve(this.workingDir, relative_path);
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, 'utf-8');
          return {
            success: true,
            file_path: relative_path,
            message: `Successfully created file ${relative_path}.`,
            size_bytes: Buffer.byteLength(content, 'utf-8'),
            diff: buildCreatedFileDiff(relative_path, content),
          };
        } catch (err: any) {
          return { error: `Failed to create file: ${err.message}` };
        }
      }

      case 'grep_search': {
        const { query, relative_path } = args;
        if (!query) return { error: 'Parameter query is required.' };
        const searchDir = relative_path ? path.resolve(this.workingDir, relative_path) : this.workingDir;
        
        try {
          const results: Array<{ file: string; line: number; content: string }> = [];
          await this.grepDirectory(searchDir, query, results);
          return {
            query,
            total_matches: results.length,
            matches: results.slice(0, 50),
          };
        } catch (err: any) {
          return { error: `Search failed: ${err.message}` };
        }
      }

      case 'get_working_directory': {
        return { working_directory: this.workingDir };
      }

      case 'set_working_directory': {
        const targetPath = args.absolute_path;
        if (!targetPath) return { error: 'absolute_path argument is required.' };
        try {
          const stats = await fs.stat(targetPath);
          if (!stats.isDirectory()) {
            return { error: `Path "${targetPath}" is not a directory.` };
          }
          this.workingDir = path.resolve(targetPath);
          return { success: true, working_directory: this.workingDir };
        } catch (err: any) {
          return { error: `Directory change failed: ${err.message}` };
        }
      }

      case 'execute_command': {
        const cmdStr = args.command;
        if (!cmdStr) return { error: 'Parameter command is required.' };
        return await this.executeCommand(cmdStr);
      }

      case 'web_search': {
        if (!args.query) return { error: 'Parameter query is required.' };
        try {
          const results = await this.webClient.search(args.query);
          return { query: args.query, result_count: results.length, results };
        } catch (err: any) {
          return { error: `Web search failed: ${err.message}` };
        }
      }

      case 'read_web_page': {
        if (!args.url) return { error: 'Parameter url is required.' };
        try {
          return await this.webClient.readPage(args.url);
        } catch (err: any) {
          return { error: `Web page read failed: ${err.message}`, url: args.url };
        }
      }

      default:
        return { error: `Unknown tool "${name}".` };
    }
  }

  public async executeCommand(command: string): Promise<{ command: string; stdout: string; stderr: string; exitCode: number; error?: string }> {
    return new Promise((resolve) => {
      exec(command, { cwd: this.workingDir, timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            command,
            stdout: stdout ? stdout.trim() : '',
            stderr: stderr ? stderr.trim() : '',
            exitCode: err.code ?? 1,
            error: err.message,
          });
        } else {
          resolve({
            command,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: 0,
          });
        }
      });
    });
  }
}
