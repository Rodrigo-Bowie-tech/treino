import { useState } from 'react';
import { ChevronRight, Footprints } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { ExerciseInfo } from '../components/ExerciseInfo';
import { CATEGORY_LABELS, EXERCISES, byCategory, equipmentLabel } from '../data/exercises';
import { useSettings } from '../hooks/data';
import { isAvailable } from '../lib/plan';
import type { Category, Exercise } from '../types';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

function prescription(ex: Exercise): string {
  const each = ex.perSide ? ' cada lado' : '';
  if (ex.kind === 'reps') {
    const [min, max] = ex.reps;
    return `${ex.sets} × ${min === max ? min : `${min}–${max}`}${each}`;
  }
  const time = ex.seconds >= 60 && ex.seconds % 30 === 0 ? `${(ex.seconds / 60).toLocaleString('pt-BR')} min` : `${ex.seconds} s`;
  return (ex.sets ?? 1) > 1 ? `${ex.sets} × ${time}${each}` : `${time}${each}`;
}

/** Cuidados gerais com a fascite plantar, além dos exercícios. */
function FasciitisCare() {
  return (
    <section className="card">
      <h2>
        <Footprints size={20} aria-hidden /> Cuidados com a fascite plantar
      </h2>
      <ul className="care-list">
        <li>Alongue a sola do pé e a panturrilha ao acordar, antes dos primeiros passos.</li>
        <li>Evite andar descalço em piso duro; prefira calçado com bom amortecimento e apoio do arco.</li>
        <li>
          Nos dias em que o calcanhar doer, faça os exercícios de salto do aquecimento na versão sem impacto (está no passo a
          passo de cada um) e use tênis com amortecimento.
        </li>
        <li>Gelo (garrafa congelada) por 10 a 15 min depois de um dia longo em pé.</li>
        <li>A melhora costuma levar semanas ou meses: registre a dor ao fim de cada treino para acompanhar.</li>
        <li>
          Procure um médico ou fisioterapeuta se a dor for forte, piorar, durar mais de 6 semanas ou vier com inchaço,
          formigamento ou febre.
        </li>
      </ul>
      <p className="muted small">Este app não substitui a orientação de um profissional de saúde.</p>
    </section>
  );
}

export function ExercisesPage() {
  const settings = useSettings();
  const [filter, setFilter] = useState<Category | 'todos'>('todos');
  const [open, setOpen] = useState<Exercise | null>(null);
  const shown = filter === 'todos' ? CATEGORIES : [filter];

  return (
    <>
      <PageHeader title="Exercícios" subtitle={`${EXERCISES.length} exercícios. Toque em um para ver como fazer.`} />
      <div className="chips" role="group" aria-label="Filtrar por grupo">
        <button type="button" className="chip" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>
          Todos
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {(filter === 'todos' || filter === 'fascite') && <FasciitisCare />}

      {shown.map((cat) => (
        <section key={cat} className="card">
          <h2>{CATEGORY_LABELS[cat]}</h2>
          <ul className="list">
            {byCategory(cat).map((ex) => {
              const off = settings && !isAvailable(ex, settings);
              return (
                <li key={ex.id}>
                  <button type="button" className="list-item" onClick={() => setOpen(ex)}>
                    <span className="main">
                      <span className="title">{ex.name}</span>
                      <span className="meta">
                        {prescription(ex)}
                        {equipmentLabel(ex) ? ` · ${equipmentLabel(ex)}` : ''}
                        {off ? (ex.replaces ? ' · alternativa para quem não tem halteres' : ' · fora do seu treino (sem o equipamento)') : ''}
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
        {open && (
          <>
            <p className="muted">{prescription(open)}</p>
            <ExerciseInfo ex={open} />
          </>
        )}
      </Modal>
    </>
  );
}
