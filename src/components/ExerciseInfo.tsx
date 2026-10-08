import { AlertTriangle, Lightbulb } from 'lucide-react';
import { CATEGORY_LABELS, EQUIPMENT_LABELS } from '../data/exercises';
import type { Exercise } from '../types';

export function ExerciseTags({ ex }: { ex: Exercise }) {
  return (
    <div className="tags">
      <span className="tag">{CATEGORY_LABELS[ex.category]}</span>
      {ex.equipment ? <span className="tag">{EQUIPMENT_LABELS[ex.equipment]}</span> : <span className="tag">Sem equipamento</span>}
      {ex.seated && <span className="tag">Sentado ou deitado</span>}
      {ex.perSide && <span className="tag">Um lado de cada vez</span>}
    </div>
  );
}

/** Como fazer o exercício: passos, cadência, material, dica e cuidados. */
export function ExerciseInfo({ ex, compact }: { ex: Exercise; compact?: boolean }) {
  return (
    <div className="exercise-info">
      {!compact && <ExerciseTags ex={ex} />}
      <ol className="how-to">
        {ex.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {ex.kind === 'reps' && ex.tempo && (
        <p className="small">
          <strong>Ritmo:</strong> {ex.tempo}
        </p>
      )}
      {ex.needs && (
        <p className="small">
          <strong>Material:</strong> {ex.needs}
        </p>
      )}
      {ex.tip && (
        <div className="alert">
          <Lightbulb className="alert-icon" size={18} aria-hidden />
          <div className="alert-body">
            <span>{ex.tip}</span>
          </div>
        </div>
      )}
      {ex.caution && (
        <div className="alert warning">
          <AlertTriangle className="alert-icon" size={18} aria-hidden />
          <div className="alert-body">
            <span>{ex.caution}</span>
          </div>
        </div>
      )}
    </div>
  );
}
