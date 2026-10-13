import { describe, expect, it } from 'vitest';
import { getExercise } from '../data/exercises';
import type { RepsExercise, SessionEntry } from '../types';
import { nextLoad, suggestTarget } from './progress';

const curl = getExercise('bi-rosca-direta') as RepsExercise;
const dips = getExercise('tr-mergulho') as RepsExercise;
const entry = (sets: { reps: number; load?: number }[]): SessionEntry => ({ exerciseId: curl.id, phase: 'bracos', sets });

describe('progressão', () => {
  it('na primeira vez pede para escolher o peso', () => {
    const t = suggestTarget(curl, undefined);
    expect(t.reps).toBe(12);
    expect(t.load).toBeUndefined();
    expect(t.note).toContain('escolha um peso');
  });

  it('mantém o peso e pede uma repetição a mais na série mais fraca', () => {
    const t = suggestTarget(curl, entry([{ reps: 12, load: 8 }, { reps: 10, load: 8 }, { reps: 9, load: 8 }]));
    expect(t).toMatchObject({ reps: 10, load: 8 });
    expect(t.note).toContain('12, 10, 9 repetições com 8 kg');
  });

  it('aumenta o peso quando todas as séries chegam ao máximo', () => {
    const t = suggestTarget(curl, entry([{ reps: 12, load: 8 }, { reps: 12, load: 8 }, { reps: 12, load: 8 }]));
    expect(t).toMatchObject({ reps: 8, load: 9 });
    expect(nextLoad(12)).toBe(14);
  });

  it('a série extra não segura nem baixa a progressão', () => {
    const t = suggestTarget(curl, entry([{ reps: 12, load: 8 }, { reps: 12, load: 8 }, { reps: 12, load: 8 }, { reps: 9, load: 8 }]));
    expect(t.load).toBe(9);
    expect(t.reps).toBe(8);
  });

  it('não sobe o peso se faltou alguma série', () => {
    const t = suggestTarget(curl, entry([{ reps: 12, load: 8 }, { reps: 12, load: 8 }]));
    expect(t.load).toBe(8);
  });

  it('a elevação de calcanhar começa sem peso e progride para um pé só ou com peso', () => {
    const heel = getExercise('fa-elevacao') as RepsExercise;
    expect(suggestTarget(heel, undefined).note).toContain('sem peso extra');
    const done = { exerciseId: heel.id, phase: 'fascite' as const, sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }] };
    expect(suggestTarget(heel, done).note).toContain('num pé só');
  });

  it('no treino mais curto (menos séries previstas) também progride', () => {
    const heel = getExercise('fa-elevacao') as RepsExercise;
    const short = { exerciseId: heel.id, phase: 'fascite' as const, sets: [{ reps: 12 }, { reps: 12 }], planned: 2 };
    expect(suggestTarget(heel, short).note).toContain('num pé só');
    // Sem a informação de séries previstas (registros antigos), continua exigindo as do catálogo.
    expect(suggestTarget(heel, { ...short, planned: undefined }).reps).toBe(12);
    const curlShort = suggestTarget(curl, { ...entry([{ reps: 12, load: 8 }, { reps: 12, load: 8 }]), planned: 2 });
    expect(curlShort.load).toBe(9);
  });

  it('sem carga, pede uma versão mais difícil ao chegar no máximo', () => {
    const t = suggestTarget(dips, { exerciseId: dips.id, phase: 'bracos', sets: [{ reps: 15 }, { reps: 15 }, { reps: 15 }] });
    expect(t.reps).toBe(15);
    expect(t.note).toContain('versão mais difícil');
  });
});
