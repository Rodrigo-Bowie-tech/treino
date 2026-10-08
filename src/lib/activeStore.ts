import type { ActiveSession } from './session';

/**
 * O treino em andamento fica só neste aparelho (o histórico é que é
 * sincronizado), separado por perfil.
 */
const key = (profileId: string) => `treino:em-andamento:${profileId}`;

export function loadActive(profileId: string): ActiveSession | undefined {
  try {
    const raw = localStorage.getItem(key(profileId));
    if (!raw) return undefined;
    const s = JSON.parse(raw) as ActiveSession;
    return s && s.plan && Array.isArray(s.plan.items) && s.profileId === profileId ? s : undefined;
  } catch {
    return undefined;
  }
}

export function saveActive(profileId: string, session: ActiveSession | undefined): void {
  try {
    if (session) localStorage.setItem(key(profileId), JSON.stringify(session));
    else localStorage.removeItem(key(profileId));
  } catch {
    // Sem armazenamento: o treino continua, mas não sobrevive a um recarregamento.
  }
}
