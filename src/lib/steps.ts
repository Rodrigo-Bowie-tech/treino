import { getExercise } from '../data/exercises';
import type { Phase, Plan, PlanItem, Side } from '../types';

/** Limite de cada treino: 1 hora de treino (as pausas não contam). */
export const SESSION_LIMIT_SEC = 60 * 60;
/** Avisos antes do limite, em segundos de treino. */
export const LIMIT_WARNINGS_SEC = [50 * 60, 55 * 60];

/** Tempo para se posicionar/pegar o material antes de cada exercício. */
export const PREP_SEC: Record<Phase, number> = {
  aquecimento: 0,
  fascite: 15,
  bracos: 15,
  alongamento: 0,
};

/** Num bi-set, tempo para trocar de um exercício para o outro. */
export const SWITCH_SEC = 15;

const DEFAULT_SEC_PER_REP = 3;

/** Uma etapa do player: o treino é uma sequência dessas etapas. */
export type Step =
  | { kind: 'prep'; item: number; seconds: number; /** Troca de exercício dentro do bi-set. */ switch?: boolean }
  | { kind: 'tempo'; item: number; set: number; side?: Side; seconds: number }
  | { kind: 'serie'; item: number; set: number }
  | { kind: 'descanso'; item: number; set: number; seconds: number };

export type TimedStep = Exclude<Step, { kind: 'serie' }>;

export function isTimed(step: Step): step is TimedStep {
  return step.kind !== 'serie';
}

/** Tempo estimado de uma série de repetições (os dois lados, quando for o caso). */
export function serieWorkSec(item: PlanItem): number {
  const ex = getExercise(item.exerciseId);
  if (ex.kind !== 'reps' || !item.reps) return 0;
  return item.reps[1] * (ex.secPerRep ?? DEFAULT_SEC_PER_REP) * (item.sides?.length ?? 1);
}

/** As etapas de trabalho de uma série (uma por lado nos exercícios por tempo). */
function workSteps(item: PlanItem, index: number, set: number): Step[] {
  const ex = getExercise(item.exerciseId);
  if (ex.kind === 'reps') return [{ kind: 'serie', item: index, set }];
  return (item.sides ?? [undefined]).map((side) => ({ kind: 'tempo', item: index, set, side, seconds: item.seconds ?? ex.seconds }));
}

export function itemSteps(item: PlanItem, index: number): Step[] {
  const steps: Step[] = [];
  const prep = PREP_SEC[item.phase];
  if (prep > 0) steps.push({ kind: 'prep', item: index, seconds: prep });
  for (let set = 1; set <= item.sets; set++) {
    steps.push(...workSteps(item, index, set));
    if (set < item.sets && item.restSec > 0) steps.push({ kind: 'descanso', item: index, set, seconds: item.restSec });
  }
  return steps;
}

/** Bi-set: série do primeiro, troca, série do segundo, descanso, e assim por diante. */
function supersetSteps(a: PlanItem, b: PlanItem, index: number): Step[] {
  const steps: Step[] = [];
  const prep = PREP_SEC[a.phase];
  if (prep > 0) steps.push({ kind: 'prep', item: index, seconds: prep });
  const rounds = Math.max(a.sets, b.sets);
  for (let set = 1; set <= rounds; set++) {
    if (set <= a.sets) steps.push(...workSteps(a, index, set));
    if (set <= b.sets) {
      if (set <= a.sets) steps.push({ kind: 'prep', item: index + 1, seconds: SWITCH_SEC, switch: true });
      steps.push(...workSteps(b, index + 1, set));
    }
    if (set < rounds && a.restSec > 0) steps.push({ kind: 'descanso', item: index, set, seconds: a.restSec });
  }
  return steps;
}

/** O segundo item do bi-set que começa em `index`, se houver. */
export function supersetPartner(items: PlanItem[], index: number): number | undefined {
  const it = items[index];
  if (it?.superset == null) return undefined;
  if (items[index + 1]?.superset === it.superset) return index + 1;
  if (items[index - 1]?.superset === it.superset) return index - 1;
  return undefined;
}

/** Etapas de uma lista de itens (os bi-sets intercalados). */
export function expandItems(items: PlanItem[]): Step[] {
  const steps: Step[] = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (a.superset != null && b?.superset === a.superset) {
      steps.push(...supersetSteps(a, b, i));
      i++;
    } else {
      steps.push(...itemSteps(a, i));
    }
  }
  return steps;
}

export function stepSeconds(step: Step, plan: Plan): number {
  return isTimed(step) ? step.seconds : serieWorkSec(plan.items[step.item]);
}

/** Tempo estimado de cada item da lista, pelas etapas do player. */
export function estimateItems(items: PlanItem[]): number[] {
  const out = items.map(() => 0);
  for (const step of expandItems(items)) out[step.item] += isTimed(step) ? step.seconds : serieWorkSec(items[step.item]);
  return out;
}

/** Tempo estimado de um item feito sozinho (fora de bi-set). */
export function estimateItem(item: PlanItem): number {
  return estimateItems([{ ...item, superset: undefined }])[0];
}

export function expandPlan(plan: Plan): Step[] {
  return expandItems(plan.items);
}
