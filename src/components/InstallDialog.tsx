import { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, Download, Smartphone, WifiOff } from 'lucide-react';
import { Modal } from './Modal';
import { isStandalone, useInstallPrompt } from '../hooks/useInstallPrompt';
import { installHelp, shouldAutoOpen } from '../lib/installHelp';

/* ——— Abrir a janela de qualquer lugar do app ——— */

let open = false;
const listeners = new Set<() => void>();

function setOpen(value: boolean): void {
  open = value;
  listeners.forEach((l) => l());
}

export function openInstallDialog(): void {
  setOpen(true);
}

function useOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}

function readNumber(key: string): number | undefined {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sem armazenamento: a janela pode voltar na próxima visita.
  }
}

/** A rota do app (HashRouter) começa com alguma das rotas que não devem ser interrompidas. */
function inQuietRoute(quietRoutes: string[]): boolean {
  const route = location.hash.replace(/^#/, '') || '/';
  return quietRoutes.some((r) => route.startsWith(r));
}

interface Props {
  appName: string;
  iconSrc: string;
  /** Chave (no armazenamento do aparelho) de quando a pessoa tocou em “Agora não”. */
  dismissKey: string;
  /** Não abre sozinha nestas rotas (ex.: no meio de um treino). */
  quietRoutes?: string[];
  /**
   * Aviso para quem instala no iPhone (ou no Safari do Mac), onde o app instalado
   * começa sem os dados que estavam no navegador.
   */
  dataNote?: string;
}

/**
 * Janela para baixar e instalar o app. Abre sozinha quando o app está no
 * navegador (e não instalado); no Android/computador instala com um toque,
 * no iPhone e nos demais mostra o passo a passo.
 */
export function InstallDialog({ appName, iconSrc, dismissKey, quietRoutes = [], dataNote }: Props) {
  const installedKey = `${dismissKey}:instalado`;
  const isOpen = useOpen();
  const install = useInstallPrompt();
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const help = installHelp(appName, {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });

  // Abre sozinha uma vez, logo depois de abrir o app no navegador (não depois de já instalado).
  useEffect(() => {
    if (isStandalone() || readNumber(installedKey)) return;
    if (!shouldAutoOpen(readNumber(dismissKey), Date.now())) return;
    const id = setTimeout(() => {
      // Confere de novo: a pessoa pode ter ido para uma tela que não deve ser interrompida.
      if (!inQuietRoute(quietRoutes)) setOpen(true);
    }, 1200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onInstalled = () => {
      writeNumber(installedKey, Date.now());
      setInstalled(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const close = () => {
    if (!installed) writeNumber(dismissKey, Date.now());
    setOpen(false);
  };

  const onInstall = async () => {
    if (!install) return;
    setBusy(true);
    try {
      if ((await install()) === 'accepted') writeNumber(installedKey, Date.now());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={isOpen && !isStandalone()}
      onClose={close}
      title="Instalar o app"
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={close}>
            {installed ? 'Fechar' : 'Agora não'}
          </button>
        </>
      }
    >
      <div className="install-head">
        <img src={iconSrc} alt="" width={64} height={64} />
        <div>
          <h3>{appName}</h3>
          <p className="muted small">Instale no celular ou no computador para abrir pelo ícone, como um aplicativo.</p>
        </div>
      </div>

      {installed ? (
        <div className="alert good">
          <CheckCircle2 className="alert-icon" size={20} aria-hidden />
          <div className="alert-body">
            <strong>Pronto, o {appName} foi instalado!</strong>
            <span>Abra pelo ícone na tela inicial (ou na lista de apps do computador).</span>
          </div>
        </div>
      ) : install ? (
        <button type="button" className="btn block big" disabled={busy} onClick={() => void onInstall()}>
          <Download size={20} aria-hidden /> {busy ? 'Instalando…' : 'Baixar e instalar'}
        </button>
      ) : (
        <>
          <p>
            <strong>Como instalar neste aparelho:</strong>
          </p>
          <ol className="how-to">
            {help.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {help.note && <p className="muted small">{help.note}</p>}
          {help.separateStorage && dataNote && (
            <div className="alert warning">
              <div className="alert-body">
                <span>{dataNote}</span>
              </div>
            </div>
          )}
        </>
      )}

      <ul className="install-benefits">
        <li>
          <Smartphone size={16} aria-hidden /> Ícone próprio na tela inicial e tela cheia, sem a barra do navegador.
        </li>
        <li>
          <WifiOff size={16} aria-hidden /> Funciona sem internet.
        </li>
        <li>
          <Download size={16} aria-hidden /> Ocupa pouco espaço e se atualiza sozinho.
        </li>
      </ul>
    </Modal>
  );
}
