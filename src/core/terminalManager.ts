import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';

export function stripAnsiCodes(text: string): string {
  if (!text) return '';
  // 1. Strip standard ESC / CSI ANSI control sequences (colors, cursor positioning, erase in line)
  let cleaned = text.replace(/[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  // 2. Strip orphaned control fragments (e.g. [36m, [39m, [1G, [0K) left when ESC byte is stripped
  cleaned = cleaned.replace(/\[[0-9]{1,4}[a-zA-Z]/g, '');
  // 3. Normalize carriage returns
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '');
  return cleaned;
}

export interface TerminalInputHistoryItem {
  input: string;
  timestamp: string;
}

export interface TerminalSessionInfo {
  sessionId: string;
  command: string;
  pid: number | undefined;
  status: 'running' | 'exited';
  exitCode: number | null;
  startedAt: string;
  workingDir: string;
  lineCount: number;
  inputs: TerminalInputHistoryItem[];
}

export interface TerminalSessionOutput {
  sessionId: string;
  command: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  lines: string[];
  lineCount: number;
  inputs: TerminalInputHistoryItem[];
}

interface TerminalSessionInternal {
  sessionId: string;
  command: string;
  process: ChildProcess;
  pid: number | undefined;
  status: 'running' | 'exited';
  exitCode: number | null;
  startedAt: string;
  workingDir: string;
  buffer: string[];
  maxLines: number;
  inputs: TerminalInputHistoryItem[];
}

export class TerminalSessionManager {
  private sessions = new Map<string, TerminalSessionInternal>();
  private sessionCounter = 0;
  private defaultWorkingDir: string;

  constructor(defaultWorkingDir: string = process.cwd()) {
    this.defaultWorkingDir = path.resolve(defaultWorkingDir);
  }

  public setDefaultWorkingDir(dir: string): void {
    this.defaultWorkingDir = path.resolve(dir);
  }

  public startSession(command: string, customSessionId?: string, cwd?: string): { success: boolean; session?: TerminalSessionInfo; error?: string } {
    if (!command || typeof command !== 'string' || !command.trim()) {
      return { success: false, error: 'Command string is required.' };
    }

    let sessionId = customSessionId ? customSessionId.trim() : '';
    if (!sessionId) {
      this.sessionCounter += 1;
      sessionId = `term_${this.sessionCounter}`;
    }

    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      if (existing.status === 'running') {
        return { success: false, error: `Terminal session "${sessionId}" is already running.` };
      }
    }

    const workingDir = path.resolve(cwd || this.defaultWorkingDir);
    const isWin = process.platform === 'win32';
    const isLinux = process.platform === 'linux';
    const trimmedCmd = command.trim();
    const INTERACTIVE_SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'powershell', 'pwsh', 'cmd', 'cmd.exe', '']);
    const isInteractiveShell = INTERACTIVE_SHELLS.has(trimmedCmd.toLowerCase());

    let shell: string;
    let shellArgs: string[];

    if (isWin) {
      shell = 'cmd.exe';
      shellArgs = isInteractiveShell ? ['/k'] : ['/d', '/s', '/c', command];
    } else if (isLinux) {
      shell = '/usr/bin/script';
      const cmdToRun = isInteractiveShell ? '/bin/bash -i' : command;
      shellArgs = ['-q', '-c', cmdToRun, '/dev/null'];
    } else {
      shell = '/bin/bash';
      shellArgs = isInteractiveShell ? ['-i'] : ['-c', command];
    }

    try {
      const child = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        },
        detached: false,
      });

      const startedAt = new Date().toISOString();
      const session: TerminalSessionInternal = {
        sessionId,
        command,
        process: child,
        pid: child.pid,
        status: 'running',
        exitCode: null,
        startedAt,
        workingDir,
        buffer: [],
        maxLines: 200,
        inputs: [{ input: command, timestamp: startedAt }],
      };

      const appendToBuffer = (data: Buffer | string) => {
        const text = data.toString('utf-8');
        const cleaned = stripAnsiCodes(text);
        const lines = cleaned.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (i === 0 && session.buffer.length > 0) {
            session.buffer[session.buffer.length - 1] += line;
          } else {
            session.buffer.push(line);
          }
        }
        if (session.buffer.length > session.maxLines) {
          session.buffer = session.buffer.slice(-session.maxLines);
        }
      };

      if (child.stdout) {
        child.stdout.on('data', appendToBuffer);
      }
      if (child.stderr) {
        child.stderr.on('data', appendToBuffer);
      }

      child.on('exit', (code) => {
        session.status = 'exited';
        session.exitCode = code;
        appendToBuffer(`\n[Process exited with code ${code ?? 0}]\n`);
      });

      child.on('error', (err) => {
        appendToBuffer(`\n[Process Error: ${err.message}]\n`);
        session.status = 'exited';
        session.exitCode = 1;
      });

      this.sessions.set(sessionId, session);

      return {
        success: true,
        session: {
          sessionId,
          command,
          pid: child.pid,
          status: 'running',
          exitCode: null,
          startedAt: session.startedAt,
          workingDir,
          lineCount: 0,
          inputs: session.inputs,
        },
      };
    } catch (err: any) {
      return { success: false, error: `Failed to spawn process: ${err.message}` };
    }
  }

  public sendInput(sessionId: string, input: string): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Terminal session "${sessionId}" not found.` };
    }
    if (session.status !== 'running') {
      return { success: false, error: `Terminal session "${sessionId}" has already exited.` };
    }

    try {
      session.inputs.push({ input, timestamp: new Date().toISOString() });

      if (input === 'CTRL+C' || input === '\x03') {
        if (process.platform === 'win32') {
          // On Windows SIGINT doesn't work via kill(); write Ctrl+C byte to stdin instead
          session.process.stdin?.write('\x03');
        } else {
          session.process.kill('SIGINT');
        }
        return { success: true };
      }

      // 1. Unescape literal string representations of newlines/returns sent by LLMs
      let formattedInput = input
        .replace(/\\r\\n/g, '\r\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');

      // 2. Ensure newlines trigger ENTER (\r\n) in interactive TTY/PTY readline sessions
      formattedInput = formattedInput.replace(/\r?\n|\r/g, '\r\n');

      // 3. If input is non-empty and doesn't end with \r\n, append \r\n to submit
      if (formattedInput && !formattedInput.endsWith('\r\n')) {
        formattedInput += '\r\n';
      }

      session.process.stdin?.write(formattedInput);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to write to stdin: ${err.message}` };
    }
  }

  public readOutput(sessionId: string, tailLines: number = 50): { success: boolean; output?: TerminalSessionOutput; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Terminal session "${sessionId}" not found.` };
    }

    const limit = Math.max(1, Math.min(200, tailLines));
    const lines = session.buffer.slice(-limit);

    return {
      success: true,
      output: {
        sessionId: session.sessionId,
        command: session.command,
        status: session.status,
        exitCode: session.exitCode,
        lines,
        lineCount: session.buffer.length,
        inputs: session.inputs,
      },
    };
  }

  public listSessions(): TerminalSessionInfo[] {
    const result: TerminalSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      result.push({
        sessionId: session.sessionId,
        command: session.command,
        pid: session.pid,
        status: session.status,
        exitCode: session.exitCode,
        startedAt: session.startedAt,
        workingDir: session.workingDir,
        lineCount: session.buffer.length,
        inputs: session.inputs,
      });
    }
    return result;
  }

  public terminateSession(sessionId: string): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Terminal session "${sessionId}" not found.` };
    }

    if (session.status === 'exited') {
      return { success: true };
    }

    try {
      if (process.platform === 'win32') {
        // SIGTERM/SIGKILL don't work on Windows; use taskkill to force-kill the process tree
        if (session.pid) {
          try { execSync(`taskkill /F /T /PID ${session.pid}`, { stdio: 'ignore' }); } catch (_) {}
        }
        session.status = 'exited';
        session.exitCode = 1;
      } else {
        session.process.kill('SIGTERM');
        setTimeout(() => {
          if (session.status === 'running') {
            session.process.kill('SIGKILL');
          }
        }, 1000);
        session.status = 'exited';
        session.exitCode = 137;
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to kill process: ${err.message}` };
    }
  }

  public clearAllSessions(): { success: boolean; count: number } {
    let count = 0;
    for (const [, session] of this.sessions.entries()) {
      if (session.status === 'running') {
        try {
          session.process.kill('SIGKILL');
        } catch (_) {}
      }
      count++;
    }
    this.sessions.clear();
    this.sessionCounter = 0;
    return { success: true, count };
  }
}
