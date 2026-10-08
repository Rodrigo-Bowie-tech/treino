import type { RepsExercise, SessionEntry, SessionRecord, SetLog, Target } from '../types';

export function fmtKg(kg: number): string {
  return `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

/** Próximo peso: +1 kg nos pesos leves, +2 kg a partir de 10 kg. */
export function nextLoad(load: number): number {
  return load < 10 ? load + 1 : load + 2;
}

function doneSets(entry: SessionEntry | undefined): SetLog[] {
  return (entry?.sets ?? []).filter((s) => (s.reps ?? 0) > 0);
}

export function summarizeSets(sets: SetLog[]): string {
  const reps = sets.map((s) => s.reps ?? 0).join(', ');
  const loads = sets.map((s) => s.load ?? 0).filter((l) => l > 0);
  const load = loads.length ? Math.max(...loads) : 0;
  return `${reps} repetições${load ? ` com ${fmtKg(load)}` : ''}`;
}

/**
 * Meta da próxima vez (progressão dupla): mantém o peso até conseguir o máximo
 * da faixa de repetições em todas as séries; aí aumenta o peso e volta ao mínimo.
 */
export function suggestTarget(ex: RepsExercise, last: SessionEntry | undefined): Target {
  const [min, max] = ex.reps;
  const sets = doneSets(last);
  if (!sets.length) {
    if (ex.bodyweightFirst) return { reps: max, note: `Primeira vez: sem peso extra, ${max} repetições bem lentas.` };
    return ex.load
      ? {
          reps: max,
          note: `Primeira vez: escolha um peso que permita ${max} repetições com boa técnica, terminando com 1 ou 2 de sobra.`,
        }
      : { reps: min, note: `Faça de ${min} a ${max} repetições com boa técnica.` };
  }

  const loads = sets.map((s) => s.load ?? 0);
  const load = Math.max(...loads) || undefined;
  const atTop = sets.length >= ex.sets && sets.every((s) => (s.reps ?? 0) >= max);

  if (atTop && ex.load) {
    if (!load) {
      return ex.bodyweightFirst
        ? { reps: min, note: `Você fez ${max} repetições em todas as séries: faça só com o pé afetado ou acrescente peso numa mochila e volte a ${min}.` }
        : { reps: min, note: `Você fez ${max} repetições em todas as séries: acrescente peso e volte a ${min}.` };
    }
    const next = nextLoad(load);
    return {
      reps: min,
      load: next,
      note: `Você fez ${sets.length} × ${max} com ${fmtKg(load)}: suba para ${fmtKg(next)} (ou o próximo peso que tiver) e volte a ${min} repetições.`,
    };
  }
  if (atTop) {
    return {
      reps: max,
      note: `Você fez ${max} repetições em todas as séries: desça mais devagar (4 s) ou passe para a versão mais difícil.`,
    };
  }

  const weakest = Math.min(...sets.map((s) => s.reps ?? 0));
  const reps = Math.min(max, Math.max(min, weakest + 1));
  return {
    reps,
    load,
    note: `Última vez: ${summarizeSets(sets)}. Meta: ${reps} repetições em todas as séries${load ? ` com ${fmtKg(load)}` : ''}.`,
  };
}

/** Sessões válidas (não excluídas), da mais recente para a mais antiga. */
export function liveSessions(sessions: SessionRecord[]): SessionRecord[] {
  return sessions.filter((s) => !s.deleted).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Última vez que cada exercício foi feito (com ao menos uma série), por id. */
export function lastEntries(sessions: SessionRecord[]): Map<string, { at: string; entry: SessionEntry }> {
  const map = new Map<string, { at: string; entry: SessionEntry }>();
  for (const s of liveSessions(sessions)) {
    for (const entry of s.entries) {
      if (entry.sets.length && !map.has(entry.exerciseId)) map.set(entry.exerciseId, { at: s.startedAt, entry });
    }
  }
  return map;
}
