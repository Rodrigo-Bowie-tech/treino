export type ThemeChoice = 'auto' | 'claro' | 'escuro';

/** Tema do Treino, separado do tema do Minha Saúde (os dois apps ficam no mesmo site). */
const KEY = 'treino:tema';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'claro' || v === 'escuro' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice === 'escuro' ? 'dark' : 'light');
}

export function applyTreinoTheme(): void {
  applyTheme(getTheme());
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Sem armazenamento local: o tema vale só nesta sessão.
  }
  applyTheme(choice);
}
