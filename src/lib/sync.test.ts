import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreinoDB, defaultSettings, deleteSession, exportDoc, importDoc, saveSession, saveSettings } from '../db';
import type { SessionRecord } from '../types';
import { SYNC_FILE, docsEqual, emptyDoc, encodeConnectCode, mergeDocs, parseConnectInput, parseDoc, type SyncDoc } from './sync';
import { SyncError, findGist, readGist } from './gist';
import { syncOnce } from './syncEngine';

const session = (id: string, updatedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  startedAt: `2026-10-0${id.length}T18:00:00.000Z`,
  endedAt: '2026-10-01T19:00:00.000Z',
  activeSec: 3000,
  plannedMin: 60,
  endedBy: 'concluido',
  entries: [{ exerciseId: 'bi-rosca-direta', phase: 'bracos', sets: [{ reps: 10, load: 8 }] }],
  profileId: 'p1',
  updatedAt,
  ...extra,
});

const doc = (sessions: SessionRecord[], settings: SyncDoc['settings'] = [], profiles: SyncDoc['profiles'] = []): SyncDoc => ({
  app: 'treino',
  version: 2,
  profiles,
  settings,
  sessions,
});

describe('junção dos dados', () => {
  it('junta treinos de aparelhos diferentes', () => {
    const merged = mergeDocs(doc([session('a', 1)]), doc([session('bb', 2)]));
    expect(merged.sessions.map((s) => s.id)).toEqual(['a', 'bb']);
  });

  it('a versão alterada por último vence, inclusive exclusões', () => {
    const edited = session('a', 5, { footPain: 3 });
    const deleted = session('a', 9, { deleted: true, entries: [] });
    expect(mergeDocs(doc([session('a', 1)]), doc([edited])).sessions[0].footPain).toBe(3);
    expect(mergeDocs(doc([edited]), doc([deleted])).sessions[0].deleted).toBe(true);
    expect(mergeDocs(doc([deleted]), doc([edited])).sessions[0].deleted).toBe(true);
    // Uma edição feita depois, num aparelho que ainda não sabia da exclusão, não traz o treino de volta.
    const lateEdit = session('a', 20, { notes: 'editado depois' });
    expect(mergeDocs(doc([deleted]), doc([lateEdit])).sessions[0].deleted).toBe(true);
    expect(mergeDocs(doc([lateEdit]), doc([deleted])).sessions[0].deleted).toBe(true);
  });

  it('é comutativa (todos os aparelhos chegam ao mesmo resultado)', () => {
    const a = doc([session('a', 1), session('bb', 7, { notes: 'x' })], [{ ...defaultSettings('p1'), durationMin: 45, updatedAt: 3 }]);
    const b = doc(
      [session('bb', 7, { notes: 'y' }), session('ccc', 2)],
      [{ ...defaultSettings('p1'), durationMin: 30, updatedAt: 4 }, { ...defaultSettings('p2'), updatedAt: 1 }],
    );
    expect(docsEqual(mergeDocs(a, b), mergeDocs(b, a))).toBe(true);
    expect(mergeDocs(a, b).settings.map((s) => [s.id, s.durationMin])).toEqual([
      ['p1', 30],
      ['p2', 60],
    ]);
  });

  it('compara documentos sem depender da ordem das chaves', () => {
    const s = session('a', 1);
    const reordered = Object.fromEntries(Object.entries(s).reverse()) as unknown as SessionRecord;
    expect(docsEqual(doc([s]), doc([reordered]))).toBe(true);
    expect(docsEqual(doc([s]), doc([{ ...s, notes: 'novo' }]))).toBe(false);
  });

  it('valida os dados lidos', () => {
    expect(parseDoc(JSON.stringify(doc([session('a', 1)]))).sessions).toHaveLength(1);
    expect(() => parseDoc('{')).toThrow('JSON');
    expect(() => parseDoc(JSON.stringify({ app: 'outro', sessions: [] }))).toThrow('Treino');
    expect(() => parseDoc(JSON.stringify({ app: 'treino', sessions: [{ id: 1 }] }))).toThrow('inválidos');
  });
});

describe('código de conexão', () => {
  const token = 'ghp_' + 'a1B2'.repeat(9);

  it('leva o token e a gist para outro aparelho', () => {
    const code = encodeConnectCode({ token, gistId: 'abc123' });
    expect(code.startsWith('TR1.')).toBe(true);
    expect(parseConnectInput(code)).toEqual({ token, gistId: 'abc123' });
    expect(parseConnectInput(`https://exemplo.github.io/Sa-de-/treino/#/conectar/${code}`)).toEqual({ token, gistId: 'abc123' });
  });

  it('aceita um token colado diretamente', () => {
    expect(parseConnectInput(`  ${token}\n`)).toEqual({ token });
    expect(parseConnectInput('github_pat_' + 'x'.repeat(60))).toEqual({ token: 'github_pat_' + 'x'.repeat(60) });
  });

  it('recusa textos inválidos', () => {
    expect(parseConnectInput('')).toBeUndefined();
    expect(parseConnectInput('senha123')).toBeUndefined();
    expect(parseConnectInput('TR1.@@@')).toBeUndefined();
    expect(parseConnectInput('TR1.' + btoa('{"t":"nao-e-token"}'))).toBeUndefined();
  });
});

/** Gist falsa em memória, imitando a API do GitHub. */
function fakeGitHub(initial?: SyncDoc) {
  const gists = new Map<string, string>();
  if (initial) gists.set('g1', JSON.stringify(initial));
  let nextId = 2;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = url.replace('https://api.github.com', '');
    calls.push(`${method} ${path}`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const gistJson = (id: string) => ({ id, files: { [SYNC_FILE]: { filename: SYNC_FILE, content: gists.get(id) } } });
    if (method === 'GET' && path.startsWith('/gists?')) return json([...gists.keys()].map(gistJson));
    const m = path.match(/^\/gists\/(\w+)$/);
    if (method === 'GET' && m) return gists.has(m[1]) ? json(gistJson(m[1])) : json({ message: 'Not Found' }, 404);
    if (method === 'PATCH' && m) {
      gists.set(m[1], JSON.parse(init.body as string).files[SYNC_FILE].content);
      return json(gistJson(m[1]));
    }
    if (method === 'POST' && path === '/gists') {
      const id = `g${nextId++}`;
      gists.set(id, JSON.parse(init.body as string).files[SYNC_FILE].content);
      return json(gistJson(id), 201);
    }
    return json({ message: 'Unauthorized' }, 401);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { gists, calls, remote: (id = 'g1') => JSON.parse(gists.get(id)!) as SyncDoc };
}

describe('sincronização pela gist', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('dois aparelhos acabam com os mesmos treinos e ajustes', async () => {
    const gh = fakeGitHub(emptyDoc());
    const phone = new TreinoDB('celular');
    const pc = new TreinoDB('computador');
    const config = { token: 'tok', gistId: 'g1', login: 'eu' };

    await saveSession(phone, session('a', 0));
    await saveSettings(phone, 'p1', { equipment: ['halteres'], configured: true });
    await saveSession(pc, session('bb', 0));

    expect((await syncOnce(phone, config)).pushed).toBe(true);
    const pcResult = await syncOnce(pc, config);
    expect(pcResult.changedLocal).toBe(2); // treino "a" + ajustes
    await syncOnce(phone, config);

    const ids = async (d: TreinoDB) => (await d.sessions.toArray()).map((s) => s.id).sort();
    expect(await ids(phone)).toEqual(['a', 'bb']);
    expect(await ids(pc)).toEqual(['a', 'bb']);
    expect((await pc.settings.get('p1'))?.equipment).toEqual(['halteres']);
    expect(gh.remote().sessions).toHaveLength(2);

    // Sem mudanças, não grava de novo.
    expect((await syncOnce(pc, config)).pushed).toBe(false);

    // Exclusão no computador some do celular.
    await deleteSession(pc, 'a');
    await syncOnce(pc, config);
    await syncOnce(phone, config);
    expect((await phone.sessions.get('a'))?.deleted).toBe(true);
  });

  it('recria a gist se ela foi apagada', async () => {
    const gh = fakeGitHub();
    const d = new TreinoDB('recriar');
    await saveSession(d, session('a', 0));
    const result = await syncOnce(d, { token: 'tok', gistId: 'sumiu', login: 'eu' });
    expect(result.gistId).toBe('g2');
    expect(gh.remote('g2').sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('encontra a gist do app entre as gists do usuário', async () => {
    fakeGitHub(emptyDoc());
    expect(await findGist('tok')).toBe('g1');
    expect(await readGist('tok', 'naoexiste')).toEqual({ missing: true });
  });

  it('dá mensagens claras para token inválido e falta de internet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(findGist('tok')).rejects.toThrow('token é inválido');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(findGist('tok')).rejects.toBeInstanceOf(SyncError);
    await expect(findGist('tok')).rejects.toThrow('Sem conexão');
  });
});

describe('importação', () => {
  it('não sobrescreve um registro mais novo do aparelho', async () => {
    const d = new TreinoDB('importa');
    await d.sessions.put(session('a', 10, { notes: 'mais novo' }));
    expect(await importDoc(d, doc([session('a', 5, { notes: 'velho' }), session('bb', 1)]))).toBe(1);
    expect((await d.sessions.get('a'))?.notes).toBe('mais novo');
    expect((await exportDoc(d)).sessions).toHaveLength(2);
  });
});
