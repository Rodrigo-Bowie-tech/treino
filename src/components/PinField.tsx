import { PIN_MAX } from '../lib/profiles';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  autoComplete?: 'current-password' | 'new-password';
}

/** Campo de PIN: só números, teclado numérico no celular e texto escondido. */
export function PinField({ label, value, onChange, autoFocus, autoComplete = 'current-password' }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="pin-input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={autoComplete}
        maxLength={PIN_MAX}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_MAX))}
      />
    </label>
  );
}

export function Avatar({ name, big }: { name: string; big?: boolean }) {
  return (
    <span className={`avatar${big ? ' big' : ''}`} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
