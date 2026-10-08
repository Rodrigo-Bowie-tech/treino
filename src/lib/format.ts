const numberFormats = new Map<number, Intl.NumberFormat>();

/** Número no formato brasileiro (vírgula decimal, ponto de milhar). */
export function fmt(n: number | undefined | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  let f = numberFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
    numberFormats.set(digits, f);
  }
  return f.format(n);
}

/** Aceita "72,5" ou "72.5". Retorna undefined para texto vazio ou inválido. */
export function parseNumber(s: string | undefined | null): number | undefined {
  if (s == null) return undefined;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Grau em dioptrias: "+1,25", "-2,50", "0,00". */
export function fmtDiopter(n: number | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(2).replace('.', ',');
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

/** Primeira letra maiúscula: "sábado, 26 de setembro" → "Sábado, 26 de setembro". */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Remove acentos e caixa para buscas. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function fmtMl(ml: number): string {
  return ml >= 1000 ? `${fmt(ml / 1000, 2)} L` : `${fmt(ml)} ml`;
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return d === 7 ? '1 semana' : `${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  return m ? `${h} h ${m} min` : `${h} h`;
}
