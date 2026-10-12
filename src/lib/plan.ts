import {
  ARM_GROUP_ORDER,
  EXERCISES,
  FASCIITIS_CORE,
  FASCIITIS_STRENGTH,
  WARMUP_FIXED,
  WARMUP_OPENER,
  byCategory,
  getExercise,
} from '../data/exercises';
import type { Exercise, Phase, Plan, PlanItem, SessionRecord, Settings, Side } from '../types';
import { lastEntries, liveSessions, suggestTarget } from './progress';
import { estimateItem } from './steps';

const BOTH_SIDES: Side[] = ['esquerdo', 'direito'];

/**
 * Tempo (em segundos) de cada bloco para cada duração. O aquecimento tem
 * exatamente esse tempo; fascite e alongamento usam no máximo isso; o resto
 * todo vai para os braços.
 */
export const BUDGETS: Record<Settings['durationMin'], { aquecimento: number; fascite: number; alongamento: number }> = {
  30: { aquecimento: 7 * 60, fascite: 4 * 60, alongamento: 2 * 60 },
  45: { aquecimento: 10 * 60, fascite: 8.5 * 60, alongamento: 2 * 60 },
  60: { aquecimento: 15 * 60, fascite: 10 * 60, alongamento: 3 * 60 },
};

/** Duração do aquecimento: 15 min no treino de 60, 10 no de 45 e 7 no de 30. */
export function warmupSec(durationMin: Settings['durationMin']): number {
  return BUDGETS[durationMin].aquecimento;
}

/** O trote que abre o aquecimento tem pelo menos 1 min. */
const MIN_OPENER_SEC = 60;
/** Séries a mais que um exercício de braço pode ganhar quando sobra tempo. */
const MAX_EXTRA_SETS = 1;

const catalogIndex = new Map(EXERCISES.map((e, i) => [e.id, i]));

export function isAvailable(ex: Exercise, settings: Settings): boolean {
  if (ex.equipment?.some((eq) => !settings.equipment.includes(eq))) return false;
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

const byCatalog = (a: PlanItem, b: PlanItem) => catalogIndex.get(a.exerciseId)! - catalogIndex.get(b.exerciseId)!;

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
 * Aquecimento com exatamente o tempo da duração escolhida: mobilidade,
 * polichinelo e prancha sempre; os outros exercícios variam de um treino para
 * outro; o trote do começo completa o tempo.
 */
function buildWarmup(settings: Settings, item: (ex: Exercise, phase: Phase) => PlanItem, history: ReturnType<typeof lastEntries>) {
  const budget = warmupSec(settings.durationMin);
  const fixed = WARMUP_FIXED.map((id) => item(getExercise(id), 'aquecimento'));
  const pool = leastRecent(
    byCategory('aquecimento').filter(
      (ex) => ex.id !== WARMUP_OPENER && !WARMUP_FIXED.includes(ex.id) && isAvailable(ex, settings),
    ),
    history,
  );
  const chosen = fill(
    pool.map((ex) => item(ex, 'aquecimento')),
    budget - MIN_OPENER_SEC,
    fixed,
  ).sort(byCatalog);
  const opener = item(getExercise(WARMUP_OPENER), 'aquecimento');
  opener.seconds = budget - sum(chosen);
  opener.estSec = estimateItem(opener);
  return [opener, ...chosen];
}

/**
 * Fascite: alongamento da fáscia e da panturrilha no degrau em todo treino; a
 * elevação de calcanhar no degrau de 2 em 2 treinos; e, no tempo que sobrar,
 * os exercícios do pé (toalha, bolinhas, equilíbrio...) em rodízio.
 */
function buildFasciitis(
  settings: Settings,
  sessions: SessionRecord[],
  item: (ex: Exercise, phase: Phase) => PlanItem,
  history: ReturnType<typeof lastEntries>,
) {
  if (!settings.fasciitis) return [];
  const lastWithFasciitis = liveSessions(sessions).find((s) => s.entries.some((e) => e.phase === 'fascite'));
  const strengthLastTime = !!lastWithFasciitis?.entries.some((e) => e.exerciseId === FASCIITIS_STRENGTH && e.sets.length);
  const [first, ...restOfCore] = FASCIITIS_CORE.map((id) => getExercise(id));
  const others = leastRecent(
    byCategory('fascite').filter(
      (ex) => !FASCIITIS_CORE.includes(ex.id) && ex.id !== FASCIITIS_STRENGTH && isAvailable(ex, settings),
    ),
    history,
  );
  // O fortalecimento vem logo depois do alongamento da fáscia e antes do alongamento da panturrilha no degrau.
  const order = [first, ...(strengthLastTime ? [] : [getExercise(FASCIITIS_STRENGTH)]), ...restOfCore, ...others];
  return fill(
    order.map((ex) => item(ex, 'fascite')),
    BUDGETS[settings.durationMin].fascite,
  );
}

/**
 * Braços: um exercício por vez de cada grupo (bíceps, tríceps, ombros, bíceps,
 * tríceps, antebraço...), começando pelos feitos há mais tempo, até preencher o
 * tempo. O que sobrar vira séries extras, primeiro nos exercícios do começo.
 */
function buildArms(settings: Settings, budget: number, item: (ex: Exercise, phase: Phase) => PlanItem, history: ReturnType<typeof lastEntries>) {
  const arms: PlanItem[] = [];
  const chosen = new Set<string>();
  let used = 0;
  for (const group of ARM_GROUP_ORDER) {
    const candidates = leastRecent(
      byCategory(group).filter((ex) => isAvailable(ex, settings) && !chosen.has(ex.id)),
      history,
    );
    for (const ex of candidates) {
      const it = item(ex, 'bracos');
      if (used + it.estSec <= budget) {
        arms.push(it);
        chosen.add(ex.id);
        used += it.estSec;
        break;
      }
    }
  }

  let added = true;
  while (added) {
    added = false;
    for (const it of arms) {
      const ex = getExercise(it.exerciseId);
      if (ex.kind !== 'reps' || it.sets >= ex.sets + MAX_EXTRA_SETS) continue;
      const bigger = { ...it, sets: it.sets + 1 };
      const est = estimateItem(bigger);
      if (used - it.estSec + est <= budget) {
        used += est - it.estSec;
        it.sets = bigger.sets;
        it.estSec = est;
        added = true;
      }
    }
  }
  return arms;
}

/**
 * Monta o treino: aquecimento (15, 10 ou 7 min), bloco de fascite plantar,
 * braços e alongamento final, sem passar da duração escolhida (no máximo 60 min).
 * Os exercícios variam de um treino para outro: entram primeiro os feitos há mais tempo.
 */
export function buildPlan(settings: Settings, sessions: SessionRecord[]): Plan {
  const history = lastEntries(sessions);
  const durationMin = settings.durationMin;
  const item = (ex: Exercise, phase: Phase) => makeItem(ex, phase, settings, history);

  const warmup = buildWarmup(settings, item, history);
  const fasciitis = buildFasciitis(settings, sessions, item, history);
  const cooldown = fill(
    leastRecent(byCategory('alongamento'), history).map((ex) => item(ex, 'alongamento')),
    BUDGETS[durationMin].alongamento,
  ).sort(byCatalog);
  const arms = buildArms(settings, durationMin * 60 - sum(warmup) - sum(fasciitis) - sum(cooldown), item, history);

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
