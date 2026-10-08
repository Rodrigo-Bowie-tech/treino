import type { PinHash, Profile } from '../types';

/**
 * Perfis com PIN. O PIN só separa os dados de cada pessoa dentro do app:
 * todos os perfis ficam na mesma sincronização. Ele é guardado como hash
 * (PBKDF2-SHA-256 com sal), nunca em texto.
 */
const ITERATIONS = 100_000;

export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const NAME_MAX = 30;

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPin(pin: string, salt?: Uint8Array<ArrayBuffer>, iterations = ITERATIONS): Promise<PinHash> {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: s, iterations }, key, 256);
  return { salt: toB64(s), hash: toB64(new Uint8Array(bits)), iterations };
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!stored.salt || !stored.hash || !stored.iterations) return false;
  const { hash } = await hashPin(pin, fromB64(stored.salt), stored.iterations);
  // Compara todos os caracteres, sem parar no primeiro diferente.
  let diff = hash.length ^ stored.hash.length;
  for (let i = 0; i < Math.min(hash.length, stored.hash.length); i++) diff |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i);
  return diff === 0;
}

export function validatePin(pin: string): string | undefined {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin) ? undefined : `O PIN deve ter de ${PIN_MIN} a ${PIN_MAX} números.`;
}

/** Nome obrigatório e diferente dos outros perfis (sem diferenciar maiúsculas e acentos). */
export function validateName(name: string, profiles: Profile[], exceptId?: string): string | undefined {
  const n = name.trim();
  if (!n) return 'Digite um nome.';
  if (n.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres.`;
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (profiles.some((p) => !p.deleted && p.id !== exceptId && key(p.name) === key(n))) return 'Já existe um perfil com esse nome.';
  return undefined;
}

export function liveProfiles(profiles: Profile[]): Profile[] {
  return profiles.filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/* ——— Tentativas erradas: depois de 5, espera 30 s (e mais 30 s a cada erro seguinte) ——— */

export const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;
const ATTEMPTS_KEY = 'treino:tentativas-pin';

interface Attempts {
  count: number;
  until: number;
}

function readAttempts(): Record<string, Attempts> {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}') as Record<string, Attempts>;
  } catch {
    return memoryAttempts;
  }
}

let memoryAttempts: Record<string, Attempts> = {};

function writeAttempts(all: Record<string, Attempts>): void {
  memoryAttempts = all;
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  } catch {
    // Sem armazenamento: o controle vale enquanto o app estiver aberto.
  }
}

/** Quanto falta (ms) para poder tentar de novo; 0 = pode tentar. */
export function lockedFor(profileId: string, now: number): number {
  const a = readAttempts()[profileId];
  return a ? Math.max(0, a.until - now) : 0;
}

/** Registra um PIN errado. Retorna quantas tentativas restam antes da espera e a espera, se houver. */
export function registerFailure(profileId: string, now: number): { left: number; lockMs: number } {
  const all = readAttempts();
  const count = (all[profileId]?.count ?? 0) + 1;
  const lockMs = count >= MAX_ATTEMPTS ? LOCK_MS * (count - MAX_ATTEMPTS + 1) : 0;
  writeAttempts({ ...all, [profileId]: { count, until: now + lockMs } });
  return { left: Math.max(0, MAX_ATTEMPTS - count), lockMs };
}

export function clearFailures(profileId: string): void {
  const all = readAttempts();
  if (!(profileId in all)) return;
  const rest = { ...all };
  delete rest[profileId];
  writeAttempts(rest);
}

/* ——— Perfil que está usando este aparelho ——— */

const CURRENT_KEY = 'treino:perfil';
let current: string | undefined = (() => {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
})();
const listeners = new Set<() => void>();

export function getCurrentProfileId(): string | undefined {
  return current;
}

export function setCurrentProfileId(id: string | undefined): void {
  current = id;
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // Sem armazenamento: o login vale até fechar o app.
  }
  listeners.forEach((l) => l());
}

export function subscribeCurrentProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Entrar ou sair numa aba vale também para as outras abas abertas do app.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== CURRENT_KEY && e.key !== null) return;
    current = e.key === null ? undefined : (e.newValue ?? undefined);
    listeners.forEach((l) => l());
  });
}
