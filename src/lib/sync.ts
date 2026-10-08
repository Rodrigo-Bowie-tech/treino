import type { Profile, SessionRecord, Settings } from '../types';

/** Nome do arquivo guardado na gist do GitHub. */
export const SYNC_FILE = 'treino-sync.json';

/** Tudo o que é sincronizado entre os aparelhos: os perfis e os ajustes e treinos de cada um. */
export interface SyncDoc {
  app: 'treino';
  version: 2;
  profiles: Profile[];
  /** Ajustes de cada perfil (o id é o do perfil). */
  settings: Settings[];
  sessions: SessionRecord[];
}

export function emptyDoc(): SyncDoc {
  return { app: 'treino', version: 2, profiles: [], settings: [], sessions: [] };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function validProfile(p: unknown): p is Profile {
  if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.updatedAt !== 'number') return false;
  if (p.deleted) return true;
  const pin = p.pin;
  return isObj(pin) && typeof pin.salt === 'string' && typeof pin.hash === 'string' && typeof pin.iterations === 'number';
}

export function parseDoc(text: string): SyncDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Os dados não são um JSON válido.');
  }
  if (!isObj(parsed) || parsed.app !== 'treino' || !Array.isArray(parsed.sessions)) {
    throw new Error('Estes dados não são do app Treino.');
  }
  const sessions = parsed.sessions as unknown[];
  for (const s of sessions) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.updatedAt !== 'number' || !Array.isArray(s.entries)) {
      throw new Error('Há um treino com dados inválidos.');
    }
  }
  // Versão 1 (antes dos perfis): um único registro de ajustes.
  const rawSettings = Array.isArray(parsed.settings) ? parsed.settings : parsed.settings ? [parsed.settings] : [];
  for (const st of rawSettings) {
    if (!isObj(st) || typeof st.id !== 'string' || typeof st.updatedAt !== 'number') throw new Error('Há ajustes com dados inválidos.');
  }
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
  for (const p of profiles) {
    if (!validProfile(p)) throw new Error('Há um perfil com dados inválidos.');
  }
  return {
    app: 'treino',
    version: 2,
    profiles: profiles as Profile[],
    settings: rawSettings as Settings[],
    sessions: sessions as SessionRecord[],
  };
}

/** JSON com as chaves em ordem alfabética (para comparar registros vindos de lugares diferentes). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Qual versão de um registro vence. A exclusão é definitiva: a versão excluída
 * sempre vence (uma edição atrasada de outro aparelho não traz o registro de
 * volta). Fora isso, vence a alterada por último; num empate (raro), a
 * comparação do conteúdo garante que todos os aparelhos escolham a mesma.
 */
export function isNewer<T extends { updatedAt: number; deleted?: boolean }>(candidate: T, current: T | undefined): boolean {
  if (!current) return true;
  if (!!candidate.deleted !== !!current.deleted) return !!candidate.deleted;
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return stableStringify(candidate) > stableStringify(current);
}

/** Id dos ajustes nos dados de antes dos perfis (versão 1). */
export const LEGACY_SETTINGS_ID = 'me';

/**
 * Backup de antes dos perfis: ao importar, os treinos sem dono e os ajustes
 * antigos passam para o perfil que está importando.
 */
export function adoptLegacy(doc: SyncDoc, profileId: string, now: number): SyncDoc {
  return {
    ...doc,
    settings: doc.settings.map((s) => (s.id === LEGACY_SETTINGS_ID ? { ...s, id: profileId } : s)),
    sessions: doc.sessions.map((s) => (s.profileId ? s : { ...s, profileId, updatedAt: now })),
  };
}

/** Junta duas listas de registros pelo id, ficando com a versão mais nova de cada um. */
function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of [...a, ...b]) {
    if (isNewer(r, byId.get(r.id))) byId.set(r.id, r);
  }
  return [...byId.values()];
}

const byIdOrder = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** Junta dois conjuntos de dados registro a registro (exclusões incluídas). */
export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  return {
    app: 'treino',
    version: 2,
    profiles: mergeById(a.profiles, b.profiles).sort(byIdOrder),
    settings: mergeById(a.settings, b.settings).sort(byIdOrder),
    sessions: mergeById(a.sessions, b.sessions).sort((x, y) => x.startedAt.localeCompare(y.startedAt) || byIdOrder(x, y)),
  };
}

export function docsEqual(a: SyncDoc, b: SyncDoc): boolean {
  const norm = (d: SyncDoc) => ({
    ...d,
    profiles: [...d.profiles].sort(byIdOrder),
    settings: [...d.settings].sort(byIdOrder),
    sessions: [...d.sessions].sort(byIdOrder),
  });
  return stableStringify(norm(a)) === stableStringify(norm(b));
}

/* ——— Código para conectar outro aparelho ——— */

export interface ConnectInfo {
  token: string;
  gistId?: string;
}

const CODE_PREFIX = 'TR1.';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeConnectCode(info: { token: string; gistId: string }): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify({ t: info.token, g: info.gistId }));
}

const TOKEN_RE = /^(ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{20,255}$/;

/** Aceita um código de conexão (de outro aparelho) ou um token do GitHub colado diretamente. */
export function parseConnectInput(input: string): ConnectInfo | undefined {
  const text = input.trim();
  if (TOKEN_RE.test(text)) return { token: text };
  const start = text.indexOf(CODE_PREFIX);
  if (start < 0) return undefined;
  const code = text.slice(start + CODE_PREFIX.length).match(/^[A-Za-z0-9_-]+/)?.[0];
  if (!code) return undefined;
  try {
    const data = JSON.parse(fromBase64Url(code)) as { t?: unknown; g?: unknown };
    if (typeof data.t !== 'string' || !TOKEN_RE.test(data.t)) return undefined;
    return { token: data.t, gistId: typeof data.g === 'string' && /^[0-9a-f]+$/i.test(data.g) ? data.g : undefined };
  } catch {
    return undefined;
  }
}
