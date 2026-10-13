import type { Project } from '../shared/types';

export type LiveEvent =
  | { type: 'hello'; clientId: string; agent: { active: boolean; since: string | null } }
  | { type: 'agent'; active: boolean; since: string | null }
  | { type: 'project'; project: Project }
  | { type: 'storyline'; text: string };

export let ACK_TIMEOUT_MS = 3000;
export let IDLE_RELEASE_MS = 10000;

/** Test hook. */
export function setLiveTimings(t: { ack: number; idle: number }): void {
  ACK_TIMEOUT_MS = t.ack;
  IDLE_RELEASE_MS = t.idle;
}

// ---- per-slug serialized writes ----

const queues = new Map<string, Promise<unknown>>();

/** Runs fn after every earlier fn for the same slug has settled. Different slugs run in parallel. */
export function withWriteLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(slug) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  queues.set(slug, tail);
  void tail.then(() => {
    if (queues.get(slug) === tail) queues.delete(slug);
  });
  return run;
}

// ---- event bus ----

interface Client {
  id: string;
  send(e: LiveEvent): void;
}

const clients = new Map<string, Set<Client>>();
let clientSeq = 0;

export function subscribe(slug: string, send: (e: LiveEvent) => void): { clientId: string; close(): void } {
  const c: Client = { id: `c${++clientSeq}-${Date.now().toString(36)}`, send };
  let set = clients.get(slug);
  if (!set) clients.set(slug, (set = new Set()));
  set.add(c);
  return {
    clientId: c.id,
    close() {
      set!.delete(c);
      if (!set!.size) clients.delete(slug);
      // a closing tab must not hold up a pending lock
      locks.get(slug)?.waiting.delete(c.id);
      locks.get(slug)?.check();
    },
  };
}

export function publish(slug: string, e: LiveEvent): void {
  for (const c of clients.get(slug) ?? []) {
    try {
      c.send(e);
    } catch {
      /* a dead stream is removed on abort */
    }
  }
}

// ---- agent lock ----

interface Lock {
  state: 'pending' | 'active';
  since: string;
  waiting: Set<string>;
  ready: Promise<void>;
  check(): void;
  idle: ReturnType<typeof setTimeout> | null;
}

const locks = new Map<string, Lock>();

function armIdle(slug: string, l: Lock) {
  if (l.idle) clearTimeout(l.idle);
  l.idle = setTimeout(() => agentLock.release(slug), IDLE_RELEASE_MS);
}

export const agentLock = {
  /** Starts (waiting for editor acks, max ACK_TIMEOUT_MS) or extends the agent lock for a project. */
  async beginOrExtend(slug: string): Promise<void> {
    const existing = locks.get(slug);
    if (existing) {
      armIdle(slug, existing);
      return existing.ready;
    }
    const waiting = new Set([...(clients.get(slug) ?? [])].map((c) => c.id));
    let resolve!: () => void;
    const ready = new Promise<void>((r) => (resolve = r));
    const since = new Date().toISOString();
    const l: Lock = {
      state: 'pending',
      since,
      waiting,
      ready,
      idle: null,
      check() {
        if (l.state === 'pending' && l.waiting.size === 0) {
          clearTimeout(timeout);
          l.state = 'active';
          resolve();
        }
      },
    };
    const timeout = setTimeout(() => {
      l.waiting.clear();
      l.check();
    }, ACK_TIMEOUT_MS);
    locks.set(slug, l);
    armIdle(slug, l);
    publish(slug, { type: 'agent', active: true, since });
    l.check();
    return ready;
  },

  ack(slug: string, clientId: string): void {
    const l = locks.get(slug);
    if (!l) return;
    l.waiting.delete(clientId);
    l.check();
  },

  release(slug: string): void {
    const l = locks.get(slug);
    if (!l) return;
    if (l.idle) clearTimeout(l.idle);
    l.waiting.clear();
    l.check();
    locks.delete(slug);
    publish(slug, { type: 'agent', active: false, since: null });
  },

  state(slug: string): 'none' | 'pending' | 'active' {
    return locks.get(slug)?.state ?? 'none';
  },

  since(slug: string): string | null {
    return locks.get(slug)?.since ?? null;
  },

  /** Editors may not write while an agent holds an active lock. */
  blocksEditor(slug: string): boolean {
    return locks.get(slug)?.state === 'active';
  },
};

export const LOCKED_MESSAGE = 'AI sedang mengedit project ini';
