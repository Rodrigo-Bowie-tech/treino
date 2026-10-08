function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Abre o arquivo .ics para adicionar ao calendário do aparelho.
 * No iPhone/iPad o Safari mostra "Adicionar ao Calendário" ao abrir o conteúdo diretamente.
 */
export function openCalendarFile(filename: string, ics: string): void {
  if (isIOS()) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    return;
  }
  downloadFile(filename, ics, 'text/calendar;charset=utf-8');
}
