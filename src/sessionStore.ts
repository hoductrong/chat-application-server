import { Session } from './types';

export class MemorySessionStore {
  sessions: Map<string, Session> = new Map();
  constructor() {}

  public findSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  public saveSession(sessionId: string, session: Session) {
    this.sessions.set(sessionId, session);
  }

  public deleteSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  public findAllSessions() {
    return Array.from(this.sessions.values());
  }
}

export const sessionStore = new MemorySessionStore();
