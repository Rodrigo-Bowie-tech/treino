import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from './Modal';
import { PHASE_LABELS, getExercise } from '../data/exercises';
import { phasesOf, prescription } from '../lib/plan';
import type { Exercise, Plan } from '../types';
import { ExerciseInfo } from './ExerciseInfo';

export function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

/** Lista do treino por blocos; tocar num exercício mostra como fazer. */
export function PlanView({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState<Exercise | null>(null);
  return (
    <>
      {phasesOf(plan).map((ph) => (
        <section key={ph.phase} className={`phase phase-${ph.phase}`}>
          <div className="phase-head">
            <h3>{PHASE_LABELS[ph.phase]}</h3>
            <span className="muted small">{minutes(ph.seconds)}</span>
          </div>
          <ul className="list">
            {ph.items.map((item) => {
              const ex = getExercise(item.exerciseId);
              return (
                <li key={item.exerciseId}>
                  <button type="button" className="list-item" onClick={() => setOpen(ex)}>
                    <span className="main">
                      <span className="title">{ex.name}</span>
                      <span className="meta">
                        {prescription(item)}
                        {item.target?.load ? ` · ${item.target.load.toLocaleString('pt-BR')} kg` : ''}
                      </span>
                    </span>
                    <ChevronRight size={18} className="muted" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && <ExerciseInfo ex={open} />}
      </Modal>
    </>
  );
}
