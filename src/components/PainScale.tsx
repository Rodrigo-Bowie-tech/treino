/** Escala de dor de 0 a 10 (dor no calcanhar/sola do pé). */
export function PainScale({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div className="pain-scale" role="group" aria-label="Dor no pé de 0 a 10">
      {Array.from({ length: 11 }, (_, n) => (
        <button
          key={n}
          type="button"
          className={`chip pain-${n <= 3 ? 'low' : n <= 6 ? 'mid' : 'high'}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
