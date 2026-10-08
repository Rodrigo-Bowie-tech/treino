import Dexie, { type EntityTable } from 'dexie';
import type { Profile, SessionRecord, Settings } from './types';
import { hashPin } from './lib/profiles';
import { isNewer, type SyncDoc } from './lib/sync';

export class TreinoDB extends Dexie {
  sessions!: EntityTable<SessionRecord, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;

  constructor(name = 'treino') {
    super(name);
    this.version(1).stores({
      sessions: 'id, startedAt',
      settings: 'id',
    });
    this.version(2).stores({
      sessions: 'id, startedAt, profileId',
      settings: 'id',
      profiles: 'id',
    });
  }
}

export const db = new TreinoDB();

export function defaultSettings(profileId: string): Settings {
  return {
    id: profileId,
    equipment: [],
    durationMin: 60,
    restSec: 60,
    fasciitis: true,
    footSide: 'ambos',
    weeklyGoal: 3,
    voice: true,
    sound: true,
    configured: false,
    updatedAt: 0,
  };
}

export function withDefaults(profileId: string, settings: Settings | undefined): Settings {
  return { ...defaultSettings(profileId), ...settings, id: profileId };
}

/* ——— Aviso de alteração local (dispara a sincronização) ——— */

const changeListeners = new Set<() => void>();

export function onLocalChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitLocalChange(): void {
  changeListeners.forEach((l) => l());
}

export async function saveSettings(target: TreinoDB, profileId: string, changes: Partial<Settings>): Promise<void> {
  const current = withDefaults(profileId, await target.settings.get(profileId));
  await target.settings.put({ ...current, ...changes, id: profileId, updatedAt: Date.now() });
  emitLocalChange();
}

export async function saveSession(target: TreinoDB, record: SessionRecord): Promise<void> {
  await target.sessions.put({ ...record, updatedAt: Date.now() });
  emitLocalChange();
}

/** Exclui um treino deixando um marcador, para que a exclusão chegue aos outros aparelhos. */
export async function deleteSession(target: TreinoDB, id: string): Promise<void> {
  const current = await target.sessions.get(id);
  if (!current) return;
  await target.sessions.put({ ...current, entries: [], notes: undefined, footPain: undefined, deleted: true, updatedAt: Date.now() });
  emitLocalChange();
}

/* ——— Perfis ——— */

export async function createProfile(target: TreinoDB, name: string, pin: string): Promise<Profile> {
  const now = Date.now();
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: name.trim(),
    pin: await hashPin(pin),
    createdAt: new Date(now).toISOString(),
    updatedAt: now,
  };
  await target.profiles.put(profile);
  emitLocalChange();
  return profile;
}

export async function updateProfile(target: TreinoDB, id: string, changes: Partial<Pick<Profile, 'name' | 'pin'>>): Promise<void> {
  const current = await target.profiles.get(id);
  if (!current || current.deleted) return;
  await target.profiles.put({ ...current, ...changes, id, updatedAt: Date.now() });
  emitLocalChange();
}

/** Exclui o perfil e todos os treinos dele (em todos os aparelhos sincronizados). */
export async function deleteProfile(target: TreinoDB, id: string): Promise<void> {
  const now = Date.now();
  await target.transaction('rw', target.profiles, target.sessions, async () => {
    const current = await target.profiles.get(id);
    if (!current) return;
    await target.profiles.put({ ...current, pin: { salt: '', hash: '', iterations: 0 }, deleted: true, updatedAt: now });
    const own = await target.sessions.where('profileId').equals(id).toArray();
    await target.sessions.bulkPut(
      own
        .filter((s) => !s.deleted)
        .map((s) => ({ ...s, entries: [], notes: undefined, footPain: undefined, deleted: true, updatedAt: now })),
    );
  });
  emitLocalChange();
}

/* ——— Exportação e importação (sincronização e backup) ——— */

export async function exportDoc(target: TreinoDB): Promise<SyncDoc> {
  const [profiles, settings, sessions] = await Promise.all([
    target.profiles.toArray(),
    target.settings.toArray(),
    target.sessions.toArray(),
  ]);
  return { app: 'treino', version: 2, profiles, settings, sessions };
}

/** Só os dados de um perfil (para o backup de cada pessoa). */
export async function exportProfileDoc(target: TreinoDB, profileId: string): Promise<SyncDoc> {
  const [profile, settings, sessions] = await Promise.all([
    target.profiles.get(profileId),
    target.settings.get(profileId),
    target.sessions.where('profileId').equals(profileId).toArray(),
  ]);
  return { app: 'treino', version: 2, profiles: profile ? [profile] : [], settings: settings ? [settings] : [], sessions };
}

/**
 * Grava os registros do documento que forem mais novos que os do aparelho.
 * Cada registro é comparado dentro da transação, então uma alteração feita
 * durante a sincronização não é sobrescrita. Retorna quantos registros mudaram.
 */
export async function importDoc(target: TreinoDB, doc: SyncDoc): Promise<number> {
  let changed = 0;
  await target.transaction('rw', target.profiles, target.settings, target.sessions, async () => {
    const apply = async <T extends { id: string; updatedAt: number }>(table: EntityTable<T, 'id'>, rows: T[]) => {
      if (!rows.length) return;
      const existing = await table.bulkGet(rows.map((r) => r.id) as never[]);
      const newer = rows.filter((r, i) => isNewer(r, existing[i] as T | undefined));
      if (newer.length) await table.bulkPut(newer);
      changed += newer.length;
    };
    await apply(target.profiles, doc.profiles);
    await apply(target.settings, doc.settings);
    await apply(target.sessions, doc.sessions);
  });
  return changed;
}
