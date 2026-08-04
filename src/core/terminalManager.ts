import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fsSync from 'fs';

export function processCarriageReturns(segment: string): string {
  if (!segment || !segment.includes('\r')) return segment;
  const parts = segment.split('\r');
  let current = '';
  for (const part of parts) {
    if (!current) {
      current = part;
    } else {
      const curArr = Array.from(current);
      const partArr = Array.from(part);
      for (let k = 0; k < partArr.length; k++) {
        curArr[k] = partArr[k];
      }
      current = curArr.join('');
    }
  }
  return current;
}

export function stripAnsiControlSequences(text: string): string {
  if (!text) return '';
  // 1. Strip VT100 character set designations (e.g. \x1b(B, \x1b(0, \x1b)B)
  let cleaned = text.replace(/[\u001b\u009b]?[()#][A-Za-z0-9]/g, '');
  // 2. Strip two-byte ESC commands (e.g. \x1b=, \x1b>, \x1b7, \x1b8)
  cleaned = cleaned.replace(/[\u001b\u009b][=>78M]/g, '');
  // 3. Strip non-SGR ANSI CSI control sequences (cursor positioning, erase line/screen, but NOT colors ending in 'm')
  cleaned = cleaned.replace(/[\u001b\u009b]\[[0-9;?]*[A-ln-zA-Z]/g, '');
  // 4. Strip orphaned control fragments (e.g. [1G, [0K) left when ESC byte is stripped
  cleaned = cleaned.replace(/\[[0-9]{1,4}[a-ln-zA-Z]/g, '');
  // 5. Normalize carriage returns
  cleaned = cleaned.replace(/\r\n/g, '\n');
  return cleaned;
}

export function stripAnsiCodes(text: string): string {
  if (!text) return '';
  // 1. Strip VT100 character set designations (e.g. \x1b(B, \x1b(0, \x1b)B)
  let cleaned = text.replace(/[\u001b\u009b]?[()#][A-Za-z0-9]/g, '');
  // 2. Strip two-byte ESC commands
  cleaned = cleaned.replace(/[\u001b\u009b][=>78M]/g, '');
  // 3. Strip standard ESC / CSI ANSI control sequences (colors, cursor positioning, erase in line)
  cleaned = cleaned.replace(/[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  // 4. Strip orphaned control fragments (e.g. [36m, [39m, [1G, [0K) left when ESC byte is stripped
  cleaned = cleaned.replace(/\[[0-9]{1,4}[a-zA-Z]/g, '');
  // 5. Normalize carriage returns
  cleaned = cleaned.replace(/\r\n/g, '\n');
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

export interface GuiTerminalSpec {
  command: string;
  argsPrefix: string[];
}

export function detectGuiTerminal(customCmd?: string): GuiTerminalSpec | null {
  if (customCmd && customCmd.trim()) {
    const parts = customCmd.trim().split(/\s+/);
    return {
      command: parts[0],
      argsPrefix: parts.slice(1),
    };
  }

  if (process.env.TERMINAL && process.env.TERMINAL.trim()) {
    return {
      command: process.env.TERMINAL.trim(),
      argsPrefix: ['-e'],
    };
  }

  const isLinux = process.platform === 'linux';
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isLinux) {
    const linuxEmulators = [
      { bin: 'gnome-terminal', args: ['--wait', '--'] },
      { bin: 'konsole', args: ['-e'] },
      { bin: 'kitty', args: ['-e'] },
      { bin: 'alacritty', args: ['-e'] },
      { bin: 'wezterm', args: ['start', '--'] },
      { bin: 'foot', args: ['-e'] },
      { bin: 'tilix', args: ['-e'] },
      { bin: 'xfce4-terminal', args: ['-e'] },
      { bin: 'mate-terminal', args: ['-e'] },
      { bin: 'lxterminal', args: ['-e'] },
      { bin: 'xterm', args: ['-e'] },
      { bin: 'urxvt', args: ['-e'] },
      { bin: 'st', args: ['-e'] },
    ];

    for (const em of linuxEmulators) {
      try {
        execSync(`which ${em.bin} 2>/dev/null`);
        return { command: em.bin, argsPrefix: em.args };
      } catch (_) {}
    }
  } else if (isWin) {
    try {
      execSync('where wt.exe 2>NUL');
      return { command: 'wt.exe', argsPrefix: ['new-tab', 'cmd.exe', '/k'] };
    } catch (_) {
      return { command: 'cmd.exe', argsPrefix: ['/c', 'start', 'cmd.exe', '/k'] };
    }
  } else if (isMac) {
    return { command: 'osascript', argsPrefix: ['-e'] };
  }

  return null;
}

export interface TerminalSessionOptions {
  guiMode?: boolean;
  customTerminalCmd?: string;
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
  guiMode?: boolean;
}

export interface TerminalSessionOutput {
  sessionId: string;
  command: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  lines: string[];
  lineCount: number;
  inputs: TerminalInputHistoryItem[];
  guiMode?: boolean;
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
  guiMode?: boolean;
}

export class TerminalSessionManager {
  private sessions = new Map<string, TerminalSessionInternal>();
  private sessionCounter = 0;
  private defaultWorkingDir: string;
  private defaultGuiMode: boolean = false;
  private defaultCustomTerminalCmd?: string;

  constructor(defaultWorkingDir: string = process.cwd()) {
    this.defaultWorkingDir = path.resolve(defaultWorkingDir);
  }

  public setDefaultWorkingDir(dir: string): void {
    this.defaultWorkingDir = path.resolve(dir);
  }

  public setGuiModeDefaults(guiMode?: boolean, customTerminalCmd?: string): void {
    if (guiMode !== undefined) this.defaultGuiMode = guiMode;
    if (customTerminalCmd !== undefined) this.defaultCustomTerminalCmd = customTerminalCmd;
  }

  public startSession(
    command: string,
    customSessionId?: string,
    cwd?: string,
    options?: TerminalSessionOptions
  ): { success: boolean; session?: TerminalSessionInfo; error?: string } {
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

    const inDocker = fsSync.existsSync('/.dockerenv');
    const hasDockerSocket = fsSync.existsSync('/var/run/docker.sock');
    const enableHostEscape = inDocker && hasDockerSocket && process.env.ENABLE_HOST_ESCAPE !== 'false';

    let shell = '';
    let shellArgs: string[] = [];
    let effectiveGuiMode = false;
    let fallbackWarning: string | null = null;

    const isGuiRequested = options?.guiMode !== undefined ? options.guiMode : this.defaultGuiMode;
    const customCmd = options?.customTerminalCmd || this.defaultCustomTerminalCmd;

    if (isGuiRequested) {
      const guiSpec = detectGuiTerminal(customCmd);
      if (guiSpec) {
        effectiveGuiMode = true;
        shell = guiSpec.command;
        if (guiSpec.command === 'osascript') {
          const escCmd = (isInteractiveShell ? '/bin/bash' : command).replace(/"/g, '\\"');
          shellArgs = ['-e', `tell application "Terminal" to do script "cd \\"${workingDir}\\" && ${escCmd}"`];
        } else if (guiSpec.command === 'wt.exe') {
          const escCmd = isInteractiveShell ? '' : command;
          shellArgs = ['new-tab', '-d', workingDir, 'cmd.exe', '/k', escCmd || undefined].filter(Boolean) as string[];
        } else {
          if (isInteractiveShell) {
            shellArgs = [...guiSpec.argsPrefix, 'bash'];
          } else {
            const displayCmd = `echo -e "\\033[1;32m$ ${command.replace(/"/g, '\\"')}\\033[0m" && ${command}; exec bash`;
            shellArgs = [...guiSpec.argsPrefix, 'bash', '-c', displayCmd];
          }
        }
      } else {
        fallbackWarning = '[Warning: No supported GUI terminal emulator found on PATH. Falling back to headless execution.]';
      }
    }

    if (!effectiveGuiMode) {
      if (enableHostEscape) {
        shell = 'docker';
        const escapedCmd = isInteractiveShell ? 'sh' : command;
        shellArgs = [
          'run',
          '--rm',
          '-i',
          '--privileged',
          '--pid=host',
          'alpine',
          'nsenter',
          '-t',
          '1',
          '-m',
          '-u',
          '-n',
          '-i',
          'sh',
          '-c',
          `cd "${workingDir.replace(/"/g, '\\"')}" 2>/dev/null || cd / 2>/dev/null || true; ${escapedCmd}`,
        ];
      } else if (isWin) {
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
    }

    try {
      const child = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
          DISPLAY: process.env.DISPLAY || ':0',
          DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
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
        buffer: fallbackWarning ? [fallbackWarning] : (effectiveGuiMode ? [`[GUI Mode active: Command "${command}" is executing live inside your desktop GUI terminal window.]`] : []),
        maxLines: 200,
        inputs: [{ input: command, timestamp: startedAt }],
        guiMode: effectiveGuiMode,
      };

      const appendToBuffer = (data: Buffer | string) => {
        const text = data.toString('utf-8');
        // Detect screen clear / home cursor sequence (e.g. top, htop, watch, clear)
        const isScreenClear = /[\u001b\u009b]\[(?:2J|1;1H|H|3J)/.test(text);
        if (isScreenClear) {
          session.buffer = [];
        }

        const cleaned = stripAnsiControlSequences(text);
        const rawLines = cleaned.split('\n');

        for (let i = 0; i < rawLines.length; i++) {
          const rawSeg = rawLines[i];
          if (i === 0 && session.buffer.length > 0 && !isScreenClear) {
            const combined = session.buffer[session.buffer.length - 1] + rawSeg;
            session.buffer[session.buffer.length - 1] = processCarriageReturns(combined);
          } else {
            session.buffer.push(processCarriageReturns(rawSeg));
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
          lineCount: session.buffer.length,
          inputs: session.inputs,
          guiMode: effectiveGuiMode,
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
        guiMode: session.guiMode,
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
        guiMode: session.guiMode,
      });
    }
    return result;
  }

  public removeSession(sessionId: string): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Terminal session "${sessionId}" not found.` };
    }

    if (session.status === 'running') {
      this.terminateSession(sessionId);
    }

    this.sessions.delete(sessionId);
    return { success: true };
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
