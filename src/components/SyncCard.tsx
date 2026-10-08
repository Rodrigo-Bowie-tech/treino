import { useMemo, useState } from 'react';
import { Cloud, Copy, ExternalLink, QrCode, RefreshCw, Unplug } from 'lucide-react';
import { renderSVG } from 'uqr';
import { Modal } from './Modal';
import { useToasts } from './Toasts';
import { formatDateTime } from '../lib/dates';
import { useSyncStatus } from '../hooks/data';
import { encodeConnectCode, parseConnectInput } from '../lib/sync';
import { connect, disconnect, getConfig, syncNow } from '../lib/syncEngine';

/** Link do GitHub que já abre a criação de um token só com a permissão "gist". */
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=App%20Treino%20(sincroniza%C3%A7%C3%A3o)';

export function connectLink(code: string): string {
  return `${location.origin}${location.pathname}#/conectar/${code}`;
}

function ShareModal({ onClose }: { onClose: () => void }) {
  const config = getConfig();
  const { notify } = useToasts();
  const code = config ? encodeConnectCode(config) : '';
  const link = code ? connectLink(code) : '';
  const svg = useMemo(() => (link ? renderSVG(link, { ecc: 'M', border: 2 }) : ''), [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify({ title: 'Código copiado', body: 'Cole no outro aparelho em Ajustes → Sincronização.' });
    } catch {
      prompt('Copie o código:', code);
    }
  };

  return (
    <Modal open onClose={onClose} title="Conectar outro aparelho">
      <ol className="how-to">
        <li>No celular, aponte a câmera para o código abaixo e abra o link.</li>
        <li>Confirme a conexão. Os treinos dos dois aparelhos são juntados.</li>
      </ol>
      <div className="qr" role="img" aria-label="Código QR para conectar outro aparelho" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="small muted">
        No iPhone com o app instalado na Tela de Início, abra o app, vá em Ajustes → Sincronização e cole o código (o app
        instalado não compartilha dados com o Safari).
      </p>
      <button type="button" className="btn secondary" onClick={() => void copy()}>
        <Copy size={16} aria-hidden /> Copiar código
      </button>
      <div className="alert warning">
        <div className="alert-body">
          <span>Não compartilhe este código com outras pessoas: ele dá acesso aos seus dados de treino.</span>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Na tela de entrada (sem login) não mostra o código QR de conexão, que leva o
 * acesso à sincronização para outro aparelho.
 */
export function SyncCard({ onLoginScreen = false }: { onLoginScreen?: boolean }) {
  const status = useSyncStatus();
  const { notify } = useToasts();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  const onConnect = async () => {
    setError('');
    const info = parseConnectInput(input);
    if (!info) {
      setError('Cole um token do GitHub (começa com ghp_ ou github_pat_) ou o código de conexão de outro aparelho.');
      return;
    }
    setBusy(true);
    try {
      const config = await connect(info.token, info.gistId);
      setInput('');
      notify({ title: 'Sincronização ativada', body: `Conectado à conta @${config.login} do GitHub.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>
          <Cloud size={20} aria-hidden /> Sincronização entre aparelhos
        </h2>
        {status.enabled && <span className={`badge ${status.error ? 'critical' : 'good'}`}>{status.error ? 'Com erro' : 'Ativa'}</span>}
      </div>

      {status.enabled ? (
        <>
          <p>
            Conectado à conta <strong>@{status.login}</strong> do GitHub.{' '}
            {status.running ? 'Sincronizando…' : status.lastSyncAt ? `Última sincronização: ${formatDateTime(new Date(status.lastSyncAt))}.` : ''}
          </p>
          {status.error && <p className="error">{status.error}</p>}
          <p className="muted small">
            Sincroniza sozinho ao abrir o app, ao salvar um treino ou mudar os ajustes, e a cada 5 minutos. Funciona sem
            internet: o que você fizer offline é enviado depois.
          </p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void syncNow()} disabled={status.running}>
              <RefreshCw size={16} aria-hidden /> Sincronizar agora
            </button>
            {!onLoginScreen && (
              <button type="button" className="btn secondary" onClick={() => setSharing(true)}>
                <QrCode size={16} aria-hidden /> Conectar outro aparelho
              </button>
            )}
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (confirm('Desconectar este aparelho? Os treinos continuam aqui, mas deixam de ser sincronizados.')) disconnect();
              }}
            >
              <Unplug size={16} aria-hidden /> Desconectar
            </button>
          </div>
          {sharing && <ShareModal onClose={() => setSharing(false)} />}
        </>
      ) : (
        <>
          <p>
            Use o mesmo treino e histórico no celular e no computador. Os dados ficam numa gist secreta da sua conta do
            GitHub; o app não tem servidor próprio.
          </p>
          <ol className="how-to">
            <li>
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">
                Crie um token no GitHub <ExternalLink size={14} aria-hidden />
              </a>{' '}
              com a permissão <strong>gist</strong> (o link já marca só ela). Em “Expiration”, escolha “No expiration” ou uma
              data longa.
            </li>
            <li>Copie o token gerado (começa com ghp_) e cole abaixo.</li>
            <li>
              Nos outros aparelhos, use <strong>Conectar outro aparelho</strong> (código QR) ou cole o mesmo token.
            </li>
          </ol>
          <label className="field">
            <span>Token do GitHub ou código de conexão</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ghp_… ou TR1.…"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn" onClick={() => void onConnect()} disabled={busy || !input.trim()}>
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
          <p className="muted small">
            Gists secretas não aparecem no seu perfil nem em buscas, mas quem tiver o endereço exato consegue abrir. Só os
            dados de treino vão para lá.
          </p>
        </>
      )}
    </section>
  );
}
