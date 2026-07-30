import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { ToolDefinition } from './types.js';

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
    description: 'Read contents of a text file within the working directory (returns line-numbered text).',
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
    description: 'Partially edit a text or code file within the working directory by replacing target_text with replacement_text (supports code rewrites and line deletions).',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file from current working directory.',
        },
        target_text: {
          type: 'string',
          description: 'The exact existing text or code snippet to search for and replace.',
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
];

export class ToolExecutor {
  private workingDir: string;

  constructor(initialWorkingDir: string = process.cwd()) {
    this.workingDir = path.resolve(initialWorkingDir);
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

    // 1. Single line match with whitespace trimming
    for (const line of lines) {
      if (line.trim() === trimmedTarget) return line;
    }

    // 2. Substring statement matching fallback (e.g. return statement or function signature)
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
          // Format with explicit line numbers for small LLM precision
          const numberedLines = rawContent
            .split('\n')
            .map((line, idx) => `${idx + 1}: ${line}`)
            .join('\n');

          return {
            file_path: actualRelativePath,
            content: numberedLines,
            raw_content: rawContent,
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
          const matchToReplace = this.findMatchingTargetCode(content, target_text);

          if (!matchToReplace) {
            return {
              error: `Target text snippet "${target_text}" was not found in file "${actualRelativePath}". Please run read_file to inspect exact lines.`,
              file_path: actualRelativePath,
            };
          }

          const updatedContent = content.replace(matchToReplace, replacement_text);
          await fs.writeFile(filePath, updatedContent, 'utf-8');

          return {
            success: true,
            file_path: actualRelativePath,
            message: `Successfully updated ${actualRelativePath}.`,
            size_bytes: updatedContent.length,
          };
        } catch (err: any) {
          return { error: `Failed to edit file: ${err.message}` };
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
