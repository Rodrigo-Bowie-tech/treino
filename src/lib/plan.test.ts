import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../db';
import { EXERCISES, findExercise, getExercise } from '../data/exercises';
import type { Plan, SessionRecord, Settings } from '../types';
import { buildPlan, isAvailable, makeItem, phasesOf, prescription, warmupSec } from './plan';
import { SESSION_LIMIT_SEC, estimateItem, expandPlan } from './steps';
import { videoUrl } from './video';

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
  for (const equipment of [[], ['halteres'], ['halteres', 'banco'], ['halteres', 'banco', 'elastico', 'barra'], ['elastico']] as Settings['equipment'][]) {
    for (const footSide of ['ambos', 'esquerdo'] as const) {
      for (const fasciitis of [true, false]) combos.push(settings({ durationMin, equipment, footSide, fasciitis }));
    }
  }
}

describe('montagem do treino', () => {
  it('o aquecimento encolhe com a duração: 15, 10 ou 7 minutos exatos', () => {
    expect([60, 45, 30].map((d) => warmupSec(d as Settings['durationMin']))).toEqual([15 * 60, 10 * 60, 7 * 60]);
    for (const s of combos) {
      let sessions: SessionRecord[] = [];
      for (let day = 1; day <= 4; day++) {
        const plan = buildPlan(s, sessions);
        const phases = phasesOf(plan);
        expect(phases[0].phase).toBe('aquecimento');
        expect(phases[0].seconds).toBe(warmupSec(s.durationMin));
        expect(plan.items[0].exerciseId).toBe('aq-trote');
        expect(plan.items[0].seconds).toBeGreaterThanOrEqual(60);
        sessions = [...sessions, done(plan, day)];
      }
    }
    const phases = phasesOf(buildPlan(settings(), []));
    expect(phases.map((p) => p.phase)).toEqual(['aquecimento', 'fascite', 'bracos', 'alongamento']);
  });

  it('o aquecimento faz suar: polichinelo e prancha sempre, e varia o resto', () => {
    const s = settings({ equipment: ['halteres', 'banco'] });
    const warm = (p: Plan) => p.items.filter((i) => i.phase === 'aquecimento').map((i) => i.exerciseId);
    for (const durationMin of [30, 45, 60] as const) {
      const ids = warm(buildPlan({ ...s, durationMin }, []));
      expect(ids).toEqual(expect.arrayContaining(['aq-mobilidade', 'aq-polichinelo', 'aq-prancha']));
      expect(ids.length).toBeGreaterThanOrEqual(5);
    }
    const first = buildPlan(s, []);
    expect(warm(buildPlan(s, [done(first, 1)]))).not.toEqual(warm(first));
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
    const plan = buildPlan(settings({ equipment: ['halteres', 'banco'] }), []);
    const phases = Object.fromEntries(phasesOf(plan).map((p) => [p.phase, p]));
    expect(plan.totalSec).toBeGreaterThan(58 * 60);
    expect(phases.bracos.seconds).toBeGreaterThanOrEqual(30 * 60);
    expect(phases.bracos.items.length).toBeGreaterThanOrEqual(7);
    expect(phases.bracos.items.reduce((t, i) => t + i.sets, 0)).toBeGreaterThanOrEqual(21);
    const groups = phases.bracos.items.map((i) => getExercise(i.exerciseId).category);
    expect(new Set(groups)).toEqual(new Set(['biceps', 'triceps', 'ombros', 'antebraco']));
    expect(groups.filter((g) => g === 'biceps').length).toBeGreaterThanOrEqual(3);
    expect(groups.filter((g) => g === 'triceps').length).toBeGreaterThanOrEqual(2);
  });

  it('nos treinos de 30 e 45 minutos os braços ficam com mais da metade do tempo', () => {
    const minimum = { 30: { min: 15, items: 4 }, 45: { min: 22, items: 5 }, 60: { min: 30, items: 7 } };
    for (const durationMin of [30, 45, 60] as const) {
      for (const sessions of [[], [done(buildPlan(settings({ durationMin }), []), 1)]]) {
        const plan = buildPlan(settings({ durationMin, equipment: ['halteres', 'banco'] }), sessions);
        const arms = plan.items.filter((i) => i.phase === 'bracos');
        const armSec = arms.reduce((t, i) => t + i.estSec, 0);
        expect(plan.totalSec).toBeGreaterThan((durationMin - 2) * 60);
        expect(armSec).toBeGreaterThan(plan.totalSec / 2);
        expect(armSec).toBeGreaterThanOrEqual(minimum[durationMin].min * 60);
        expect(arms.length).toBeGreaterThanOrEqual(minimum[durationMin].items);
      }
    }
  });

  it('o tempo que sobra vira séries extras, no máximo uma a mais por exercício', () => {
    for (const s of combos) {
      for (const item of buildPlan(s, []).items) {
        const ex = getExercise(item.exerciseId);
        if (item.phase === 'bracos' && ex.kind === 'reps') {
          expect(item.sets).toBeGreaterThanOrEqual(ex.sets);
          expect(item.sets).toBeLessThanOrEqual(ex.sets + 1);
        } else {
          expect(item.sets).toBe(ex.sets ?? 1);
        }
      }
    }
    const plan = buildPlan(settings({ equipment: ['halteres', 'banco'] }), []);
    expect(plan.items.some((i) => i.phase === 'bracos' && i.sets === 4)).toBe(true);
  });

  it('inclui sempre os alongamentos da fascite e alterna o fortalecimento no degrau', () => {
    let sessions: SessionRecord[] = [];
    const withStrength: boolean[] = [];
    for (let day = 1; day <= 4; day++) {
      const plan = buildPlan(settings(), sessions);
      const ids = plan.items.filter((i) => i.phase === 'fascite').map((i) => i.exerciseId);
      expect(ids.slice(0, 1)).toEqual(['fa-fascia']);
      expect(ids).toContain('fa-alongamento-degrau');
      withStrength.push(ids.includes('fa-elevacao'));
      sessions = [...sessions, done(plan, day)];
    }
    expect(withStrength).toEqual([true, false, true, false]);
  });

  it('nos dias sem fortalecimento entram os exercícios do pé com toalha e bolinha', () => {
    const s = settings({ equipment: ['halteres', 'banco'] });
    const first = buildPlan(s, []);
    const second = buildPlan(s, [done(first, 1)]);
    const ids = second.items.filter((i) => i.phase === 'fascite').map((i) => i.exerciseId);
    expect(ids).not.toContain('fa-elevacao');
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids).toEqual(expect.arrayContaining(['fa-rolar', 'fa-toalha-dedos']));
  });

  it('em todas as durações a fascite cabe no orçamento e mantém o alongamento da fáscia', () => {
    for (const s of combos.filter((c) => c.fasciitis)) {
      let sessions: SessionRecord[] = [];
      for (let day = 1; day <= 4; day++) {
        const plan = buildPlan(s, sessions);
        const fasciitis = plan.items.filter((i) => i.phase === 'fascite');
        expect(fasciitis[0]?.exerciseId).toBe('fa-fascia');
        expect(fasciitis.reduce((t, i) => t + i.estSec, 0)).toBeLessThanOrEqual({ 30: 240, 45: 510, 60: 600 }[s.durationMin]);
        sessions = [...sessions, done(plan, day)];
      }
    }
  });

  it('faz os exercícios de um lado só no pé com fascite', () => {
    const plan = buildPlan(settings({ footSide: 'direito' }), []);
    const fascia = plan.items.find((i) => i.exerciseId === 'fa-fascia')!;
    expect(fascia.sides).toEqual(['direito']);
    for (const item of plan.items.filter((i) => i.sides)) {
      expect(item.sides).toEqual(item.phase === 'fascite' ? ['direito'] : ['esquerdo', 'direito']);
    }
    expect(plan.items.some((i) => i.phase !== 'fascite' && i.sides)).toBe(true);
  });

  it('sem fascite, o tempo vai para os braços', () => {
    const withF = buildPlan(settings({ equipment: ['halteres'] }), []);
    const without = buildPlan(settings({ equipment: ['halteres'], fasciitis: false }), []);
    expect(without.items.some((i) => i.phase === 'fascite')).toBe(false);
    const arms = (p: Plan) => p.items.filter((i) => i.phase === 'bracos').length;
    expect(arms(without)).toBeGreaterThan(arms(withF));
  });

  it('usa só os equipamentos disponíveis e troca as alternativas caseiras pelos halteres', () => {
    for (const equipment of [[], ['halteres'], ['halteres', 'banco'], ['elastico']] as Settings['equipment'][]) {
      const s = settings({ equipment });
      const plan = buildPlan(s, []);
      for (const item of plan.items) expect(isAvailable(getExercise(item.exerciseId), s)).toBe(true);
    }
    const withDumbbells = buildPlan(settings({ equipment: ['halteres'] }), []);
    expect(withDumbbells.items.some((i) => i.exerciseId === 'bi-mochila')).toBe(false);
    const home = buildPlan(settings({ equipment: [] }), []);
    expect(home.items.some((i) => getExercise(i.exerciseId).equipment)).toBe(false);
    expect(home.items.filter((i) => i.phase === 'bracos').length).toBeGreaterThanOrEqual(5);
    // Os exercícios no banco só entram para quem tem banco.
    const needsBench = (p: Plan) => p.items.some((i) => getExercise(i.exerciseId).equipment?.includes('banco'));
    let sessions: SessionRecord[] = [];
    let benchSeen = false;
    for (let day = 1; day <= 4; day++) {
      const noBench = buildPlan(settings({ equipment: ['halteres'] }), sessions);
      expect(needsBench(noBench)).toBe(false);
      const bench = buildPlan(settings({ equipment: ['halteres', 'banco'] }), sessions);
      benchSeen ||= needsBench(bench);
      sessions = [...sessions, done(bench, day)];
    }
    expect(benchSeen).toBe(true);
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
    const series = Array.from({ length: plan.items[curl].sets }, () => ['serie', 'descanso']).flat().slice(0, -1);
    expect(steps.filter((s) => s.item === curl).map((s) => s.kind)).toEqual(['prep', ...series]);
    const warm = steps.filter((s) => plan.items[s.item].phase === 'aquecimento');
    // Aquecimento corrido: só etapas por tempo (exercício e descanso curto entre as séries).
    expect(warm.every((s) => s.kind === 'tempo' || s.kind === 'descanso')).toBe(true);
    expect(warm.some((s) => s.kind === 'descanso')).toBe(true);
  });

  it('descreve a prescrição', () => {
    const s = settings({ equipment: ['halteres', 'banco'] });
    const text = (id: string, phase: Plan['items'][number]['phase']) => prescription(makeItem(getExercise(id), phase, s));
    expect(text('aq-trote', 'aquecimento')).toBe('2 min');
    expect(text('aq-mobilidade', 'aquecimento')).toBe('1 min');
    expect(text('aq-polichinelo', 'aquecimento')).toBe('2 × 40 s');
    expect(text('fa-fascia', 'fascite')).toBe('2 × 30 s cada lado');
    expect(text('fa-alongamento-degrau', 'fascite')).toBe('2 × 30 s');
    expect(text('bi-rosca-direta', 'bracos')).toBe('3 × 8–12');
    expect(text('bi-21', 'bracos')).toBe('3 × 21');
    expect(text('tr-coice', 'bracos')).toBe('3 × 10–12 cada lado');
    const plan = buildPlan(s, []);
    expect(prescription(plan.items[0])).toMatch(/^(\d+ s|\d+(,5)? min)$/);
  });

  it('o catálogo não tem ids repetidos e todo exercício tem instruções e vídeo', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EXERCISES) {
      expect(e.steps.length).toBeGreaterThan(0);
      const url = new URL(videoUrl(e));
      expect(url.origin + url.pathname).toBe('https://www.youtube.com/results');
      expect(url.searchParams.get('search_query')).toBe(e.video ?? `${e.name} como fazer`);
      expect(e.video?.length).toBeGreaterThan(5);
    }
  });

  it('muitos exercícios de braço com halteres e banco', () => {
    const count = (cat: string) =>
      EXERCISES.filter((e) => e.category === cat && e.equipment?.every((eq) => eq === 'halteres' || eq === 'banco')).length;
    expect(count('biceps')).toBeGreaterThanOrEqual(8);
    expect(count('triceps')).toBeGreaterThanOrEqual(5);
    expect(count('ombros')).toBeGreaterThanOrEqual(5);
    expect(count('antebraco')).toBeGreaterThanOrEqual(4);
  });

  it('exercícios que saíram do programa continuam com nome para o histórico, mas não entram no treino', () => {
    expect(findExercise('aq-marcha')?.name).toBe('Marcha no lugar');
    expect(EXERCISES.some((e) => e.id === 'aq-marcha')).toBe(false);
    for (const s of combos) {
      for (const item of buildPlan(s, []).items) expect(EXERCISES.some((e) => e.id === item.exerciseId)).toBe(true);
    }
  });
});
