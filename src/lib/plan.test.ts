import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../db';
import { EXERCISES, getExercise } from '../data/exercises';
import type { Plan, SessionRecord, Settings } from '../types';
import { buildPlan, isAvailable, phasesOf, prescription } from './plan';
import { SESSION_LIMIT_SEC, WARMUP_SEC, estimateItem, expandPlan } from './steps';

const settings = (changes: Partial<Settings> = {}): Settings => ({ ...defaultSettings('p1'), configured: true, ...changes });

/** Simula ter feito o treino planejado (todas as séries), para testar a variação. */
function done(plan: Plan, day: number): SessionRecord {
  const startedAt = new Date(2026, 9, day, 18).toISOString();
  return {
    id: `s${day}`,
    startedAt,
    endedAt: startedAt,
    activeSec: plan.totalSec,
    plannedMin: plan.durationMin,
    endedBy: 'concluido',
    entries: plan.items.map((i) => ({
      exerciseId: i.exerciseId,
      phase: i.phase,
      sets: Array.from({ length: i.sets }, () => (i.reps ? { reps: i.reps[1], load: 8 } : { seconds: i.seconds })),
    })),
    updatedAt: day,
  };
}

const combos: Settings[] = [];
for (const durationMin of [30, 45, 60] as const) {
  for (const equipment of [[], ['halteres'], ['halteres', 'elastico', 'barra'], ['elastico']] as Settings['equipment'][]) {
    for (const footSide of ['ambos', 'esquerdo'] as const) {
      for (const fasciitis of [true, false]) combos.push(settings({ durationMin, equipment, footSide, fasciitis }));
    }
  }
}

describe('montagem do treino', () => {
  it('começa sempre com exatamente 15 minutos de aquecimento', () => {
    const plan = buildPlan(settings(), []);
    const phases = phasesOf(plan);
    expect(phases[0].phase).toBe('aquecimento');
    expect(phases[0].seconds).toBe(WARMUP_SEC);
    expect(phases.map((p) => p.phase)).toEqual(['aquecimento', 'fascite', 'bracos', 'alongamento']);
  });

  it('nunca passa da duração escolhida nem de 1 hora', () => {
    for (const s of combos) {
      let sessions: SessionRecord[] = [];
      // Vários treinos seguidos, para cobrir a variação dos exercícios.
      for (let day = 1; day <= 6; day++) {
        const plan = buildPlan(s, sessions);
        expect(plan.totalSec).toBeLessThanOrEqual(s.durationMin * 60);
        expect(plan.totalSec).toBeLessThanOrEqual(SESSION_LIMIT_SEC);
        expect(plan.items.reduce((t, i) => t + i.estSec, 0)).toBe(plan.totalSec);
        sessions = [...sessions, done(plan, day)];
      }
    }
  });

  it('o treino de 60 minutos aproveita bem o tempo e foca nos braços', () => {
    const plan = buildPlan(settings({ equipment: ['halteres'] }), []);
    const phases = Object.fromEntries(phasesOf(plan).map((p) => [p.phase, p]));
    expect(plan.totalSec).toBeGreaterThan(55 * 60);
    expect(phases.bracos.seconds).toBeGreaterThanOrEqual(25 * 60);
    expect(phases.bracos.items.length).toBeGreaterThanOrEqual(6);
    const groups = new Set(phases.bracos.items.map((i) => getExercise(i.exerciseId).category));
    expect(groups).toEqual(new Set(['biceps', 'triceps', 'ombros', 'antebraco']));
  });

  it('inclui sempre os alongamentos da fascite e alterna o fortalecimento', () => {
    let sessions: SessionRecord[] = [];
    const withStrength: boolean[] = [];
    for (let day = 1; day <= 4; day++) {
      const plan = buildPlan(settings(), sessions);
      const ids = plan.items.filter((i) => i.phase === 'fascite').map((i) => i.exerciseId);
      expect(ids).toContain('fa-fascia');
      expect(ids).toContain('fa-panturrilha');
      withStrength.push(ids.includes('fa-elevacao'));
      sessions = [...sessions, done(plan, day)];
    }
    expect(withStrength).toEqual([true, false, true, false]);
  });

  it('faz os exercícios de um lado só no pé com fascite', () => {
    const plan = buildPlan(settings({ footSide: 'direito' }), []);
    const fascia = plan.items.find((i) => i.exerciseId === 'fa-fascia')!;
    expect(fascia.sides).toEqual(['direito']);
    const warmupAnkles = plan.items.find((i) => i.exerciseId === 'aq-tornozelos')!;
    expect(warmupAnkles.sides).toEqual(['esquerdo', 'direito']);
  });

  it('sem fascite, o tempo vai para os braços', () => {
    const withF = buildPlan(settings({ equipment: ['halteres'] }), []);
    const without = buildPlan(settings({ equipment: ['halteres'], fasciitis: false }), []);
    expect(without.items.some((i) => i.phase === 'fascite')).toBe(false);
    const arms = (p: Plan) => p.items.filter((i) => i.phase === 'bracos').length;
    expect(arms(without)).toBeGreaterThan(arms(withF));
  });

  it('usa só os equipamentos disponíveis e troca as alternativas caseiras pelos halteres', () => {
    for (const equipment of [[], ['halteres'], ['elastico']] as Settings['equipment'][]) {
      const s = settings({ equipment });
      const plan = buildPlan(s, []);
      for (const item of plan.items) expect(isAvailable(getExercise(item.exerciseId), s)).toBe(true);
    }
    const withDumbbells = buildPlan(settings({ equipment: ['halteres'] }), []);
    expect(withDumbbells.items.some((i) => i.exerciseId === 'bi-mochila')).toBe(false);
    const home = buildPlan(settings({ equipment: [] }), []);
    expect(home.items.some((i) => getExercise(i.exerciseId).equipment)).toBe(false);
    expect(home.items.filter((i) => i.phase === 'bracos').length).toBeGreaterThanOrEqual(5);
  });

  it('varia os exercícios de braço de um treino para o outro', () => {
    const s = settings({ equipment: ['halteres'] });
    const first = buildPlan(s, []);
    const second = buildPlan(s, [done(first, 1)]);
    const arms = (p: Plan) => p.items.filter((i) => i.phase === 'bracos').map((i) => i.exerciseId);
    expect(arms(second)).not.toEqual(arms(first));
    expect(arms(second)[0]).not.toBe(arms(first)[0]);
  });

  it('usa o descanso escolhido nos braços', () => {
    const plan = buildPlan(settings({ equipment: ['halteres'], restSec: 90 }), []);
    const curl = plan.items.find((i) => i.exerciseId === 'bi-rosca-direta')!;
    expect(curl.restSec).toBe(90);
    // Barra fixa tem descanso próprio.
    const plan2 = buildPlan(settings({ equipment: ['barra'] }), []);
    expect(plan2.items.find((i) => i.exerciseId === 'bi-barra-supinada')?.restSec).toBe(90);
  });

  it('a estimativa de cada item bate com as etapas do player', () => {
    const plan = buildPlan(settings({ equipment: ['halteres'] }), []);
    for (const item of plan.items) expect(estimateItem(item)).toBe(item.estSec);
    const steps = expandPlan(plan);
    const curl = plan.items.findIndex((i) => i.exerciseId === 'bi-rosca-direta');
    expect(steps.filter((s) => s.item === curl).map((s) => s.kind)).toEqual(['prep', 'serie', 'descanso', 'serie', 'descanso', 'serie']);
    const warm = steps.filter((s) => plan.items[s.item].phase === 'aquecimento');
    expect(warm.every((s) => s.kind === 'tempo')).toBe(true);
  });

  it('descreve a prescrição', () => {
    const plan = buildPlan(settings({ equipment: ['halteres'] }), []);
    const text = (id: string) => prescription(plan.items.find((i) => i.exerciseId === id)!);
    expect(text('aq-marcha')).toBe('2 min');
    expect(text('aq-circulos-bracos')).toBe('1,5 min');
    expect(text('aq-tornozelos')).toBe('30 s cada lado');
    expect(text('fa-fascia')).toBe('2 × 30 s cada lado');
    expect(text('bi-rosca-direta')).toBe('3 × 8–12');
    expect(text('tr-coice')).toBe('3 × 10–12 cada lado');
  });

  it('o catálogo não tem ids repetidos e todo exercício tem instruções', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EXERCISES) expect(e.steps.length).toBeGreaterThan(0);
  });
});
