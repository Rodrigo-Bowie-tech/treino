import { db, exportDoc, importDoc, onLocalChange, type TreinoDB } from '../db';
import { SyncError, createGist, findGist, getLogin, readGist, writeGist } from './gist';
import { docsEqual, emptyDoc, mergeDocs } from './sync';

/** Configuração da sincronização deste aparelho (não é sincronizada). */
export interface SyncConfig {
  token: string;
  gistId: string;
  login: string;
  lastSyncAt?: number;
}

const KEY = 'treino:sincronizacao';

export function loadConfig(): SyncConfig | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : undefined;
  } catch {
    return undefined;
  }
}

function storeConfig(config: SyncConfig | undefined): void {
  try {
    if (config) localStorage.setItem(KEY, JSON.stringify(config));
    else localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento local: a conexão vale só enquanto o app estiver aberto.
  }
  memoryConfig = config;
  setStatus({ ...status, login: config?.login, lastSyncAt: config?.lastSyncAt, enabled: !!config });
}

let memoryConfig: SyncConfig | undefined;

function currentConfig(): SyncConfig | undefined {
  return loadConfig() ?? memoryConfig;
}

/* ——— Estado para a interface ——— */

export interface SyncStatus {
  enabled: boolean;
  running: boolean;
  login?: string;
  lastSyncAt?: number;
  error?: string;
}

let status: SyncStatus = (() => {
  const c = loadConfig();
  return { enabled: !!c, running: false, login: c?.login, lastSyncAt: c?.lastSyncAt };
})();
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ——— Sincronização ——— */

/**
 * Uma rodada: lê os dados da gist, junta com os do aparelho (o mais recente
 * de cada registro vence), grava o resultado aqui e, se mudou, lá.
 */
export async function syncOnce(target: TreinoDB, config: SyncConfig): Promise<{ changedLocal: number; pushed: boolean; gistId: string }> {
  const local = await exportDoc(target);
  let gistId = config.gistId;
  let { doc: remote, missing } = await readGist(config.token, gistId);
  if (missing) {
    // A gist foi apagada: procura outra do app ou cria uma nova com os dados deste aparelho.
    const found = await findGist(config.token);
    if (found) {
      gistId = found;
      remote = (await readGist(config.token, gistId)).doc;
    } else {
      gistId = await createGist(config.token, local);
      remote = local;
    }
  }
  const merged = mergeDocs(local, remote ?? emptyDoc());
  const changedLocal = await importDoc(target, merged);
  let pushed = false;
  if (!remote || !docsEqual(merged, remote)) {
    await writeGist(config.token, gistId, merged);
    pushed = true;
  }
  return { changedLocal, pushed, gistId };
}

let running: Promise<void> | null = null;
let again = false;

/** Sincroniza agora (se já estiver sincronizando, faz mais uma rodada em seguida). */
export async function syncNow(): Promise<void> {
  if (!currentConfig()) return;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const config = currentConfig();
      if (!config) break;
      setStatus({ ...status, running: true });
      try {
        const { gistId } = await syncOnce(db, config);
        // A conexão pode ter sido desfeita durante a rodada.
        if (currentConfig()?.token === config.token) storeConfig({ ...config, gistId, lastSyncAt: Date.now() });
        setStatus({ ...status, running: false, error: undefined });
      } catch (e) {
        setStatus({ ...status, running: false, error: e instanceof Error ? e.message : String(e) });
        break;
      }
    } while (again);
  })();
  try {
    await running;
  } finally {
    running = null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function requestSync(delayMs = 2000): void {
  if (!currentConfig()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

/** Conecta este aparelho: valida o token, encontra (ou cria) a gist e sincroniza. */
export async function connect(token: string, gistId?: string): Promise<SyncConfig> {
  const login = await getLogin(token);
  let id = gistId;
  if (id) {
    const { missing } = await readGist(token, id);
    if (missing) id = undefined;
  }
  id ??= (await findGist(token)) ?? (await createGist(token, emptyDoc()));
  const config: SyncConfig = { token, gistId: id, login };
  storeConfig(config);
  await syncNow();
  if (status.error) throw new SyncError(status.error);
  return currentConfig() ?? config;
}

export function disconnect(): void {
  clearTimeout(timer);
  storeConfig(undefined);
  setStatus({ enabled: false, running: false });
}

export function getConfig(): SyncConfig | undefined {
  return currentConfig();
}

/** Liga a sincronização automática: ao abrir, ao voltar ao app, ao reconectar, a cada 5 min e após cada alteração. */
export function startAutoSync(): void {
  onLocalChange(() => requestSync(2000));
  window.addEventListener('online', () => requestSync(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync(0);
    else void syncNow();
  });
  setInterval(() => requestSync(0), 5 * 60_000);
  requestSync(0);
}
