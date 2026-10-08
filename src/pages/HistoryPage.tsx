import { useState } from 'react';
import { ChevronRight, Dumbbell, Footprints, History, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { LineChart } from '../components/charts';
import { formatDate, formatLongDate, formatShortDate, formatTime } from '../lib/dates';
import { capitalize } from '../lib/format';
import { PainScale } from '../components/PainScale';
import { PHASE_LABELS, findExercise } from '../data/exercises';
import { db, deleteSession, saveSession } from '../db';
import { useSessions } from '../hooks/data';
import { clock } from '../lib/cues';
import { fmtKg, summarizeSets } from '../lib/progress';
import type { EndReason, Phase, SessionEntry, SessionRecord } from '../types';

const END_LABELS: Record<EndReason, { label: string; cls: string }> = {
  concluido: { label: 'Concluído', cls: 'good' },
  limite: { label: 'Limite de 1 h', cls: 'info' },
  encerrado: { label: 'Encerrado antes', cls: 'warning' },
};

function entryText(entry: SessionEntry): string {
  if (entry.sets.some((s) => s.reps != null)) return summarizeSets(entry.sets);
  const secs = entry.sets.map((s) => s.seconds ?? 0);
  const total = secs.reduce((a, b) => a + b, 0);
  return entry.sets.length > 1 ? `${entry.sets.length} × ${Math.round(total / entry.sets.length)} s` : `${total} s`;
}

/** Métrica de evolução de um exercício num treino: maior carga ou, sem carga, a melhor série. */
function metric(entry: SessionEntry): { value: number; kind: 'kg' | 'reps' } | undefined {
  const loads = entry.sets.map((s) => s.load ?? 0).filter((l) => l > 0);
  if (loads.length) return { value: Math.max(...loads), kind: 'kg' };
  const reps = entry.sets.map((s) => s.reps ?? 0).filter((r) => r > 0);
  if (reps.length) return { value: Math.max(...reps), kind: 'reps' };
  return undefined;
}

function SessionDetail({ session, onClose }: { session: SessionRecord; onClose: () => void }) {
  const [pain, setPain] = useState(session.footPain);
  const [notes, setNotes] = useState(session.notes ?? '');
  const phases = (['aquecimento', 'fascite', 'bracos', 'alongamento'] as Phase[])
    .map((p) => ({ phase: p, entries: session.entries.filter((e) => e.phase === p) }))
    .filter((g) => g.entries.length);
  const changed = pain !== session.footPain || notes.trim() !== (session.notes ?? '');

  return (
    <Modal
      open
      onClose={onClose}
      title={capitalize(formatLongDate(new Date(session.startedAt)))}
      footer={
        <>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!confirm('Excluir este treino do histórico? Ele some de todos os aparelhos sincronizados.')) return;
              await deleteSession(db, session.id);
              onClose();
            }}
          >
            <Trash2 size={16} aria-hidden /> Excluir
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            disabled={!changed}
            onClick={async () => {
              await saveSession(db, { ...session, footPain: pain, notes: notes.trim() || undefined });
              onClose();
            }}
          >
            Salvar
          </button>
        </>
      }
    >
      <p className="muted">
        Início às {formatTime(new Date(session.startedAt))} · {clock(session.activeSec)} de treino ·{' '}
        <span className={`badge ${END_LABELS[session.endedBy].cls}`}>{END_LABELS[session.endedBy].label}</span>
      </p>
      {phases.map((g) => (
        <section key={g.phase}>
          <h3 className="section-title">{PHASE_LABELS[g.phase]}</h3>
          <ul className="list">
            {g.entries.map((e) => (
              <li key={e.exerciseId} className="list-item static">
                <span className="main">
                  <span className="title">{findExercise(e.exerciseId)?.name ?? e.exerciseId}</span>
                  <span className="meta">{entryText(e)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="field">
        <span className="field-label">Dor no pé (0 a 10)</span>
        <PainScale value={pain} onChange={setPain} />
      </div>
      <label className="field">
        <span>Anotações</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </Modal>
  );
}

export function HistoryPage() {
  const sessions = useSessions();
  const [open, setOpen] = useState<SessionRecord | null>(null);
  const [exerciseId, setExerciseId] = useState('');

  if (!sessions) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = sessions.filter((s) => s.startedAt >= monthStart).length;
  const avgMin = sessions.length ? Math.round(sessions.reduce((t, s) => t + s.activeSec, 0) / sessions.length / 60) : 0;
  const chronological = [...sessions].reverse();

  const painData = chronological.filter((s) => s.footPain != null).map((s) => ({ x: Date.parse(s.startedAt), values: [s.footPain] }));

  // Exercícios com séries registradas, para o gráfico de evolução.
  const tracked = new Map<string, string>();
  for (const s of chronological) {
    for (const e of s.entries) {
      const ex = findExercise(e.exerciseId);
      if (ex?.kind === 'reps' && metric(e)) tracked.set(ex.id, ex.name);
    }
  }
  const options = [...tracked].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const selected = tracked.has(exerciseId) ? exerciseId : options[0]?.[0];
  const progress = chronological.flatMap((s) => {
    const e = s.entries.find((x) => x.exerciseId === selected);
    const m = e && metric(e);
    return m ? [{ x: Date.parse(s.startedAt), m }] : [];
  });
  const progressKind = progress.some((p) => p.m.kind === 'kg') ? 'kg' : 'reps';
  const progressData = progress.filter((p) => p.m.kind === progressKind).map((p) => ({ x: p.x, values: [p.m.value] }));

  return (
    <>
      <PageHeader title="Histórico" subtitle="Seus treinos de todos os aparelhos sincronizados." />

      {!sessions.length ? (
        <EmptyState icon={History}>
          <p>Nenhum treino ainda. Os treinos concluídos aparecem aqui.</p>
        </EmptyState>
      ) : (
        <>
          <div className="grid-3">
            <div className="stat">
              <span className="stat-label">Treinos</span>
              <span className="stat-value">{sessions.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Este mês</span>
              <span className="stat-value">{thisMonth}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Duração média</span>
              <span className="stat-value">
                {avgMin} <small>min</small>
              </span>
            </div>
          </div>

          {options.length > 0 && (
            <section className="card">
              <div className="card-header">
                <h2>
                  <Dumbbell size={20} aria-hidden /> Evolução
                </h2>
                <select className="input compact" value={selected} onChange={(e) => setExerciseId(e.target.value)} aria-label="Exercício">
                  {options.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {progressData.length >= 2 ? (
                <LineChart
                  data={progressData}
                  series={[{ name: progressKind === 'kg' ? 'Maior carga' : 'Melhor série', color: 'var(--series-1)' }]}
                  formatY={(v) => (progressKind === 'kg' ? fmtKg(v) : `${v} rep.`)}
                  formatX={(x) => formatShortDate(new Date(x))}
                  ariaLabel={`Evolução de ${tracked.get(selected!)}`}
                />
              ) : (
                <p className="muted small">Faça este exercício em mais um treino para ver o gráfico.</p>
              )}
            </section>
          )}

          {painData.length >= 2 && (
            <section className="card">
              <div className="card-header">
                <h2>
                  <Footprints size={20} aria-hidden /> Dor no pé
                </h2>
                <span className="muted small">0 = nenhuma · 10 = a pior</span>
              </div>
              <LineChart
                data={painData}
                series={[{ name: 'Dor', color: 'var(--series-2)' }]}
                formatY={(v) => `${v}`}
                formatX={(x) => formatShortDate(new Date(x))}
                ariaLabel="Evolução da dor no pé"
              />
            </section>
          )}

          <section className="card">
            <h2>Treinos</h2>
            <ul className="list">
              {sessions.map((s) => {
                const arms = s.entries.filter((e) => e.phase === 'bracos').length;
                return (
                  <li key={s.id}>
                    <button type="button" className="list-item" onClick={() => setOpen(s)}>
                      <span className="main">
                        <span className="title">{formatDate(new Date(s.startedAt))}</span>
                        <span className="meta">
                          {clock(s.activeSec)} · {arms} {arms === 1 ? 'exercício' : 'exercícios'} de braço
                          {s.footPain != null ? ` · dor ${s.footPain}/10` : ''}
                        </span>
                      </span>
                      <span className={`badge ${END_LABELS[s.endedBy].cls}`}>{END_LABELS[s.endedBy].label}</span>
                      <ChevronRight size={18} className="muted" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {open && <SessionDetail session={open} onClose={() => setOpen(null)} />}
    </>
  );
}
