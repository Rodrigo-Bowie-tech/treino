import type { EndReason, Phase, Plan, SessionEntry, SessionRecord, SetLog, Side } from '../types';
import { SESSION_LIMIT_SEC, expandPlan, isTimed, type Step } from './steps';

export interface LoggedSet {
  item: number;
  set: number;
  side?: Side;
  data: SetLog;
  /** Quando foi registrado (ms). */
  at: number;
}

/** Treino em andamento (fica salvo no aparelho para sobreviver a um recarregamento). */
export interface ActiveSession {
  id: string;
  /** Perfil que está treinando. */
  profileId: string;
  startedAt: number;
  plan: Plan;
  index: number;
  /** Quando a etapa atual começou (ms). */
  stepStartedAt: number;
  /** Tempo pausado dentro da etapa atual (ms). */
  stepPausedMs: number;
  /** Segundos acrescentados à etapa atual (+15 s). */
  extraSec: number;
  pausedAt?: number;
  pausedMs: number;
  log: LoggedSet[];
  /** Avisos de tempo já dados (segundos). */
  warned: number[];
}

export function startSession(plan: Plan, now: number, id: string, profileId: string): ActiveSession {
  return { id, profileId, startedAt: now, plan, index: 0, stepStartedAt: now, stepPausedMs: 0, extraSec: 0, pausedMs: 0, log: [], warned: [] };
}

const stepsCache = new WeakMap<Plan, Step[]>();

export function stepsOf(s: ActiveSession): Step[] {
  let steps = stepsCache.get(s.plan);
  if (!steps) {
    steps = expandPlan(s.plan);
    stepsCache.set(s.plan, steps);
  }
  return steps;
}

export function currentStep(s: ActiveSession): Step | undefined {
  return stepsOf(s)[s.index];
}

/** Tempo de treino, sem as pausas (ms). */
export function activeMs(s: ActiveSession, now: number): number {
  return (s.pausedAt ?? now) - s.startedAt - s.pausedMs;
}

export function limitReached(s: ActiveSession, now: number): boolean {
  return activeMs(s, now) >= SESSION_LIMIT_SEC * 1000;
}

function stepElapsedMs(s: ActiveSession, now: number): number {
  return (s.pausedAt ?? now) - s.stepStartedAt - s.stepPausedMs;
}

/** Duração total da etapa por tempo atual (com os segundos extras). */
export function stepDurationMs(s: ActiveSession): number {
  const step = currentStep(s);
  return step && isTimed(step) ? (step.seconds + s.extraSec) * 1000 : 0;
}

/** Tempo restante da etapa por tempo atual (ms); 0 nas séries por repetição. */
export function stepRemainingMs(s: ActiveSession, now: number): number {
  const step = currentStep(s);
  if (!step || !isTimed(step)) return 0;
  const duration = stepDurationMs(s);
  return Math.min(duration, Math.max(0, duration - stepElapsedMs(s, now)));
}

export function isFinished(s: ActiveSession): boolean {
  return s.index >= stepsOf(s).length;
}

function goTo(s: ActiveSession, index: number, startAt: number): ActiveSession {
  return { ...s, index, stepStartedAt: startAt, stepPausedMs: 0, extraSec: 0 };
}

function logTimed(s: ActiveSession, seconds: number, at: number): LoggedSet[] {
  const step = currentStep(s);
  if (!step || step.kind !== 'tempo' || seconds < 5) return s.log;
  const log = s.log.filter((l) => !(l.item === step.item && l.set === step.set && l.side === step.side));
  return [...log, { item: step.item, set: step.set, side: step.side, data: { seconds: Math.round(seconds) }, at }];
}

/** Avança para a próxima etapa (pular). O tempo já feito de um exercício por tempo é registrado. */
export function next(s: ActiveSession, now: number): ActiveSession {
  const resumed = resume(s, now);
  const done = Math.min(stepElapsedMs(resumed, now), stepDurationMs(resumed)) / 1000;
  return goTo({ ...resumed, log: logTimed(resumed, done, now) }, s.index + 1, now);
}

export function previous(s: ActiveSession, now: number): ActiveSession {
  return goTo(resume(s, now), Math.max(0, s.index - 1), now);
}

export function pause(s: ActiveSession, now: number): ActiveSession {
  return s.pausedAt != null ? s : { ...s, pausedAt: now };
}

export function resume(s: ActiveSession, now: number): ActiveSession {
  if (s.pausedAt == null) return s;
  const paused = now - s.pausedAt;
  return { ...s, pausedAt: undefined, pausedMs: s.pausedMs + paused, stepPausedMs: s.stepPausedMs + paused };
}

export function addTime(s: ActiveSession, seconds: number): ActiveSession {
  return { ...s, extraSec: s.extraSec + seconds };
}

/** Registra a série de repetições atual e avança. */
export function logSet(s: ActiveSession, data: SetLog, now: number): ActiveSession {
  const step = currentStep(s);
  if (!step || step.kind !== 'serie') return s;
  const log = s.log.filter((l) => !(l.item === step.item && l.set === step.set));
  return goTo(resume({ ...s, log: [...log, { item: step.item, set: step.set, data, at: now }] }, now), s.index + 1, now);
}

/**
 * Faz o relógio andar: etapas por tempo que já terminaram são concluídas
 * (inclusive enquanto a tela esteve apagada). Para nas séries por repetição.
 */
export function tick(s: ActiveSession, now: number): { session: ActiveSession; advanced: boolean } {
  let cur = s;
  let advanced = false;
  for (let guard = 0; guard < 500 && cur.pausedAt == null && !isFinished(cur); guard++) {
    const step = currentStep(cur)!;
    if (!isTimed(step)) break;
    const end = cur.stepStartedAt + cur.stepPausedMs + stepDurationMs(cur);
    const limitAt = cur.startedAt + cur.pausedMs + SESSION_LIMIT_SEC * 1000;
    if (end > now || end > limitAt) break;
    const log = logTimed(cur, stepDurationMs(cur) / 1000, end);
    cur = goTo({ ...cur, log }, cur.index + 1, end);
    advanced = true;
  }
  return { session: cur, advanced };
}

/** Pula para o primeiro exercício de um bloco (ex.: ir direto ao alongamento final). */
export function jumpToPhase(s: ActiveSession, phase: Phase, now: number): ActiveSession {
  const steps = stepsOf(s);
  const index = steps.findIndex((st) => s.plan.items[st.item].phase === phase);
  return index < 0 || index <= s.index ? s : goTo(resume(s, now), index, now);
}

export function currentPhase(s: ActiveSession): Phase | undefined {
  const step = currentStep(s);
  return step ? s.plan.items[step.item].phase : undefined;
}

/**
 * Treino que ficou aberto (app fechado no meio) e já passou do limite.
 * O tempo real é estimado pelo último registro feito.
 */
export function isAbandoned(s: ActiveSession, now: number): boolean {
  return limitReached(s, now);
}

export function abandonedRecord(s: ActiveSession, now: number): SessionRecord {
  const lastAt = s.log.reduce((t, l) => Math.max(t, l.at ?? 0), s.startedAt);
  return { ...toRecord(s, Math.min(now, lastAt), 'encerrado'), endedAt: new Date(now).toISOString() };
}

/** Converte o treino em andamento no registro que vai para o histórico. */
export function toRecord(s: ActiveSession, now: number, endedBy: EndReason): SessionRecord {
  const entries: SessionEntry[] = [];
  s.plan.items.forEach((item, i) => {
    const sets = s.log
      .filter((l) => l.item === i)
      .sort((a, b) => a.set - b.set || (a.side ?? '').localeCompare(b.side ?? ''))
      .map((l) => l.data);
    if (sets.length) entries.push({ exerciseId: item.exerciseId, phase: item.phase, sets });
  });
  const active = Math.min(activeMs(s, now), SESSION_LIMIT_SEC * 1000);
  return {
    id: s.id,
    profileId: s.profileId,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(now).toISOString(),
    activeSec: Math.round(active / 1000),
    plannedMin: s.plan.durationMin,
    endedBy,
    entries,
    updatedAt: now,
  };
}
