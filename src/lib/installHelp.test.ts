import { describe, expect, it } from 'vitest';
import { SNOOZE_DAYS, installHelp, shouldAutoOpen } from './installHelp';

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
};

describe('ajuda para instalar', () => {
  it('Android no Chrome: menu ⋮ → Instalar app, e avisa se já estiver instalado', () => {
    const h = installHelp('Treino', { userAgent: UA.androidChrome });
    expect(h.platform).toBe('android');
    expect(h.steps.join(' ')).toContain('Instalar app');
    expect(h.note).toContain('Abrir no app');
  });

  it('Samsung Internet tem o próprio caminho', () => {
    expect(installHelp('Treino', { userAgent: UA.samsung }).steps.join(' ')).toContain('Tela inicial');
  });

  it('iPhone: Compartilhar → Adicionar à Tela de Início', () => {
    const h = installHelp('Treino', { userAgent: UA.iphoneSafari });
    expect(h.platform).toBe('ios');
    expect(h.steps.join(' ')).toContain('Adicionar à Tela de Início');
  });

  it('iPad em modo computador também é tratado como iPhone/iPad', () => {
    expect(installHelp('Treino', { userAgent: UA.ipadDesktopMode, platform: 'MacIntel', maxTouchPoints: 5 }).platform).toBe('ios');
    expect(installHelp('Treino', { userAgent: UA.ipadDesktopMode, platform: 'MacIntel', maxTouchPoints: 0 }).platform).toBe('desktop');
  });

  it('links abertos dentro de outros apps pedem para abrir no navegador', () => {
    expect(installHelp('Treino', { userAgent: UA.iphoneInstagram }).platform).toBe('in-app');
    const webview = installHelp('Treino', { userAgent: UA.androidWebView });
    expect(webview.platform).toBe('in-app');
    expect(webview.steps.join(' ')).toContain('Abrir no Chrome');
  });

  it('computador: Chrome e Edge instalam; Firefox não', () => {
    expect(installHelp('Treino', { userAgent: UA.windowsChrome }).platform).toBe('desktop');
    expect(installHelp('Treino', { userAgent: UA.windowsEdge }).platform).toBe('desktop');
    expect(installHelp('Treino', { userAgent: UA.windowsFirefox }).platform).toBe('unsupported');
  });
});

describe('abrir a janela sozinha', () => {
  const now = Date.UTC(2026, 9, 8);
  it('abre na primeira vez e volta depois de alguns dias de “Agora não”', () => {
    expect(shouldAutoOpen(undefined, now)).toBe(true);
    expect(shouldAutoOpen(now - 1000, now)).toBe(false);
    expect(shouldAutoOpen(now - SNOOZE_DAYS * 86_400_000, now)).toBe(true);
  });
});
