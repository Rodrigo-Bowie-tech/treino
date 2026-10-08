import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreinoDB, createProfile, defaultSettings, deleteProfile, exportDoc, exportProfileDoc, importDoc, saveSession, updateProfile } from '../db';
import type { Profile, SessionRecord } from '../types';
import {
  MAX_ATTEMPTS,
  clearFailures,
  getCurrentProfileId,
  hashPin,
  lockedFor,
  registerFailure,
  setCurrentProfileId,
  subscribeCurrentProfile,
  validateName,
  validatePin,
  verifyPin,
} from './profiles';
import { SYNC_FILE, adoptLegacy, emptyDoc, mergeDocs, parseDoc, type SyncDoc } from './sync';
import { syncOnce } from './syncEngine';

const session = (id: string, profileId?: string): SessionRecord => ({
  id,
  ...(profileId ? { profileId } : {}),
  startedAt: '2026-10-01T18:00:00.000Z',
  endedAt: '2026-10-01T19:00:00.000Z',
  activeSec: 3000,
  plannedMin: 60,
  endedBy: 'concluido',
  entries: [{ exerciseId: 'bi-rosca-direta', phase: 'bracos', sets: [{ reps: 10, load: 8 }] }],
  updatedAt: 1,
});

const profile = (id: string, name: string, extra: Partial<Profile> = {}): Profile => ({
  id,
  name,
  pin: { salt: 'c2FsdA==', hash: 'aGFzaA==', iterations: 1 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: 1,
  ...extra,
});

describe('PIN', () => {
  it('guarda só o hash e confere o PIN certo', async () => {
    const stored = await hashPin('2580');
    expect(JSON.stringify(stored)).not.toContain('2580');
    expect(stored.iterations).toBeGreaterThanOrEqual(100_000);
    expect(await verifyPin('2580', stored)).toBe(true);
    expect(await verifyPin('2581', stored)).toBe(false);
    expect(await verifyPin('', stored)).toBe(false);
  });

  it('usa um sal diferente a cada vez', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('não aceita PIN de perfil excluído (sem hash)', async () => {
    expect(await verifyPin('1234', { salt: '', hash: '', iterations: 0 })).toBe(false);
  });

  it('exige de 4 a 8 números', () => {
    expect(validatePin('123')).toBeDefined();
    expect(validatePin('1234')).toBeUndefined();
    expect(validatePin('12345678')).toBeUndefined();
    expect(validatePin('123456789')).toBeDefined();
    expect(validatePin('12a4')).toBeDefined();
  });
});

describe('nome do perfil', () => {
  const list = [profile('a', 'João'), profile('b', 'Ana', { deleted: true })];

  it('é obrigatório e único, sem diferenciar maiúsculas e acentos', () => {
    expect(validateName('  ', list)).toBeDefined();
    expect(validateName('joao', list)).toBe('Já existe um perfil com esse nome.');
    expect(validateName('JOÃO ', list)).toBeDefined();
    expect(validateName('João', list, 'a')).toBeUndefined(); // o próprio perfil
    expect(validateName('Ana', list)).toBeUndefined(); // perfil excluído não conta
    expect(validateName('x'.repeat(31), list)).toBeDefined();
  });
});

describe('tentativas erradas', () => {
  it('depois de 5 erros espera 30 s, e mais 30 s a cada erro seguinte', () => {
    const t = 1_000_000;
    for (let i = 1; i < MAX_ATTEMPTS; i++) expect(registerFailure('p', t)).toEqual({ left: MAX_ATTEMPTS - i, lockMs: 0 });
    expect(lockedFor('p', t)).toBe(0);
    expect(registerFailure('p', t)).toEqual({ left: 0, lockMs: 30_000 });
    expect(lockedFor('p', t + 10_000)).toBe(20_000);
    expect(lockedFor('p', t + 30_000)).toBe(0);
    expect(registerFailure('p', t + 30_000).lockMs).toBe(60_000);
    expect(lockedFor('outro', t)).toBe(0);
    clearFailures('p');
    expect(lockedFor('p', t + 30_000)).toBe(0);
    expect(registerFailure('p', t).left).toBe(MAX_ATTEMPTS - 1);
  });
});

describe('perfil logado no aparelho', () => {
  it('avisa quem está ouvindo ao entrar e sair', () => {
    const seen: (string | undefined)[] = [];
    const stop = subscribeCurrentProfile(() => seen.push(getCurrentProfileId()));
    setCurrentProfileId('p1');
    setCurrentProfileId(undefined);
    stop();
    setCurrentProfileId('p2');
    expect(seen).toEqual(['p1', undefined]);
    setCurrentProfileId(undefined);
  });
});

describe('perfis no banco de dados', () => {
  it('criar um perfil não pega dados de mais ninguém (nem os de antes dos perfis)', async () => {
    const d = new TreinoDB('sem-adocao');
    await d.sessions.put(session('antigo'));
    await d.settings.put({ ...defaultSettings('me'), equipment: ['halteres'], updatedAt: 5 });
    const first = await createProfile(d, ' Rodrigo ', '1234');
    expect(first.name).toBe('Rodrigo');
    expect((await d.sessions.get('antigo'))?.profileId).toBeUndefined();
    expect(await d.settings.get(first.id)).toBeUndefined();
    expect(await d.sessions.where('profileId').equals(first.id).count()).toBe(0);
  });

  it('importar um backup de antes dos perfis põe os treinos e ajustes no perfil que importou', async () => {
    const d = new TreinoDB('importa-v1');
    const p = await createProfile(d, 'Rodrigo', '1234');
    const v1 = {
      app: 'treino',
      version: 1,
      settings: { ...defaultSettings('me'), equipment: ['barra'], configured: true, updatedAt: 5 },
      sessions: [session('a'), session('b'), { ...session('c', 'outro-perfil') }],
    };
    const doc = adoptLegacy(parseDoc(JSON.stringify(v1)), p.id, 100);
    expect(await importDoc(d, doc)).toBe(4);
    const mine = await d.sessions.where('profileId').equals(p.id).toArray();
    expect(mine.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect((await d.settings.get(p.id))?.equipment).toEqual(['barra']);
    expect((await d.sessions.get('c'))?.profileId).toBe('outro-perfil');
  });

  it('excluir o perfil apaga os treinos dele e o hash do PIN, e não mexe nos do outro', async () => {
    const d = new TreinoDB('exclusao');
    const a = await createProfile(d, 'A', '1111');
    const b = await createProfile(d, 'B', '2222');
    await saveSession(d, session('sa', a.id));
    await saveSession(d, session('sb', b.id));
    await deleteProfile(d, a.id);
    const gone = (await d.profiles.get(a.id))!;
    expect(gone.deleted).toBe(true);
    expect(gone.pin.hash).toBe('');
    expect(await verifyPin('1111', gone.pin)).toBe(false);
    expect((await d.sessions.get('sa'))?.deleted).toBe(true);
    expect((await d.sessions.get('sa'))?.entries).toEqual([]);
    expect((await d.sessions.get('sb'))?.deleted).toBeUndefined();
  });

  it('trocar nome e PIN', async () => {
    const d = new TreinoDB('editar');
    const p = await createProfile(d, 'Ana', '1234');
    await updateProfile(d, p.id, { name: 'Ana Paula', pin: await hashPin('4321') });
    const saved = (await d.profiles.get(p.id))!;
    expect(saved.name).toBe('Ana Paula');
    expect(await verifyPin('4321', saved.pin)).toBe(true);
    expect(await verifyPin('1234', saved.pin)).toBe(false);
    expect(saved.updatedAt).toBeGreaterThan(p.updatedAt - 1);
  });
});

describe('perfis na sincronização', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('converte dados da versão 1 (antes dos perfis)', () => {
    const v1 = { app: 'treino', version: 1, settings: { id: 'me', updatedAt: 3, equipment: [] }, sessions: [session('a')] };
    const doc = parseDoc(JSON.stringify(v1));
    expect(doc.version).toBe(2);
    expect(doc.profiles).toEqual([]);
    expect(doc.settings.map((s) => s.id)).toEqual(['me']);
  });

  it('recusa perfil inválido, mas aceita perfil excluído sem PIN', () => {
    const base = { app: 'treino', version: 2, settings: [], sessions: [] };
    expect(() => parseDoc(JSON.stringify({ ...base, profiles: [{ id: 'x', name: 'X', updatedAt: 1 }] }))).toThrow('perfil');
    expect(parseDoc(JSON.stringify({ ...base, profiles: [{ id: 'x', name: 'X', updatedAt: 1, deleted: true }] })).profiles).toHaveLength(1);
  });

  it('a exclusão é definitiva: uma edição atrasada de outro aparelho não traz o perfil de volta', async () => {
    const tombstone = profile('p1', 'Rodrigo', { deleted: true, updatedAt: 10 });
    const lateEdit = profile('p1', 'Rodrigo Novo', { updatedAt: 20 });
    expect(mergeDocs({ ...emptyDoc(), profiles: [tombstone] }, { ...emptyDoc(), profiles: [lateEdit] }).profiles[0].deleted).toBe(true);
    expect(mergeDocs({ ...emptyDoc(), profiles: [lateEdit] }, { ...emptyDoc(), profiles: [tombstone] }).profiles[0].deleted).toBe(true);
    // Também ao gravar no aparelho.
    const d = new TreinoDB('exclusao-definitiva');
    await d.profiles.put(tombstone);
    expect(await importDoc(d, { ...emptyDoc(), profiles: [lateEdit] })).toBe(0);
    expect((await d.profiles.get('p1'))?.deleted).toBe(true);
  });

  it('junta perfis criados em aparelhos diferentes e propaga exclusões', () => {
    const a: SyncDoc = { ...emptyDoc(), profiles: [profile('p1', 'Rodrigo')] };
    const b: SyncDoc = { ...emptyDoc(), profiles: [profile('p2', 'Maria'), profile('p1', 'Rodrigo', { deleted: true, updatedAt: 9 })] };
    const merged = mergeDocs(a, b);
    expect(merged.profiles.map((p) => [p.id, !!p.deleted])).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
  });

  it('duas pessoas, dois aparelhos: cada uma vê só os próprios treinos, e os perfis chegam aos dois', async () => {
    let remote = JSON.stringify(emptyDoc());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method === 'PATCH') remote = JSON.parse(init.body as string).files[SYNC_FILE].content;
        return new Response(JSON.stringify({ id: 'g1', files: { [SYNC_FILE]: { filename: SYNC_FILE, content: remote } } }));
      }),
    );
    const config = { token: 'tok', gistId: 'g1', login: 'eu' };
    const pc = new TreinoDB('pc-rodrigo');
    const phone = new TreinoDB('celular-maria');

    const rodrigo = await createProfile(pc, 'Rodrigo', '1234');
    await saveSession(pc, session('r1', rodrigo.id));
    await syncOnce(pc, config);

    await syncOnce(phone, config);
    expect((await phone.profiles.toArray()).map((p) => p.name)).toEqual(['Rodrigo']);
    const maria = await createProfile(phone, 'Maria', '5678');
    await saveSession(phone, session('m1', maria.id));
    await syncOnce(phone, config);
    await syncOnce(pc, config);

    for (const d of [pc, phone]) {
      expect((await d.profiles.toArray()).map((p) => p.name).sort()).toEqual(['Maria', 'Rodrigo']);
      expect((await d.sessions.where('profileId').equals(rodrigo.id).toArray()).map((s) => s.id)).toEqual(['r1']);
      expect((await d.sessions.where('profileId').equals(maria.id).toArray()).map((s) => s.id)).toEqual(['m1']);
    }
    // O PIN de cada um funciona no aparelho do outro.
    expect(await verifyPin('5678', (await pc.profiles.get(maria.id))!.pin)).toBe(true);
    // O documento sincronizado nunca tem o PIN em texto.
    expect(remote).not.toContain('5678');
    expect(remote).not.toContain('"1234"');
  });

  it('o backup de um perfil leva só os dados dele', async () => {
    const d = new TreinoDB('backup-um-perfil');
    const a = await createProfile(d, 'A', '1111');
    const b = await createProfile(d, 'B', '2222');
    await saveSession(d, session('sa', a.id));
    await saveSession(d, session('sb', b.id));
    const doc = await exportProfileDoc(d, a.id);
    expect(doc.profiles.map((p) => p.id)).toEqual([a.id]);
    expect(doc.sessions.map((s) => s.id)).toEqual(['sa']);
  });

  it('backup exporta e importa os perfis', async () => {
    const d = new TreinoDB('backup-perfis');
    await createProfile(d, 'Rodrigo', '1234');
    const exported = await exportDoc(d);
    const other = new TreinoDB('backup-destino');
    expect(await importDoc(other, parseDoc(JSON.stringify(exported)))).toBe(1);
    expect((await other.profiles.toArray())[0].name).toBe('Rodrigo');
  });
});
