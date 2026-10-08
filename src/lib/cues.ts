/** Sinais durante o treino: bipes, voz, vibração e tela sempre ligada. */

let ctx: AudioContext | undefined;

/** Precisa ser chamado num toque do usuário (regra dos navegadores para tocar som). */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    // Sem áudio neste navegador.
  }
  // No iPhone, a voz também só funciona depois de uma fala iniciada por um toque.
  try {
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  } catch {
    // Sem voz.
  }
}

export function beep(kind: 'curto' | 'longo' | 'aviso' = 'curto'): void {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    const [freq, dur] = kind === 'longo' ? [880, 0.5] : kind === 'aviso' ? [520, 0.35] : [660, 0.12];
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch {
    // Ignora falhas de áudio.
  }
}

let voice: SpeechSynthesisVoice | undefined;

function ptVoice(): SpeechSynthesisVoice | undefined {
  if (voice) return voice;
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => v.lang === 'pt-BR') ?? voices.find((v) => v.lang.startsWith('pt'));
  return voice;
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const v = ptVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    // Sem voz.
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Sem vibração.
  }
}

/** Mantém a tela ligada enquanto o treino estiver aberto. Retorna a função que libera. */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | undefined;
  let active = true;
  const request = async () => {
    try {
      if (active && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        lock = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Sem permissão ou sem suporte: a tela pode apagar.
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void request();
  };
  void request();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => {});
  };
}

/** "1 min 30 s", "45 segundos" — para a voz. */
export function spokenDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} segundos`;
  const min = m === 1 ? '1 minuto' : `${m} minutos`;
  return s ? `${min} e ${s} segundos` : min;
}

/** "1:05", "60:00" (os treinos não passam de 1 hora, então sem as horas). */
export function clock(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
