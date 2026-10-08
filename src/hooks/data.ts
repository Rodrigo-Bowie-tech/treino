import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings, withDefaults } from '../db';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../lib/syncEngine';
import { getCurrentProfileId, liveProfiles, subscribeCurrentProfile } from '../lib/profiles';
import { liveSessions } from '../lib/progress';
import type { Profile, SessionRecord, Settings } from '../types';

/* ——— Perfis ——— */

/** Perfis existentes (sem os excluídos), por nome; `undefined` enquanto carrega. */
export function useProfiles(): Profile[] | undefined {
  const all = useLiveQuery(() => db.profiles.toArray());
  return all && liveProfiles(all);
}

/** Id do perfil logado neste aparelho. */
export function useCurrentProfileId(): string | undefined {
  return useSyncExternalStore(subscribeCurrentProfile, getCurrentProfileId);
}

/** Perfil logado; as telas internas só aparecem com um perfil. */
export const ProfileContext = createContext<Profile | null>(null);

export function useProfile(): Profile {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error('Nenhum perfil logado.');
  return profile;
}

/* ——— Ajustes e treinos do perfil logado ——— */

/** Ajustes do perfil; `undefined` enquanto carrega. */
export function useSettings(): Settings | undefined {
  const { id } = useProfile();
  const row = useLiveQuery(async () => (await db.settings.get(id)) ?? null, [id]);
  return row === undefined ? undefined : withDefaults(id, row ?? undefined);
}

/**
 * Ajustes para formulários: a tela muda na hora e a gravação acontece em
 * seguida (o valor salvo, inclusive o que chega pela sincronização, prevalece).
 */
export function useEditableSettings(): [Settings | undefined, (changes: Partial<Settings>) => void] {
  const { id } = useProfile();
  const stored = useSettings();
  const [local, setLocal] = useState<Settings>();
  const version = stored && `${stored.id}:${stored.updatedAt}`;
  useEffect(() => {
    if (stored) setLocal(stored);
    // Só quando o registro salvo muda.
  }, [version]);
  const change = useCallback(
    (changes: Partial<Settings>) => {
      setLocal((l) => l && l.id === id ? { ...l, ...changes } : l);
      void saveSettings(db, id, changes);
    },
    [id],
  );
  return [local?.id === id ? local : stored, change];
}

/** Treinos do perfil (inclusive os marcadores de exclusão); `undefined` enquanto carrega. */
export function useAllSessions(): SessionRecord[] | undefined {
  const { id } = useProfile();
  return useLiveQuery(() => db.sessions.where('profileId').equals(id).toArray(), [id]);
}

/** Treinos válidos do perfil, do mais recente para o mais antigo. */
export function useSessions(): SessionRecord[] | undefined {
  const all = useAllSessions();
  return all && liveSessions(all);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
}
