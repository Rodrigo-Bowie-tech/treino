import {
  ARM_BLOCKS,
  EXERCISES,
  FASCIITIS_ALTERNATIVES,
  FASCIITIS_CORE,
  FASCIITIS_STRENGTH,
  WARMUP_FIXED,
  WARMUP_OPENER,
  byCategory,
  findExercise,
  getExercise,
} from '../data/exercises';
import type { Category, Exercise, Phase, Plan, PlanItem, SessionRecord, Settings, Side } from '../types';
import { lastEntries, liveSessions, suggestTarget } from './progress';
import { estimateItem, estimateItems } from './steps';

const BOTH_SIDES: Side[] = ['esquerdo', 'direito'];

/**
 * Tempo (em segundos) de cada bloco para cada duração. O aquecimento tem
 * exatamente esse tempo; o alongamento final usa no máximo isso; na fascite,
 * os alongamentos e o fortalecimento do dia entram sempre e o orçamento limita
 * só os exercícios do pé em rodízio. O resto todo vai para os braços.
 */
export const BUDGETS: Record<Settings['durationMin'], { aquecimento: number; fascite: number; alongamento: number }> = {
  30: { aquecimento: 7 * 60, fascite: 5 * 60, alongamento: 1 * 60 },
  45: { aquecimento: 10 * 60, fascite: 8 * 60, alongamento: 2 * 60 },
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

/** Histórico usado no rodízio: a última vez de cada exercício e quantas vezes entrou nos treinos recentes. */
interface Rotation {
  last: ReturnType<typeof lastEntries>;
  uses: Map<string, number>;
}

/** Quantos treinos recentes contam para desempatar o rodízio. */
const RECENT_SESSIONS = 12;

function rotationOf(sessions: SessionRecord[]): Rotation {
  const uses = new Map<string, number>();
  for (const s of liveSessions(sessions).slice(0, RECENT_SESSIONS)) {
    for (const e of s.entries) if (e.sets.length) uses.set(e.exerciseId, (uses.get(e.exerciseId) ?? 0) + 1);
  }
  return { last: lastEntries(sessions), uses };
}

/**
 * Ordena do exercício feito há mais tempo (ou nunca feito) para o mais recente.
 * Empate (feitos no mesmo treino): primeiro o que entrou menos vezes nos treinos
 * recentes, para o rodízio não ficar preso sempre nos mesmos; depois, o catálogo.
 */
function leastRecent(list: Exercise[], rotation: Rotation): Exercise[] {
  return [...list].sort((a, b) => {
    const la = rotation.last.get(a.id)?.at ?? '';
    const lb = rotation.last.get(b.id)?.at ?? '';
    if (la !== lb) return la < lb ? -1 : 1;
    const ua = rotation.uses.get(a.id) ?? 0;
    const ub = rotation.uses.get(b.id) ?? 0;
    if (ua !== ub) return ua - ub;
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
function buildWarmup(settings: Settings, item: (ex: Exercise, phase: Phase) => PlanItem, rotation: Rotation) {
  const budget = warmupSec(settings.durationMin);
  const fixed = WARMUP_FIXED.map((id) => item(getExercise(id), 'aquecimento'));
  const pool = leastRecent(
    byCategory('aquecimento').filter(
      (ex) => ex.id !== WARMUP_OPENER && !WARMUP_FIXED.includes(ex.id) && isAvailable(ex, settings),
    ),
    rotation,
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
 * os exercícios do pé (toalha, bolinhas, equilíbrio...) em rodízio. No treino
 * de 30 min, tudo fica mais curto (uma série nos alongamentos, duas na elevação).
 */
function buildFasciitis(
  settings: Settings,
  sessions: SessionRecord[],
  item: (ex: Exercise, phase: Phase) => PlanItem,
  rotation: Rotation,
) {
  if (!settings.fasciitis) return [];
  const short = settings.durationMin === 30;
  const make = (ex: Exercise) => {
    const it = item(ex, 'fascite');
    if (short && it.sets > 1) {
      it.sets = ex.kind === 'reps' ? Math.min(it.sets, 2) : 1;
      it.estSec = estimateItem(it);
    }
    return it;
  };
  const lastWithFasciitis = liveSessions(sessions).find((s) => s.entries.some((e) => e.phase === 'fascite'));
  const strengthLastTime = !!lastWithFasciitis?.entries.some((e) => e.exerciseId === FASCIITIS_STRENGTH && e.sets.length);
  const [first, ...restOfCore] = FASCIITIS_CORE.map((id) => getExercise(id));
  // O fortalecimento vem logo depois do alongamento da fáscia e antes do alongamento da panturrilha no degrau.
  const always = [first, ...(strengthLastTime ? [] : [getExercise(FASCIITIS_STRENGTH)]), ...restOfCore].map(make);
  const others = leastRecent(
    byCategory('fascite').filter(
      (ex) =>
        !FASCIITIS_CORE.includes(ex.id) &&
        ex.id !== FASCIITIS_STRENGTH &&
        !FASCIITIS_ALTERNATIVES.includes(ex.id) &&
        isAvailable(ex, settings),
    ),
    rotation,
  );
  return fill(others.map(make), BUDGETS[settings.durationMin].fascite, always);
}

/** Um bloco de braço: um exercício sozinho ou um bi-set de dois. */
type ArmBlock = PlanItem[];

function blockSec(block: ArmBlock): number {
  return estimateItems(block).reduce((t, s) => t + s, 0);
}

/** Recalcula o tempo de cada item do bloco (num bi-set, o descanso entra no primeiro). */
function estimateBlock(block: ArmBlock): void {
  estimateItems(block).forEach((sec, i) => (block[i].estSec = sec));
}

/**
 * Braços em bi-sets (dois exercícios alternando as séries, com um descanso por
 * rodada), o que cabe mais séries no mesmo tempo: bíceps + tríceps primeiro,
 * depois ombros + antebraço, começando pelos exercícios feitos há mais tempo.
 * O que sobrar vira uma rodada (ou série) extra, primeiro nos blocos do começo.
 */
function buildArms(
  settings: Settings,
  sessions: SessionRecord[],
  budget: number,
  item: (ex: Exercise, phase: Phase) => PlanItem,
  rotation: Rotation,
) {
  const chosen = new Set<string>();
  const candidates = (group: Category) =>
    leastRecent(
      EXERCISES.filter((ex) => ex.category === group && isAvailable(ex, settings) && !chosen.has(ex.id)),
      rotation,
    );
  const blocks: ArmBlock[] = [];
  let used = 0;
  let superset = 0;

  // Se o último treino ficou sem ombros (comum no de 30 min), o bloco de ombros + antebraço sobe para o 2º lugar.
  const lastArms = liveSessions(sessions).find((s) => s.entries.some((e) => e.phase === 'bracos' && e.sets.length));
  const hadShoulders =
    !lastArms || lastArms.entries.some((e) => e.phase === 'bracos' && e.sets.length && findExercise(e.exerciseId)?.category === 'ombros');
  const order = [...ARM_BLOCKS];
  const shoulders = order.findIndex((b) => b.includes('ombros'));
  if (!hadShoulders && shoulders > 1) order.splice(1, 0, ...order.splice(shoulders, 1));

  for (const [g1, g2] of order) {
    let picked: ArmBlock | undefined;
    // Bi-set: o primeiro par (do feito há mais tempo) que couber.
    search: for (const a of candidates(g1)) {
      // Dois exercícios de um lado de cada vez no mesmo bi-set demoram demais: com um deles, o par vem antes.
      const partners = candidates(g2).sort((x, y) => Number(!!a.perSide && !!x.perSide) - Number(!!a.perSide && !!y.perSide));
      for (const b of partners) {
        const pair = [item(a, 'bracos'), item(b, 'bracos')];
        pair.forEach((it) => (it.superset = superset));
        if (used + blockSec(pair) <= budget) {
          picked = pair;
          break search;
        }
      }
    }
    // Sem par que caiba (ou sem exercício de um dos grupos): um exercício sozinho.
    if (!picked) {
      for (const ex of [...candidates(g1), ...candidates(g2)]) {
        const single = [item(ex, 'bracos')];
        if (used + blockSec(single) <= budget) {
          picked = single;
          break;
        }
      }
    }
    if (!picked) continue;
    if (picked.length === 2) superset++;
    else picked[0].superset = undefined;
    estimateBlock(picked);
    picked.forEach((it) => chosen.add(it.exerciseId));
    blocks.push(picked);
    used += blockSec(picked);
  }

  // Tempo que sobrou: uma rodada a mais em cada bloco, do primeiro para o último.
  let added = true;
  while (added) {
    added = false;
    for (const block of blocks) {
      const room = block.every((it) => {
        const ex = getExercise(it.exerciseId);
        return ex.kind === 'reps' && it.sets < ex.sets + MAX_EXTRA_SETS;
      });
      if (!room) continue;
      const bigger = block.map((it) => ({ ...it, sets: it.sets + 1 }));
      const extra = blockSec(bigger) - blockSec(block);
      if (used + extra <= budget) {
        block.forEach((it) => it.sets++);
        estimateBlock(block);
        used += extra;
        added = true;
      }
    }
  }

  // Ombros e antebraço por último (a pegada cansada atrapalharia as roscas).
  const late = (b: ArmBlock) => b.some((it) => getExercise(it.exerciseId).category === 'antebraco');
  return [...blocks.filter((b) => !late(b)), ...blocks.filter(late)].flat();
}

/**
 * Monta o treino: aquecimento (15, 10 ou 7 min), bloco de fascite plantar,
 * braços e alongamento final, sem passar da duração escolhida (no máximo 60 min).
 * Os exercícios variam de um treino para outro: entram primeiro os feitos há mais tempo.
 */
export function buildPlan(settings: Settings, sessions: SessionRecord[]): Plan {
  const rotation = rotationOf(sessions);
  const durationMin = settings.durationMin;
  const item = (ex: Exercise, phase: Phase) => makeItem(ex, phase, settings, rotation.last);

  const warmup = buildWarmup(settings, item, rotation);
  const fasciitis = buildFasciitis(settings, sessions, item, rotation);
  const cooldown = fill(
    leastRecent(byCategory('alongamento'), rotation).map((ex) => item(ex, 'alongamento')),
    BUDGETS[durationMin].alongamento,
  ).sort(byCatalog);
  const arms = buildArms(settings, sessions, durationMin * 60 - sum(warmup) - sum(fasciitis) - sum(cooldown), item, rotation);

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
