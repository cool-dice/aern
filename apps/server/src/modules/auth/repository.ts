import type { AccountRecord, SessionRecord } from './types';

export interface AuthRepository {
  findAccountByEmail(email: string): Promise<AccountRecord | null>;
  findAccountById(id: string): Promise<AccountRecord | null>;
  insertAccount(account: AccountRecord): Promise<void>;
  updateAccount(account: AccountRecord): Promise<void>;
  saveSession(session: SessionRecord): Promise<void>;
  /**
   * Live session for the account.
   * Returns null when missing or when `expiresAtMs <= nowMs` (Clock-checked TTL).
   */
  getSession(accountId: string, nowMs: number): Promise<SessionRecord | null>;
}

export interface AuthMemoryDump {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
}

function copyAccount(account: AccountRecord): AccountRecord {
  return { ...account };
}

function copySession(session: SessionRecord): SessionRecord {
  return { ...session };
}

export class MemoryAuthRepository implements AuthRepository {
  private readonly accountsById = new Map<string, AccountRecord>();
  private readonly accountIdsByEmail = new Map<string, string>();
  private readonly sessionsByAccountId = new Map<string, SessionRecord>();

  async findAccountByEmail(email: string): Promise<AccountRecord | null> {
    const id = this.accountIdsByEmail.get(email);
    if (id === undefined) {
      return null;
    }
    return this.findAccountById(id);
  }

  async findAccountById(id: string): Promise<AccountRecord | null> {
    const account = this.accountsById.get(id);
    return account === undefined ? null : copyAccount(account);
  }

  async insertAccount(account: AccountRecord): Promise<void> {
    if (this.accountsById.has(account.id) || this.accountIdsByEmail.has(account.email)) {
      throw new Error('account already exists');
    }
    this.accountsById.set(account.id, copyAccount(account));
    this.accountIdsByEmail.set(account.email, account.id);
  }

  async updateAccount(account: AccountRecord): Promise<void> {
    const existing = this.accountsById.get(account.id);
    if (existing === undefined) {
      throw new Error(`account not found: ${account.id}`);
    }
    if (existing.email !== account.email) {
      this.accountIdsByEmail.delete(existing.email);
      this.accountIdsByEmail.set(account.email, account.id);
    }
    this.accountsById.set(account.id, copyAccount(account));
  }

  async saveSession(session: SessionRecord): Promise<void> {
    this.sessionsByAccountId.set(session.accountId, copySession(session));
  }

  async getSession(accountId: string, nowMs: number): Promise<SessionRecord | null> {
    const session = this.sessionsByAccountId.get(accountId);
    if (session === undefined) {
      return null;
    }
    if (session.expiresAtMs <= nowMs) {
      this.sessionsByAccountId.delete(accountId);
      return null;
    }
    return copySession(session);
  }

  /** Raw in-memory rows, including expired sessions not yet read. */
  dump(): AuthMemoryDump {
    return {
      accounts: [...this.accountsById.values()].map(copyAccount),
      sessions: [...this.sessionsByAccountId.values()].map(copySession),
    };
  }
}
