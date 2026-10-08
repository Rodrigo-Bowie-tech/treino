import { SYNC_FILE, parseDoc, type SyncDoc } from './sync';

/**
 * Sincronização pelo GitHub: os dados ficam num arquivo dentro de uma gist
 * secreta da própria conta do usuário. Não há servidor do app.
 */
const API = 'https://api.github.com';
const DESCRIPTION = 'App Treino: dados sincronizados entre aparelhos (não apague)';

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      cache: 'no-store',
      // Não deixa a tela esperando para sempre numa conexão ruim.
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('Sem conexão com o GitHub. Verifique a internet.');
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new SyncError('O token é inválido, expirou ou foi revogado. Gere um novo no GitHub.', 401);
    }
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      throw new SyncError('O GitHub limitou as requisições por enquanto. Tente de novo em alguns minutos.', 403);
    }
    if (res.status === 403 || res.status === 404) {
      throw new SyncError('O token não tem permissão para Gists. Crie um token com a permissão "gist".', res.status);
    }
    throw new SyncError(`O GitHub respondeu com erro (${res.status}). Tente de novo mais tarde.`, res.status);
  }
  return (await res.json()) as T;
}

interface GistFile {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

export async function getLogin(token: string): Promise<string> {
  const user = await request<{ login: string }>(token, '/user');
  return user.login;
}

/** Procura a gist do app entre as gists do usuário. */
export async function findGist(token: string): Promise<string | undefined> {
  for (let page = 1; page <= 30; page++) {
    const gists = await request<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const found = gists.find((g) => g.files && SYNC_FILE in g.files);
    if (found) return found.id;
    if (gists.length < 100) return undefined;
  }
  return undefined;
}

export async function createGist(token: string, doc: SyncDoc): Promise<string> {
  const gist = await request<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: DESCRIPTION, public: false, files: { [SYNC_FILE]: { content: JSON.stringify(doc) } } }),
  });
  return gist.id;
}

/** Lê os dados da gist. `missing` indica que a gist (ou o arquivo) não existe mais. */
export async function readGist(token: string, gistId: string): Promise<{ doc?: SyncDoc; missing: boolean }> {
  let gist: Gist;
  try {
    gist = await request<Gist>(token, `/gists/${gistId}`);
  } catch (e) {
    if (e instanceof SyncError && e.status === 404) return { missing: true };
    throw e;
  }
  const file = gist.files?.[SYNC_FILE];
  if (!file) return { missing: true };
  let text = file.content ?? '';
  if (file.truncated && file.raw_url) {
    try {
      text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
    } catch {
      throw new SyncError('Sem conexão com o GitHub. Verifique a internet.');
    }
  }
  try {
    return { doc: parseDoc(text), missing: false };
  } catch (e) {
    throw new SyncError(`Os dados sincronizados estão corrompidos: ${(e as Error).message}`);
  }
}

export async function writeGist(token: string, gistId: string, doc: SyncDoc): Promise<void> {
  await request<Gist>(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(doc) } } }),
  });
}
