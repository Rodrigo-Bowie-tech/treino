import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../db';
import { buildPlan, warmupSec } from './plan';
import {
  abandonedRecord,
  activeMs,
  addTime,
  currentPhase,
  currentStep,
  isAbandoned,
  isFinished,
  jumpToPhase,
  limitReached,
  logSet,
  next,
  pause,
  resume,
  startSession,
  stepRemainingMs,
  stepsOf,
  tick,
  toRecord,
  IDLE_ABANDON_MS,
  type ActiveSession,
} from './session';
import { SESSION_LIMIT_SEC } from './steps';

const T0 = Date.UTC(2026, 9, 8, 18);
const plan = buildPlan({ ...defaultSettings('p1'), configured: true, equipment: ['halteres'] }, []);
const start = () => startSession(plan, T0, 'abc', 'p1');
/** O trote que abre o aquecimento (um passo por tempo, sem lados). */
const OPENER = plan.items[0].seconds!;
/** O segundo passo: mobilidade dos braços, 60 s. */
const SECOND = plan.items[1].seconds!;
const sec = (n: number) => n * 1000;

/** Avança o relógio até a primeira série de repetições. */
function toFirstSerie(s: ActiveSession): { s: ActiveSession; at: number } {
  let at = T0;
  let cur = s;
  while (currentStep(cur)!.kind !== 'serie') {
    at += stepRemainingMs(cur, at);
    cur = tick(cur, at).session;
  }
  return { s: cur, at };
}

describe('treino em andamento', () => {
  it('a contagem regressiva avança sozinha pelas etapas por tempo', () => {
    const s = start();
    expect(plan.items[0].exerciseId).toBe('aq-trote');
    expect(plan.items[1].exerciseId).toBe('aq-mobilidade');
    expect(OPENER).toBeGreaterThanOrEqual(60);
    expect(currentStep(s)).toMatchObject({ kind: 'tempo', seconds: OPENER });
    expect(stepRemainingMs(s, T0 + sec(30))).toBe(sec(OPENER - 30));
    const { session, advanced } = tick(s, T0 + sec(OPENER + 1));
    expect(advanced).toBe(true);
    expect(session.index).toBe(1);
    expect(stepRemainingMs(session, T0 + sec(OPENER + 1))).toBe(sec(SECOND - 1));
    expect(session.log).toEqual([{ item: 0, set: 1, side: undefined, data: { seconds: OPENER }, at: T0 + sec(OPENER) }]);
  });

  it('o aquecimento leva 15 minutos no treino de 1 hora e depois vem a fascite', () => {
    expect(warmupSec(60)).toBe(15 * 60);
    const at = T0 + sec(warmupSec(60));
    const s = tick(start(), at).session;
    expect(currentPhase(s)).toBe('fascite');
    expect(currentStep(s)!.kind).toBe('prep');
    expect(activeMs(s, at)).toBe(sec(warmupSec(60)));
  });

  it('as pausas não contam no tempo nem no cronômetro da etapa', () => {
    let s = start();
    s = pause(s, T0 + sec(60));
    expect(activeMs(s, T0 + sec(600))).toBe(sec(60));
    expect(tick(s, T0 + sec(600)).advanced).toBe(false);
    s = resume(s, T0 + sec(600));
    expect(activeMs(s, T0 + sec(610))).toBe(sec(70));
    expect(stepRemainingMs(s, T0 + sec(610))).toBe(sec(OPENER - 70));
  });

  it('+15 s estende a etapa atual', () => {
    const s = addTime(start(), 15);
    expect(stepRemainingMs(s, T0)).toBe(sec(OPENER + 15));
    expect(tick(s, T0 + sec(OPENER + 1)).advanced).toBe(false);
  });

  it('pular registra o tempo já feito do exercício', () => {
    const s = next(start(), T0 + sec(40));
    expect(s.index).toBe(1);
    expect(s.log[0].data).toEqual({ seconds: 40 });
  });

  it('para nas séries de repetições até o registro', () => {
    const { s, at } = toFirstSerie(start());
    expect(tick(s, at + sec(600)).advanced).toBe(false);
    const after = logSet(s, { reps: 10, load: 8 }, at + sec(60));
    expect(after.index).toBe(s.index + 1);
    const step = currentStep(s)!;
    expect(after.log.at(-1)).toEqual({ item: step.item, set: 1, data: { reps: 10, load: 8 }, at: at + sec(60) });
  });

  it('no bi-set alterna as séries dos dois exercícios e registra cada um', () => {
    let s = start();
    const curl = plan.items.findIndex((i) => i.exerciseId === 'bi-rosca-direta');
    const partner = curl + 1;
    expect(plan.items[partner].superset).toBe(plan.items[curl].superset);
    let at = T0;
    // Pula até a primeira série da rosca.
    while (!(currentStep(s)!.kind === 'serie' && currentStep(s)!.item === curl)) {
      at += 1000;
      s = currentStep(s)!.kind === 'serie' ? logSet(s, { reps: 10 }, at) : next(s, at);
    }
    s = logSet(s, { reps: 12, load: 8 }, (at += 1000));
    expect(currentStep(s)).toMatchObject({ kind: 'prep', item: partner, switch: true });
    s = tick(s, (at += 16_000)).session; // a troca leva 15 s
    expect(currentStep(s)).toMatchObject({ kind: 'serie', item: partner, set: 1 });
    s = logSet(s, { reps: 11, load: 6 }, (at += 1000));
    expect(currentStep(s)).toMatchObject({ kind: 'descanso', item: curl, set: 1 });
    s = next(s, (at += 1000));
    expect(currentStep(s)).toMatchObject({ kind: 'serie', item: curl, set: 2 });
    const record = toRecord(s, at, 'encerrado');
    expect(record.entries.find((e) => e.exerciseId === 'bi-rosca-direta')!.sets).toEqual([{ reps: 12, load: 8 }]);
    expect(record.entries.find((e) => e.exerciseId === plan.items[partner].exerciseId)!.sets).toEqual([{ reps: 11, load: 6 }]);
  });

  it('limita o treino a 1 hora', () => {
    const s = start();
    expect(limitReached(s, T0 + sec(SESSION_LIMIT_SEC - 1))).toBe(false);
    expect(limitReached(s, T0 + sec(SESSION_LIMIT_SEC))).toBe(true);
    const paused = pause(s, T0 + sec(1800));
    expect(limitReached(paused, T0 + sec(SESSION_LIMIT_SEC * 2))).toBe(false);
    const record = toRecord(s, T0 + sec(SESSION_LIMIT_SEC + 300), 'limite');
    expect(record.activeSec).toBe(SESSION_LIMIT_SEC);
  });

  it('o relógio não avança etapas além do limite de 1 hora', () => {
    let s = start();
    // Pula direto para o alongamento final e deixa o tempo correr muito além do limite.
    s = jumpToPhase(s, 'alongamento', T0 + sec(SESSION_LIMIT_SEC - 30));
    const before = s.index;
    s = tick(s, T0 + sec(SESSION_LIMIT_SEC * 3)).session;
    expect(s.index).toBeLessThanOrEqual(before + 1);
  });

  it('ir para o alongamento final pula o resto', () => {
    const s = jumpToPhase(start(), 'alongamento', T0 + sec(100));
    expect(currentPhase(s)).toBe('alongamento');
    // Não volta para trás.
    expect(jumpToPhase(s, 'aquecimento', T0 + sec(200))).toBe(s);
  });

  it('termina ao passar da última etapa e gera o registro do histórico', () => {
    let s = start();
    let at = T0;
    for (let guard = 0; !isFinished(s) && guard < 1000; guard++) {
      // Pula cada etapa por tempo depois de 10 s (menos de 5 s não conta como feito).
      const serie = currentStep(s)!.kind === 'serie';
      at += serie ? 1000 : 10_000;
      s = serie ? logSet(s, { reps: 12, load: 6 }, at) : next(s, at);
    }
    expect(isFinished(s)).toBe(true);
    const record = toRecord(s, at, 'concluido');
    expect(record.entries.map((e) => e.exerciseId)).toEqual(plan.items.map((i) => i.exerciseId));
    const curl = record.entries.find((e) => e.exerciseId === 'bi-rosca-direta')!;
    const planned = plan.items.find((i) => i.exerciseId === 'bi-rosca-direta')!.sets;
    expect(curl.sets).toEqual(Array.from({ length: planned }, () => ({ reps: 12, load: 6 })));
    expect(record.startedAt).toBe(new Date(T0).toISOString());
    expect(record.profileId).toBe('p1');
    expect(stepsOf(s).length).toBeGreaterThan(plan.items.length);
  });

  it('treino abandonado: salva com o tempo até o último registro', () => {
    let s = start();
    s = next(s, T0 + sec(50)); // trote: 50 s
    s = next(s, T0 + sec(80)); // mobilidade: 30 s
    // App fechado; reaberto no dia seguinte, parado numa etapa por tempo que já "terminou".
    const later = T0 + sec(24 * 3600);
    expect(isAbandoned(s, later)).toBe(true);
    // Pausado (por exemplo, ao abrir um vídeo): só é dado como interrompido depois de horas parado.
    const paused = pause(s, T0 + sec(90));
    expect(isAbandoned(paused, T0 + sec(90) + 60 * 60 * 1000)).toBe(false);
    expect(isAbandoned(paused, T0 + sec(90) + IDLE_ABANDON_MS + 1000)).toBe(true);
    expect(abandonedRecord(paused, later).activeSec).toBe(90);
    const record = abandonedRecord(s, later);
    expect(record.activeSec).toBe(80);
    expect(record.endedBy).toBe('encerrado');
    expect(record.entries.map((e) => e.exerciseId)).toEqual(['aq-trote', 'aq-mobilidade']);
  });
});
