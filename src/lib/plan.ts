import { ARM_GROUP_ORDER, EXERCISES, FASCIITIS_CORE, byCategory, getExercise } from '../data/exercises';
import type { Exercise, Phase, Plan, PlanItem, SessionRecord, Settings, Side } from '../types';
import { lastEntries, liveSessions, suggestTarget } from './progress';
import { estimateItem } from './steps';

const BOTH_SIDES: Side[] = ['esquerdo', 'direito'];

/** Tempo máximo, em segundos, dos blocos de fascite e de alongamento final para cada duração. */
const BUDGETS: Record<Settings['durationMin'], { fascite: number; alongamento: number }> = {
  30: { fascite: 300, alongamento: 120 },
  45: { fascite: 660, alongamento: 180 },
  60: { fascite: 660, alongamento: 240 },
};

/** Exercício de fortalecimento da fascite, feito em treinos alternados (dia sim, dia não). */
const FASCIITIS_STRENGTH = 'fa-elevacao';

const catalogIndex = new Map(EXERCISES.map((e, i) => [e.id, i]));

export function isAvailable(ex: Exercise, settings: Settings): boolean {
  if (ex.equipment && !settings.equipment.includes(ex.equipment)) return false;
  if (ex.replaces && settings.equipment.includes(ex.replaces)) return false;
  return true;
}

function sidesFor(ex: Exercise, settings: Settings): Side[] | undefined {
  if (!ex.perSide) return undefined;
  if (ex.category === 'fascite' && settings.footSide !== 'ambos') return [settings.footSide];
  return BOTH_SIDES;
}

function restFor(ex: Exercise, phase: Phase, settings: Settings): number {
  if (ex.restSec != null) return ex.restSec;
  if (phase === 'bracos') return settings.restSec;
  return ex.kind === 'reps' ? 30 : 0;
}

export function makeItem(
  ex: Exercise,
  phase: Phase,
  settings: Settings,
  history: ReturnType<typeof lastEntries> = new Map(),
): PlanItem {
  const base = {
    exerciseId: ex.id,
    phase,
    restSec: restFor(ex, phase, settings),
    sides: sidesFor(ex, settings),
  };
  const item: PlanItem =
    ex.kind === 'tempo'
      ? { ...base, sets: ex.sets ?? 1, seconds: ex.seconds, estSec: 0 }
      : { ...base, sets: ex.sets, reps: ex.reps, target: suggestTarget(ex, history.get(ex.id)?.entry), estSec: 0 };
  item.estSec = estimateItem(item);
  return item;
}

/** Ordena do exercício feito há mais tempo (ou nunca feito) para o mais recente; empate segue o catálogo. */
function leastRecent(list: Exercise[], history: ReturnType<typeof lastEntries>): Exercise[] {
  return [...list].sort((a, b) => {
    const la = history.get(a.id)?.at ?? '';
    const lb = history.get(b.id)?.at ?? '';
    if (la !== lb) return la < lb ? -1 : 1;
    return catalogIndex.get(a.id)! - catalogIndex.get(b.id)!;
  });
}

function sum(items: PlanItem[]): number {
  return items.reduce((t, i) => t + i.estSec, 0);
}

/** Acrescenta itens, na ordem dada, enquanto couberem no orçamento. */
function fill(candidates: PlanItem[], budget: number, start: PlanItem[] = []): PlanItem[] {
  const chosen = [...start];
  let used = sum(chosen);
  for (const item of candidates) {
    if (used + item.estSec <= budget) {
      chosen.push(item);
      used += item.estSec;
    }
  }
  return chosen;
}

/**
 * Monta o treino: 15 min de aquecimento, bloco de fascite plantar, braços e
 * alongamento final, sem passar da duração escolhida (no máximo 60 min).
 * Os exercícios variam de um treino para outro: entram primeiro os feitos há mais tempo.
 */
export function buildPlan(settings: Settings, sessions: SessionRecord[]): Plan {
  const history = lastEntries(sessions);
  const durationMin = settings.durationMin;
  const budget = BUDGETS[durationMin];
  const item = (ex: Exercise, phase: Phase) => makeItem(ex, phase, settings, history);

  const warmup = byCategory('aquecimento').map((ex) => item(ex, 'aquecimento'));

  let fasciitis: PlanItem[] = [];
  if (settings.fasciitis) {
    const core = FASCIITIS_CORE.map((id) => item(getExercise(id), 'fascite'));
    const lastWithFasciitis = liveSessions(sessions).find((s) => s.entries.some((e) => e.phase === 'fascite'));
    const strengthLastTime = !!lastWithFasciitis?.entries.some((e) => e.exerciseId === FASCIITIS_STRENGTH && e.sets.length);
    const others = leastRecent(
      byCategory('fascite').filter((ex) => !FASCIITIS_CORE.includes(ex.id) && ex.id !== FASCIITIS_STRENGTH),
      history,
    );
    const strength = getExercise(FASCIITIS_STRENGTH);
    const order = strengthLastTime ? [...others, strength] : [strength, ...others];
    fasciitis = fill(
      order.map((ex) => item(ex, 'fascite')),
      budget.fascite,
      core,
    );
  }

  const cooldown = fill(
    leastRecent(byCategory('alongamento'), history).map((ex) => item(ex, 'alongamento')),
    budget.alongamento,
  ).sort((a, b) => catalogIndex.get(a.exerciseId)! - catalogIndex.get(b.exerciseId)!);

  const armBudget = durationMin * 60 - sum(warmup) - sum(fasciitis) - sum(cooldown);
  const arms: PlanItem[] = [];
  const chosen = new Set<string>();
  let used = 0;
  let added = true;
  while (added) {
    added = false;
    for (const group of ARM_GROUP_ORDER) {
      const candidates = leastRecent(
        byCategory(group).filter((ex) => isAvailable(ex, settings) && !chosen.has(ex.id)),
        history,
      );
      for (const ex of candidates) {
        const it = item(ex, 'bracos');
        if (used + it.estSec <= armBudget) {
          arms.push(it);
          chosen.add(ex.id);
          used += it.estSec;
          added = true;
          break;
        }
      }
    }
  }

  const items = [...warmup, ...fasciitis, ...arms, ...cooldown];
  return { durationMin, items, totalSec: sum(items) };
}

export interface PhaseSummary {
  phase: Phase;
  items: PlanItem[];
  seconds: number;
}

export function phasesOf(plan: Plan): PhaseSummary[] {
  const out: PhaseSummary[] = [];
  for (const it of plan.items) {
    let last = out[out.length - 1];
    if (!last || last.phase !== it.phase) {
      last = { phase: it.phase, items: [], seconds: 0 };
      out.push(last);
    }
    last.items.push(it);
    last.seconds += it.estSec;
  }
  return out;
}

/** Texto curto da prescrição: "3 × 8–12", "2 × 30 s cada lado", "2 min". */
export function prescription(item: PlanItem): string {
  const each = item.sides && item.sides.length > 1 ? ' cada lado' : item.sides?.length === 1 ? ` (${item.sides[0]})` : '';
  if (item.reps) {
    const [min, max] = item.reps;
    return `${item.sets} × ${min === max ? min : `${min}–${max}`}${each}`;
  }
  const secs = item.seconds ?? 0;
  const time = secs >= 60 && secs % 30 === 0 ? `${(secs / 60).toLocaleString('pt-BR')} min` : `${secs} s`;
  return item.sets > 1 ? `${item.sets} × ${time}${each}` : `${time}${each}`;
}
