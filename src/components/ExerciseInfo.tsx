import { AlertTriangle, CirclePlay, Lightbulb } from 'lucide-react';
import { CATEGORY_LABELS, equipmentLabel } from '../data/exercises';
import { videoUrl } from '../lib/video';
import type { Exercise } from '../types';

export function ExerciseTags({ ex }: { ex: Exercise }) {
  return (
    <div className="tags">
      <span className="tag">{CATEGORY_LABELS[ex.category]}</span>
      <span className="tag">{equipmentLabel(ex) ?? 'Sem equipamento'}</span>
      {ex.seated && <span className="tag">Sentado ou deitado</span>}
      {ex.perSide && <span className="tag">Um lado de cada vez</span>}
    </div>
  );
}

/** Abre no YouTube vídeos de como fazer o exercício. */
export function VideoLink({ ex, onOpen }: { ex: Exercise; onOpen?: () => void }) {
  return (
    <a className="btn secondary small video-link" href={videoUrl(ex)} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
      <CirclePlay size={18} aria-hidden /> Ver vídeos no YouTube
    </a>
  );
}

/** Como fazer o exercício: passos, cadência, material, dica e cuidados. */
export function ExerciseInfo({ ex, compact, onVideo }: { ex: Exercise; compact?: boolean; /** Ao abrir o vídeo (ex.: pausar o treino). */ onVideo?: () => void }) {
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
      <VideoLink ex={ex} onOpen={onVideo} />
    </div>
  );
}
