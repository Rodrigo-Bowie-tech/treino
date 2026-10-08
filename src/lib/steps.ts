import { getExercise } from '../data/exercises';
import type { Phase, Plan, PlanItem, Side } from '../types';

/** Limite de cada treino: 1 hora de treino (as pausas não contam). */
export const SESSION_LIMIT_SEC = 60 * 60;
/** Todo treino começa com 15 minutos de aquecimento. */
export const WARMUP_SEC = 15 * 60;
/** Avisos antes do limite, em segundos de treino. */
export const LIMIT_WARNINGS_SEC = [50 * 60, 55 * 60];

/** Tempo para se posicionar/pegar o material antes de cada exercício. */
export const PREP_SEC: Record<Phase, number> = {
  aquecimento: 0,
  fascite: 15,
  bracos: 15,
  alongamento: 0,
};

const DEFAULT_SEC_PER_REP = 3;

/** Uma etapa do player: o treino é uma sequência dessas etapas. */
export type Step =
  | { kind: 'prep'; item: number; seconds: number }
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

export function itemSteps(item: PlanItem, index: number): Step[] {
  const ex = getExercise(item.exerciseId);
  const steps: Step[] = [];
  const prep = PREP_SEC[item.phase];
  if (prep > 0) steps.push({ kind: 'prep', item: index, seconds: prep });
  for (let set = 1; set <= item.sets; set++) {
    if (ex.kind === 'tempo') {
      for (const side of item.sides ?? [undefined]) {
        steps.push({ kind: 'tempo', item: index, set, side, seconds: item.seconds ?? ex.seconds });
      }
    } else {
      steps.push({ kind: 'serie', item: index, set });
    }
    if (set < item.sets && item.restSec > 0) steps.push({ kind: 'descanso', item: index, set, seconds: item.restSec });
  }
  return steps;
}

export function stepSeconds(step: Step, plan: Plan): number {
  return isTimed(step) ? step.seconds : serieWorkSec(plan.items[step.item]);
}

export function estimateItem(item: PlanItem): number {
  return itemSteps(item, 0).reduce(
    (sum, step) => sum + (isTimed(step) ? step.seconds : serieWorkSec(item)),
    0,
  );
}

export function expandPlan(plan: Plan): Step[] {
  return plan.items.flatMap((item, i) => itemSteps(item, i));
}
