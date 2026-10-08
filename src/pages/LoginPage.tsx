import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Cloud, Plus } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Avatar, PinField } from '../components/PinField';
import { SyncCard } from '../components/SyncCard';
import { createProfile, db, updateProfile } from '../db';
import { useProfiles, useSyncStatus } from '../hooks/data';
import { formatDateTime } from '../lib/dates';
import {
  MAX_ATTEMPTS,
  NAME_MAX,
  clearFailures,
  hashPin,
  liveProfiles,
  lockedFor,
  registerFailure,
  setCurrentProfileId,
  validateName,
  validatePin,
  verifyPin,
} from '../lib/profiles';
import { parseConnectInput } from '../lib/sync';
import { getConfig, getSyncStatus, syncNow } from '../lib/syncEngine';
import type { Profile } from '../types';

function CreateProfile({ profiles, syncing, onCancel }: { profiles: Profile[]; syncing: boolean; onCancel?: () => void }) {
  const login = useLogin();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** A sincronização falhou ao criar: na segunda vez, cria mesmo assim. */
  const [syncFailed, setSyncFailed] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateName(name, profiles) ?? validatePin(pin) ?? (pin !== confirm ? 'Os PINs não são iguais.' : undefined);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      // Com a sincronização ligada, busca antes os perfis criados em outros aparelhos (evita perfil repetido).
      if (getConfig() && !syncFailed) {
        await syncNow();
        const sameName = validateName(name, liveProfiles(await db.profiles.toArray()));
        if (sameName) {
          setBusy(false);
          return setError(`${sameName} Ele veio de outro aparelho: entre com ele em vez de criar outro.`);
        }
        const syncError = getSyncStatus().error;
        if (syncError) {
          setBusy(false);
          setSyncFailed(true);
          return setError(
            `Não deu para sincronizar agora (${syncError}). Se você já tem perfil em outro aparelho, conecte-se à internet e tente de novo; senão, toque em “Criar mesmo assim”.`,
          );
        }
      }
      const profile = await createProfile(db, name, pin);
      login(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={(e) => void submit(e)}>
      <h2>{profiles.length ? 'Novo perfil' : 'Crie seu perfil'}</h2>
      <p className="muted small">Cada pessoa tem seu perfil, com treinos, histórico e ajustes próprios.</p>
      <label className="field">
        <span>Nome</span>
        <input value={name} maxLength={NAME_MAX} autoComplete="nickname" autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="form-grid">
        <PinField label="PIN (4 a 8 números)" value={pin} onChange={setPin} autoComplete="new-password" />
        <PinField label="Repita o PIN" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
      {error && <p className="error">{error}</p>}
      {syncing && <p className="muted small">Sincronizando… aguarde para ver os perfis que já existem em outros aparelhos.</p>}
      <div className="btn-row">
        <button type="submit" className="btn" disabled={busy || syncing}>
          {busy ? 'Criando…' : syncFailed ? 'Criar mesmo assim' : 'Criar perfil'}
        </button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Entra com o perfil e abre a tela inicial. */
function useLogin(): (id: string) => void {
  const navigate = useNavigate();
  return (id) => {
    setCurrentProfileId(id);
    navigate('/', { replace: true });
  };
}

/** Redefinir o PIN esquecido: com a sincronização ligada, exige o token do GitHub (ou o código de conexão). */
function ForgotPin({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const login = useLogin();
  const config = getConfig();
  const [proof, setProof] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (config && parseConnectInput(proof)?.token !== config.token) {
      return setError('Não confere com a sincronização deste aparelho.');
    }
    const problem = validatePin(pin) ?? (pin !== confirm ? 'Os PINs não são iguais.' : undefined);
    if (problem) return setError(problem);
    await updateProfile(db, profile.id, { pin: await hashPin(pin) });
    clearFailures(profile.id);
    login(profile.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Esqueci o PIN"
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-esqueci-pin" className="btn">
            Salvar novo PIN
          </button>
        </>
      }
    >
      <form
        id="form-esqueci-pin"
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {config ? (
          <label className="field">
            <span>Token do GitHub ou código de conexão da sincronização</span>
            <input type="password" autoComplete="off" spellCheck={false} value={proof} onChange={(e) => setProof(e.target.value)} />
            <span className="hint">
              É o token usado para ligar a sincronização (ou o código de “Conectar outro aparelho”). Quem tem a sincronização pode
              redefinir o PIN.
            </span>
          </label>
        ) : (
          <p className="muted small">Este aparelho não está sincronizado, então o PIN pode ser redefinido aqui mesmo.</p>
        )}
        <div className="form-grid">
          <PinField label="Novo PIN" value={pin} onChange={setPin} autoComplete="new-password" />
          <PinField label="Repita o novo PIN" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </Modal>
  );
}

function EnterPin({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const login = useLogin();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.ceil(lockedFor(profile.id, now) / 1000);

  useEffect(() => {
    if (!wait) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (wait || !pin) return;
    setBusy(true);
    const ok = await verifyPin(pin, profile.pin);
    setBusy(false);
    if (ok) {
      clearFailures(profile.id);
      login(profile.id);
      return;
    }
    const { left, lockMs } = registerFailure(profile.id, Date.now());
    setPin('');
    setNow(Date.now());
    setError(
      lockMs
        ? 'PIN incorreto.'
        : `PIN incorreto. ${left === 1 ? 'Mais 1 tentativa' : `Mais ${left} tentativas`} antes de uma pausa.`,
    );
  };

  return (
    <>
      <form className="card form" onSubmit={(e) => void submit(e)}>
        <div className="profile-head">
          <button type="button" className="icon-btn" aria-label="Voltar" onClick={onBack}>
            <ChevronLeft size={20} />
          </button>
          <Avatar name={profile.name} big />
          <h2>{profile.name}</h2>
        </div>
        <PinField label="PIN" value={pin} onChange={setPin} autoFocus />
        {error && <p className="error">{error}</p>}
        {wait > 0 && (
          <p className="error" role="status">
            Muitas tentativas erradas ({MAX_ATTEMPTS} ou mais). Aguarde {wait} s.
          </p>
        )}
        <button type="submit" className="btn block" disabled={busy || wait > 0 || pin.length < 4}>
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
        <button type="button" className="btn ghost" onClick={() => setForgot(true)}>
          Esqueci o PIN
        </button>
      </form>
      {/* Fora do formulário do PIN: Enter no diálogo não pode virar tentativa de entrar. */}
      {forgot && <ForgotPin profile={profile} onClose={() => setForgot(false)} />}
    </>
  );
}

/** Tela de entrada: escolher o perfil e digitar o PIN, ou criar um perfil. */
export function LoginPage() {
  const profiles = useProfiles();
  const sync = useSyncStatus();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [showSync, setShowSync] = useState(false);

  if (!profiles) return null;
  const selected = profiles.find((p) => p.id === selectedId);
  // Dois perfis com o mesmo nome (criados sem sincronizar): mostra a data para diferenciar.
  const sameName = (p: Profile) => profiles.some((o) => o.id !== p.id && validateName(p.name, [o]));

  return (
    <div className="login">
      <header className="login-head">
        <img src="./icons/favicon.svg" alt="" />
        <div>
          <h1>Treino</h1>
          <p className="muted">Braços e fascite plantar, até 1 hora por treino.</p>
        </div>
      </header>

      {creating || !profiles.length ? (
        <CreateProfile profiles={profiles} syncing={sync.running} onCancel={profiles.length ? () => setCreating(false) : undefined} />
      ) : selected ? (
        <EnterPin key={selected.id} profile={selected} onBack={() => setSelectedId(undefined)} />
      ) : (
        <section className="card">
          <h2>Quem vai treinar?</h2>
          <div className="profile-grid">
            {profiles.map((p) => (
              <button key={p.id} type="button" className="profile-btn" onClick={() => setSelectedId(p.id)}>
                <Avatar name={p.name} />
                <span>{p.name}</span>
                {sameName(p) && <small className="muted">criado em {formatDateTime(new Date(p.createdAt))}</small>}
              </button>
            ))}
            <button type="button" className="profile-btn add" onClick={() => setCreating(true)}>
              <span className="avatar">
                <Plus size={20} />
              </span>
              <span>Novo perfil</span>
            </button>
          </div>
        </section>
      )}

      {sync.enabled || showSync ? (
        <SyncCard onLoginScreen />
      ) : (
        <section className="card">
          <h2>
            <Cloud size={20} aria-hidden /> Já usa o Treino em outro aparelho?
          </h2>
          <p className="muted small">
            Conecte a sincronização antes de criar um perfil para ver os perfis e treinos que já existem.
          </p>
          <button type="button" className="btn secondary" onClick={() => setShowSync(true)}>
            Conectar sincronização
          </button>
        </section>
      )}
    </div>
  );
}
