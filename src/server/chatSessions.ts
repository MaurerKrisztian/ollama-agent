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

interface PersistedChatSessions {
  activeSessionId: string;
  sessions: ChatSession[];
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

export class ChatSessionStore {
  private activeSessionId: string;
  private sessions: ChatSession[];

  constructor(private readonly filePath: string) {
    const loaded = this.load();
    this.sessions = loaded.sessions;
    this.activeSessionId = loaded.activeSessionId;
    this.persist();
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
    if (makeActive) this.activeSessionId = session.id;
    this.persist();
    return session;
  }

  public activate(id: string): ChatSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    this.activeSessionId = id;
    this.persist();
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
    this.persist();
    return session;
  }

  public rename(id: string, title: string): ChatSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    session.title = cleanTitle(title);
    session.updatedAt = Date.now();
    this.persist();
    return session;
  }

  public delete(id: string): ChatSession | undefined {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index === -1) return undefined;
    this.sessions.splice(index, 1);
    if (this.sessions.length === 0) {
      return this.create();
    }
    if (this.activeSessionId === id) {
      this.activeSessionId = [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }
    this.persist();
    return this.getActive();
  }

  private get(id: string): ChatSession | undefined {
    return this.sessions.find((session) => session.id === id);
  }

  private load(): PersistedChatSessions {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<PersistedChatSessions>;
      const sessions = Array.isArray(parsed.sessions)
        ? parsed.sessions.filter((session): session is ChatSession => Boolean(
            session && typeof session.id === 'string' && typeof session.title === 'string' &&
            typeof session.createdAt === 'number' && typeof session.updatedAt === 'number' &&
            Array.isArray(session.messages)
          ))
        : [];
      if (sessions.length > 0) {
        const activeSessionId = sessions.some((session) => session.id === parsed.activeSessionId)
          ? parsed.activeSessionId!
          : sessions[0].id;
        return { sessions, activeSessionId };
      }
    } catch (_) {}

    const now = Date.now();
    const session: ChatSession = {
      id: newId(),
      title: defaultTitle,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    return { activeSessionId: session.id, sessions: [session] };
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      activeSessionId: this.activeSessionId,
      sessions: this.sessions,
    }, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}
