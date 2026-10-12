import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../db';
import { EXERCISES, findExercise, getExercise } from '../data/exercises';
import type { Plan, SessionRecord, Settings } from '../types';
import { buildPlan, isAvailable, makeItem, phasesOf, prescription, warmupSec } from './plan';
import { SESSION_LIMIT_SEC, SWITCH_SEC, estimateItems, expandPlan } from './steps';
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

/** Vários treinos seguidos com os mesmos ajustes, cada um feito por completo. */
function chain(s: Settings, days: number): Plan[] {
  const plans: Plan[] = [];
  let sessions: SessionRecord[] = [];
  for (let day = 1; day <= days; day++) {
    const plan = buildPlan(s, sessions);
    plans.push(plan);
    sessions = [...sessions, done(plan, day)];
  }
  return plans;
}

const armsOf = (p: Plan) => p.items.filter((i) => i.phase === 'bracos');
const setsOf = (p: Plan, category: string) =>
  armsOf(p)
    .filter((i) => getExercise(i.exerciseId).category === category)
    .reduce((t, i) => t + i.sets, 0);

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
    for (const plan of chain(settings({ equipment: ['halteres', 'banco'] }), 10)) {
      const phases = Object.fromEntries(phasesOf(plan).map((p) => [p.phase, p]));
      expect(plan.totalSec).toBeGreaterThan(57 * 60);
      expect(phases.bracos.seconds).toBeGreaterThanOrEqual(30 * 60);
      expect(armsOf(plan).reduce((t, i) => t + i.sets, 0)).toBeGreaterThanOrEqual(24);
      expect(setsOf(plan, 'biceps')).toBeGreaterThanOrEqual(9);
      expect(setsOf(plan, 'triceps')).toBeGreaterThanOrEqual(9);
      expect(setsOf(plan, 'ombros')).toBeGreaterThanOrEqual(3);
      expect(setsOf(plan, 'antebraco')).toBeGreaterThanOrEqual(3);
    }
  });

  it('nos treinos de 30 e 45 minutos os braços continuam sendo a maior parte', () => {
    const minimum = { 30: { min: 14.5, sets: 12 }, 45: { min: 21, sets: 15 }, 60: { min: 30, sets: 24 } };
    for (const durationMin of [30, 45, 60] as const) {
      for (const footSide of ['ambos', 'direito'] as const) {
        for (const plan of chain(settings({ durationMin, footSide, equipment: ['halteres', 'banco'] }), 8)) {
          const phases = phasesOf(plan);
          const arms = phases.find((p) => p.phase === 'bracos')!;
          expect(plan.totalSec).toBeGreaterThan((durationMin - 2.5) * 60);
          for (const other of phases) if (other !== arms) expect(arms.seconds).toBeGreaterThan(other.seconds);
          expect(arms.seconds).toBeGreaterThanOrEqual(plan.totalSec * 0.48);
          expect(arms.seconds).toBeGreaterThanOrEqual(minimum[durationMin].min * 60);
          expect(armsOf(plan).reduce((t, i) => t + i.sets, 0)).toBeGreaterThanOrEqual(minimum[durationMin].sets);
          expect(setsOf(plan, 'biceps')).toBeGreaterThanOrEqual(6);
          expect(setsOf(plan, 'triceps')).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it('os braços são feitos em bi-sets: bíceps com tríceps, ombros com antebraço', () => {
    for (const plan of chain(settings({ equipment: ['halteres', 'banco'] }), 6)) {
      const arms = armsOf(plan);
      const pairs = new Map<number, string[]>();
      for (const it of arms) {
        if (it.superset == null) continue;
        pairs.set(it.superset, [...(pairs.get(it.superset) ?? []), getExercise(it.exerciseId).category]);
      }
      expect(pairs.size).toBeGreaterThanOrEqual(3);
      for (const cats of pairs.values()) {
        expect([['biceps', 'triceps'], ['ombros', 'antebraco']]).toContainEqual(cats);
      }
      // Os dois itens de cada bi-set ficam lado a lado e com o mesmo número de séries.
      arms.forEach((it, i) => {
        if (it.superset == null) return;
        const partner = arms.find((o, j) => j !== i && o.superset === it.superset)!;
        expect(Math.abs(arms.indexOf(partner) - i)).toBe(1);
        expect(partner.sets).toBe(it.sets);
      });
      // Ombros e antebraço por último: a pegada cansada atrapalharia as roscas.
      const cats = arms.map((i) => getExercise(i.exerciseId).category);
      const lastCurl = cats.lastIndexOf('biceps');
      const firstForearm = cats.indexOf('antebraco');
      if (firstForearm >= 0) expect(firstForearm).toBeGreaterThan(lastCurl);
    }
  });

  it('o tempo que sobra vira séries extras, no máximo uma a mais por exercício', () => {
    for (const s of combos) {
      for (const plan of chain(s, 3)) {
        for (const item of plan.items) {
          const ex = getExercise(item.exerciseId);
          if (item.phase === 'bracos' && ex.kind === 'reps') {
            expect(item.sets).toBeGreaterThanOrEqual(ex.sets);
            expect(item.sets).toBeLessThanOrEqual(ex.sets + 1);
          } else if (item.phase === 'fascite' && s.durationMin === 30) {
            // No treino de 30 min a fascite fica mais curta.
            expect(item.sets).toBe(ex.kind === 'reps' ? Math.min(ex.sets, 2) : 1);
          } else {
            expect(item.sets).toBe(ex.sets ?? 1);
          }
        }
      }
    }
  });

  it('em toda duração: alongamentos da fascite sempre e o fortalecimento no degrau de 2 em 2 treinos', () => {
    for (const durationMin of [30, 45, 60] as const) {
      for (const footSide of ['ambos', 'esquerdo'] as const) {
        const withStrength: boolean[] = [];
        for (const plan of chain(settings({ durationMin, footSide, equipment: ['halteres', 'banco'] }), 6)) {
          const ids = plan.items.filter((i) => i.phase === 'fascite').map((i) => i.exerciseId);
          expect(ids[0]).toBe('fa-fascia');
          expect(ids).toContain('fa-alongamento-degrau');
          // Os alongamentos alternativos (sem degrau) não tomam o lugar dos exercícios do pé.
          expect(ids).not.toContain('fa-panturrilha');
          expect(ids).not.toContain('fa-toalha-alongamento');
          withStrength.push(ids.includes('fa-elevacao'));
          // O fortalecimento vem antes do alongamento no degrau.
          if (ids.includes('fa-elevacao')) expect(ids.indexOf('fa-elevacao')).toBeLessThan(ids.indexOf('fa-alongamento-degrau'));
        }
        expect(withStrength).toEqual([true, false, true, false, true, false]);
      }
    }
  });

  it('nos dias sem fortalecimento entram os exercícios do pé com toalha e bolinha', () => {
    for (const durationMin of [30, 45, 60] as const) {
      const [, second] = chain(settings({ durationMin, equipment: ['halteres', 'banco'] }), 2);
      const ids = second.items.filter((i) => i.phase === 'fascite').map((i) => i.exerciseId);
      expect(ids).not.toContain('fa-elevacao');
      expect(ids.length).toBeGreaterThanOrEqual(durationMin === 30 ? 3 : 4);
      expect(ids).toContain('fa-rolar');
      if (durationMin > 30) expect(ids).toContain('fa-toalha-dedos');
    }
  });

  it('o rodízio do pé respeita o orçamento; os alongamentos e o fortalecimento entram sempre', () => {
    const budget = { 30: 300, 45: 480, 60: 600 };
    for (const s of combos.filter((c) => c.fasciitis)) {
      for (const plan of chain(s, 4)) {
        const fasciitis = plan.items.filter((i) => i.phase === 'fascite');
        const always = fasciitis.filter((i) => ['fa-fascia', 'fa-alongamento-degrau', 'fa-elevacao'].includes(i.exerciseId));
        const rotation = fasciitis.filter((i) => !always.includes(i));
        const total = (list: typeof fasciitis) => list.reduce((t, i) => t + i.estSec, 0);
        if (rotation.length) expect(total(fasciitis)).toBeLessThanOrEqual(budget[s.durationMin]);
        // O bloco obrigatório nunca passa de 10 min.
        expect(total(always)).toBeLessThanOrEqual(10 * 60);
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
    const armSets = (p: Plan) => armsOf(p).reduce((t, i) => t + i.sets, 0);
    expect(armSets(without)).toBeGreaterThan(armSets(withF));
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
    for (const s of combos) {
      for (const plan of chain(s, 2)) expect(estimateItems(plan.items)).toEqual(plan.items.map((i) => i.estSec));
    }
    const plan = buildPlan(settings({ equipment: ['halteres'] }), []);
    const steps = expandPlan(plan);
    // Bi-set: série de um, troca, série do outro, descanso, e assim por diante.
    const curl = plan.items.findIndex((i) => i.exerciseId === 'bi-rosca-direta');
    expect(plan.items[curl + 1].superset).toBe(plan.items[curl].superset);
    const pair = steps.filter((st) => st.item === curl || st.item === curl + 1);
    const rounds = plan.items[curl].sets;
    const expected = [{ kind: 'prep', item: curl }];
    for (let set = 1; set <= rounds; set++) {
      expected.push({ kind: 'serie', item: curl }, { kind: 'prep', item: curl + 1 }, { kind: 'serie', item: curl + 1 });
      if (set < rounds) expected.push({ kind: 'descanso', item: curl });
    }
    expect(pair.map((st) => ({ kind: st.kind, item: st.item }))).toEqual(expected);
    expect(pair.filter((st) => st.kind === 'prep' && st.item === curl + 1).every((st) => st.kind === 'prep' && st.switch && st.seconds === SWITCH_SEC)).toBe(true);
    // Os passos de cada bi-set ficam juntos (nada de outro exercício no meio).
    const firstOfPair = steps.findIndex((st) => st.item === curl);
    expect(steps.slice(firstOfPair, firstOfPair + pair.length)).toEqual(pair);
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
