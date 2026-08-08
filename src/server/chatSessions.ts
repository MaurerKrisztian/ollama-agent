import fs from 'node:fs';
import path from 'node:path';
import type { ChatMessage } from '../core/types.js';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export type ChatSessionSummary = Omit<ChatSession, 'messages'> & { messageCount: number };

interface PersistedIndex {
  activeSessionId: string;
}

interface LegacyPersistedChatSessions {
  activeSessionId?: string;
  sessions?: ChatSession[];
}

const defaultTitle = 'New chat';

function newId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') return defaultTitle;
  const title = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return title || defaultTitle;
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  return cleanTitle(firstUserMessage?.displayContent || firstUserMessage?.content);
}

function atomicWriteJson(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const temporaryPath = `${filePath}.tmp_${Math.random().toString(36).slice(2, 7)}`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

export class ChatSessionStore {
  private readonly storageDir: string;
  private readonly legacyFilePath?: string;
  private activeSessionId: string = '';
  private sessions: ChatSession[] = [];

  constructor(targetPath: string, legacyFilePath?: string) {
    if (targetPath.endsWith('.json') && !this.isDirectory(targetPath)) {
      this.storageDir = targetPath.slice(0, -5);
      this.legacyFilePath = legacyFilePath || targetPath;
    } else {
      this.storageDir = targetPath;
      this.legacyFilePath = legacyFilePath;
    }

    const loaded = this.load();
    this.sessions = loaded.sessions;
    this.activeSessionId = loaded.activeSessionId;
  }

  private isDirectory(p: string): boolean {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch (_) {
      return false;
    }
  }

  public list(): ChatSessionSummary[] {
    return [...this.sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ messages, ...session }) => ({ ...session, messageCount: messages.length }));
  }

  public getActive(): ChatSession {
    return this.get(this.activeSessionId)!;
  }

  public getActiveId(): string {
    return this.activeSessionId;
  }

  public create(title?: string, makeActive: boolean = true): ChatSession {
    const now = Date.now();
    const session: ChatSession = {
      id: newId(),
      title: cleanTitle(title),
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.sessions.push(session);
    this.persistSessionFile(session);

    if (makeActive) {
      this.activeSessionId = session.id;
      this.persistIndex();
    }
    return session;
  }

  public activate(id: string): ChatSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    this.activeSessionId = id;
    this.persistIndex();
    return session;
  }

  public getSession(id: string): ChatSession | undefined {
    return this.get(id);
  }

  public saveActive(messages: ChatMessage[]): ChatSession {
    return this.save(this.activeSessionId, messages)!;
  }

  public save(id: string, messages: ChatMessage[]): ChatSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    session.messages = messages;
    session.updatedAt = Date.now();
    if (session.title === defaultTitle && messages.some((message) => message.role === 'user')) {
      session.title = titleFromMessages(messages);
    }
    this.persistSessionFile(session);
    return session;
  }

  public rename(id: string, title: string): ChatSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    session.title = cleanTitle(title);
    session.updatedAt = Date.now();
    this.persistSessionFile(session);
    return session;
  }

  public delete(id: string): ChatSession | undefined {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index === -1) return undefined;

    const [deleted] = this.sessions.splice(index, 1);
    this.deleteSessionFile(deleted.id);

    if (this.sessions.length === 0) {
      return this.create();
    }

    if (this.activeSessionId === id) {
      this.activeSessionId = [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
      this.persistIndex();
    }
    return this.getActive();
  }

  private get(id: string): ChatSession | undefined {
    return this.sessions.find((session) => session.id === id);
  }

  private load(): { sessions: ChatSession[]; activeSessionId: string } {
    fs.mkdirSync(this.storageDir, { recursive: true });

    // Migrate from legacy single-file store if present
    this.migrateLegacyIfNeeded();

    let activeSessionId = '';
    const indexPath = path.join(this.storageDir, 'index.json');
    try {
      if (fs.existsSync(indexPath)) {
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as PersistedIndex;
        if (typeof indexData.activeSessionId === 'string') {
          activeSessionId = indexData.activeSessionId;
        }
      }
    } catch (_) {}

    const sessions: ChatSession[] = [];
    try {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'index.json') continue;
        const filePath = path.join(this.storageDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const session = JSON.parse(raw) as ChatSession;
          if (
            session &&
            typeof session.id === 'string' &&
            typeof session.title === 'string' &&
            typeof session.createdAt === 'number' &&
            typeof session.updatedAt === 'number' &&
            Array.isArray(session.messages)
          ) {
            sessions.push(session);
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (sessions.length > 0) {
      const validActiveId = sessions.some((s) => s.id === activeSessionId)
        ? activeSessionId
        : sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
      this.activeSessionId = validActiveId;
      this.persistIndex();
      return { sessions, activeSessionId: validActiveId };
    }

    // Default session creation if folder is empty
    const now = Date.now();
    const defaultSession: ChatSession = {
      id: newId(),
      title: defaultTitle,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.persistSessionFile(defaultSession);
    this.activeSessionId = defaultSession.id;
    this.persistIndex();
    return { sessions: [defaultSession], activeSessionId: defaultSession.id };
  }

  private migrateLegacyIfNeeded(): void {
    if (!this.legacyFilePath || !fs.existsSync(this.legacyFilePath) || this.isDirectory(this.legacyFilePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(this.legacyFilePath, 'utf8');
      const parsed = JSON.parse(raw) as LegacyPersistedChatSessions;
      if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        for (const session of parsed.sessions) {
          if (session && typeof session.id === 'string' && Array.isArray(session.messages)) {
            this.persistSessionFile(session);
          }
        }
        if (parsed.activeSessionId) {
          atomicWriteJson(path.join(this.storageDir, 'index.json'), { activeSessionId: parsed.activeSessionId });
        }
      }
      // Backup migrated file
      fs.renameSync(this.legacyFilePath, `${this.legacyFilePath}.migrated`);
    } catch (_) {}
  }

  private persistSessionFile(session: ChatSession): void {
    const filePath = path.join(this.storageDir, `${session.id}.json`);
    atomicWriteJson(filePath, session);
  }

  private deleteSessionFile(id: string): void {
    const filePath = path.join(this.storageDir, `${id}.json`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {}
  }

  private persistIndex(): void {
    const indexPath = path.join(this.storageDir, 'index.json');
    atomicWriteJson(indexPath, { activeSessionId: this.activeSessionId });
  }
}
