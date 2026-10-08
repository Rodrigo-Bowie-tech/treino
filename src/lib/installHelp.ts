/** Como instalar o app em cada aparelho/navegador quando o botão automático não está disponível. */

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'in-app' | 'unsupported';

export interface InstallHelp {
  platform: InstallPlatform;
  /** Passos para instalar pelo menu do navegador. */
  steps: string[];
  /** Observação extra (ex.: o app já pode estar instalado). */
  note?: string;
}

export interface DeviceInfo {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** Navegadores embutidos em outros apps (WhatsApp, Instagram...) não instalam apps. */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Telegram|; wv\)|\bGSA\//;

export function installHelp(appName: string, device: DeviceInfo): InstallHelp {
  const ua = device.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (device.platform === 'MacIntel' && (device.maxTouchPoints ?? 0) > 1);
  const android = /Android/.test(ua);

  if (IN_APP.test(ua)) {
    return {
      platform: 'in-app',
      steps: [
        `Este link abriu dentro de outro app, que não consegue instalar o ${appName}.`,
        ios ? 'Toque no menu (⋯ ou ⋮) e escolha “Abrir no Safari”.' : 'Toque no menu (⋮) e escolha “Abrir no Chrome” (ou “Abrir no navegador”).',
        'Lá, abra esta janela de novo e instale.',
      ],
    };
  }

  if (ios) {
    return {
      platform: 'ios',
      steps: [
        'Toque no botão Compartilhar (o quadrado com a seta para cima), na barra do Safari.',
        'Role a lista e toque em “Adicionar à Tela de Início”.',
        `Toque em “Adicionar”. O ícone do ${appName} aparece na tela inicial.`,
      ],
      note: 'No iPhone, use o Safari (ou o Chrome a partir do iOS 16.4, pelo mesmo botão Compartilhar).',
    };
  }

  if (android) {
    if (/SamsungBrowser/.test(ua)) {
      return {
        platform: 'android',
        steps: ['Toque no menu (☰) do Samsung Internet.', 'Toque em “Adicionar página a” e depois em “Tela inicial”.'],
      };
    }
    if (/Firefox/.test(ua)) {
      return { platform: 'android', steps: ['Toque no menu (⋮) do Firefox.', 'Toque em “Instalar”.'] };
    }
    return {
      platform: 'android',
      steps: ['Toque no menu (⋮) do Chrome, no canto de cima.', 'Toque em “Instalar app” (ou “Adicionar à tela inicial”) e confirme.'],
      note: `Se aparecer “Abrir no app” em vez de “Instalar”, o ${appName} já está instalado neste celular.`,
    };
  }

  if (/Edg\/|Chrome\/|Chromium\//.test(ua) && !/OPR\//.test(ua)) {
    return {
      platform: 'desktop',
      steps: [
        'Clique no ícone de instalar, no lado direito da barra de endereço (um monitor com uma seta).',
        `Ou abra o menu (⋮ ou ⋯) e escolha “Instalar ${appName}” / “Aplicativos → Instalar este site como um aplicativo”.`,
      ],
    };
  }

  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) {
    return {
      platform: 'desktop',
      steps: ['No Safari do Mac, abra o menu Arquivo.', 'Escolha “Adicionar ao Dock”.'],
    };
  }

  return {
    platform: 'unsupported',
    steps: [`Este navegador não instala apps. Abra este endereço no Chrome, no Edge ou (no iPhone) no Safari para instalar o ${appName}.`],
  };
}

/* ——— Quando oferecer a janela automaticamente ——— */

const DAY = 24 * 60 * 60 * 1000;
/** Depois de “Agora não”, a janela só volta sozinha depois de alguns dias. */
export const SNOOZE_DAYS = 7;

export function shouldAutoOpen(dismissedAt: number | undefined, now: number): boolean {
  return dismissedAt == null || now - dismissedAt >= SNOOZE_DAYS * DAY;
}
