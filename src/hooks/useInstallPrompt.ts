import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Guarda o convite de instalação do navegador (Android/Chrome) para oferecer um botão "Instalar". */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Abre o convite de instalação do navegador; devolve se a pessoa aceitou. */
export function useInstallPrompt(): (() => Promise<'accepted' | 'dismissed'>) | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!deferred) return null;
  return async () => {
    const event = deferred;
    if (!event) return 'dismissed';
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null;
    listeners.forEach((l) => l());
    return outcome;
  };
}
