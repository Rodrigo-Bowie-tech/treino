import { EQUIPMENT_LABELS } from '../data/exercises';
import type { Equipment, FootSide, Settings } from '../types';

const EQUIPMENT: Equipment[] = ['halteres', 'elastico', 'barra'];

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
        <span className="hint">Sempre com 15 min de aquecimento. Nenhum treino passa de 1 hora.</span>
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
        <span className="hint">Sem nenhum, o treino usa o peso do corpo, cadeira, toalha, mochila e garrafas.</span>
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
