import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToasts } from '../components/Toasts';
import { getLogin } from '../lib/gist';
import { parseConnectInput } from '../lib/sync';
import { connect, getConfig } from '../lib/syncEngine';

/** Aberto pelo código QR de outro aparelho: confirma e conecta este aparelho à mesma sincronização. */
export function ConnectPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToasts();
  const stateCode = (location.state as { code?: string } | null)?.code;
  const info = stateCode ? parseConnectInput(stateCode) : undefined;
  const [login, setLogin] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Tira o código (que contém o token) do endereço e do histórico do navegador.
  useEffect(() => {
    if (code) navigate('/conectar', { replace: true, state: { code } });
  }, [code, navigate]);

  useEffect(() => {
    if (!info) return;
    let alive = true;
    getLogin(info.token)
      .then((l) => alive && setLogin(l))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [info?.token]);

  if (code) return null;

  const current = getConfig();

  if (!info) {
    return (
      <>
        <PageHeader title="Conectar aparelho" back="/ajustes" />
        <p className="error">O código de conexão é inválido. Gere um novo no outro aparelho em Ajustes → Sincronização.</p>
      </>
    );
  }

  const onConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      const config = await connect(info.token, info.gistId);
      notify({ title: 'Aparelho conectado', body: `Sincronizando com a conta @${config.login}.` });
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Conectar aparelho" back="/ajustes" />
      <section className="card">
        <h2>
          <Cloud size={20} aria-hidden /> Sincronizar este aparelho?
        </h2>
        <p>
          {login ? (
            <>
              Este aparelho vai usar a sincronização da conta <strong>@{login}</strong> do GitHub. Os treinos daqui e dos outros
              aparelhos serão juntados.
            </>
          ) : error ? null : (
            'Verificando o código…'
          )}
        </p>
        {current && current.token !== info.token && (
          <p className="muted small">Este aparelho já estava conectado a @{current.login}; a conexão será trocada.</p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="btn-row">
          <button type="button" className="btn" disabled={!login || busy} onClick={() => void onConfirm()}>
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
          <Link to="/" className="btn secondary">
            Agora não
          </Link>
        </div>
      </section>
    </>
  );
}
