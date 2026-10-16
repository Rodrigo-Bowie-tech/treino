import { EQUIPMENT_LABELS } from '../data/exercises';
import { FOCUS_OPTIONS, focusOf } from '../lib/plan';
import type { Equipment, FootSide, Settings } from '../types';

const EQUIPMENT: Equipment[] = ['halteres', 'banco', 'elastico', 'barra'];

interface Props {
  value: Settings;
  onChange: (changes: Partial<Settings>) => void;
}

/** Ajustes que mudam o treino montado: duração, equipamentos, fascite e descanso. */
export function TrainingSettings({ value, onChange }: Props) {
  const toggleEquipment = (eq: Equipment, on: boolean) =>
    onChange({ equipment: on ? [...value.equipment, eq] : value.equipment.filter((e) => e !== eq) });

  return (
    <div className="form">
      <div className="field">
        <span className="field-label">Duração do treino</span>
        <div className="chips" role="group" aria-label="Duração do treino">
          {([30, 45, 60] as const).map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={value.durationMin === d} onClick={() => onChange({ durationMin: d })}>
              {d} min
            </button>
          ))}
        </div>
        <span className="hint">
          Aquecimento de 15 min no treino de 60, 10 min no de 45 e 7 min no de 30; o resto do tempo é quase todo de braço.
          Nenhum treino passa de 1 hora.
        </span>
      </div>

      <div className="field">
        <span className="field-label">Tipo de treino</span>
        <div className="chips" role="group" aria-label="Tipo de treino">
          {FOCUS_OPTIONS.map(([f, label]) => (
            <button key={f} type="button" className="chip" aria-pressed={focusOf(value) === f} onClick={() => onChange({ focus: f })}>
              {label}
            </button>
          ))}
        </div>
        <span className="hint">
          Só braços: aquecimento curto (5 a 7 min), sem a fascite, e o resto do tempo de braço, com halteres e com o peso do
          corpo. Dá para trocar a qualquer dia na tela inicial.
        </span>
      </div>

      <fieldset>
        <legend>Equipamentos que você tem</legend>
        <div className="check-list">
          {EQUIPMENT.map((eq) => (
            <label key={eq} className="check">
              <input type="checkbox" checked={value.equipment.includes(eq)} onChange={(e) => toggleEquipment(eq, e.target.checked)} />
              {EQUIPMENT_LABELS[eq]}
            </label>
          ))}
        </div>
        <span className="hint">O treino de braço é feito com halteres (e o banco, se tiver). Sem eles, usa o peso do corpo, cadeira e mochila.</span>
      </fieldset>

      <fieldset>
        <legend>Fascite plantar</legend>
        <label className="check">
          <input type="checkbox" checked={value.fasciitis} onChange={(e) => onChange({ fasciitis: e.target.checked })} />
          Incluir exercícios para a fascite em todo treino
        </label>
        {value.fasciitis && (
          <label className="field">
            <span>Pé com fascite</span>
            <select value={value.footSide} onChange={(e) => onChange({ footSide: e.target.value as FootSide })}>
              <option value="ambos">Os dois pés</option>
              <option value="esquerdo">Pé esquerdo</option>
              <option value="direito">Pé direito</option>
            </select>
          </label>
        )}
      </fieldset>

      <div className="form-grid">
        <label className="field">
          <span>Descanso entre séries</span>
          <select value={value.restSec} onChange={(e) => onChange({ restSec: Number(e.target.value) })}>
            {[45, 60, 90, 120].map((s) => (
              <option key={s} value={s}>
                {s} segundos
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Meta de treinos por semana</span>
          <select value={value.weeklyGoal} onChange={(e) => onChange({ weeklyGoal: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'treino' : 'treinos'}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
