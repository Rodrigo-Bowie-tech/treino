import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { useToasts } from './Toasts';
import { db, deleteProfile, updateProfile } from '../db';
import { useProfile, useProfiles } from '../hooks/data';
import { NAME_MAX, hashPin, setCurrentProfileId, validateName, validatePin, verifyPin } from '../lib/profiles';
import { Avatar, PinField } from './PinField';

function ChangePin({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const { notify } = useToasts();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!(await verifyPin(current, profile.pin))) return setError('O PIN atual está incorreto.');
    const problem = validatePin(pin) ?? (pin !== confirm ? 'Os PINs novos não são iguais.' : undefined);
    if (problem) return setError(problem);
    await updateProfile(db, profile.id, { pin: await hashPin(pin) });
    notify({ title: 'PIN alterado', body: 'Vale em todos os aparelhos sincronizados.' });
    onClose();
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Trocar PIN"
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-trocar-pin" className="btn">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-trocar-pin" className="form" onSubmit={onSubmit}>
        <PinField label="PIN atual" value={current} onChange={setCurrent} autoFocus />
        <div className="form-grid">
          <PinField label="Novo PIN" value={pin} onChange={setPin} autoComplete="new-password" />
          <PinField label="Repita o novo PIN" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </Modal>
  );
}

function DeleteProfile({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!(await verifyPin(pin, profile.pin))) return setError('PIN incorreto.');
    await deleteProfile(db, profile.id);
    setCurrentProfileId(undefined);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Excluir perfil"
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-excluir-perfil" className="btn danger">
            <Trash2 size={16} aria-hidden /> Excluir
          </button>
        </>
      }
    >
      <p>
        O perfil <strong>{profile.name}</strong> e todos os treinos dele serão apagados em todos os aparelhos sincronizados. Isso
        não pode ser desfeito.
      </p>
      <form id="form-excluir-perfil" className="form" onSubmit={onSubmit}>
        <PinField label="Digite o PIN para confirmar" value={pin} onChange={setPin} autoFocus />
        {error && <p className="error">{error}</p>}
      </form>
    </Modal>
  );
}

/** Perfil logado: nome, PIN, sair e excluir. */
export function ProfileCard() {
  const profile = useProfile();
  const profiles = useProfiles() ?? [];
  const { notify } = useToasts();
  const [name, setName] = useState(profile.name);
  const [nameError, setNameError] = useState('');
  const [modal, setModal] = useState<'pin' | 'delete' | null>(null);

  const saveName = async () => {
    const problem = validateName(name, profiles, profile.id);
    if (problem) return setNameError(problem);
    setNameError('');
    await updateProfile(db, profile.id, { name: name.trim() });
    notify({ title: 'Nome alterado' });
  };

  return (
    <section className="card">
      <div className="profile-head">
        <Avatar name={profile.name} big />
        <div>
          <h2>{profile.name}</h2>
          <p className="muted small">Seus treinos, histórico e ajustes ficam separados dos outros perfis.</p>
        </div>
      </div>
      <div className="inline-field">
        <label className="field">
          <span>Nome</span>
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="button" className="btn secondary" disabled={name.trim() === profile.name} onClick={() => void saveName()}>
          Salvar
        </button>
      </div>
      {nameError && <p className="error">{nameError}</p>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setCurrentProfileId(undefined)}>
          <LogOut size={16} aria-hidden /> Sair / trocar de perfil
        </button>
        <button type="button" className="btn secondary" onClick={() => setModal('pin')}>
          <KeyRound size={16} aria-hidden /> Trocar PIN
        </button>
        <button type="button" className="btn danger" onClick={() => setModal('delete')}>
          <Trash2 size={16} aria-hidden /> Excluir perfil
        </button>
      </div>
      <p className="muted small">
        O PIN separa os perfis dentro do app. Os dados de todos os perfis ficam juntos na mesma sincronização do GitHub.
      </p>
      {modal === 'pin' && <ChangePin onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteProfile onClose={() => setModal(null)} />}
    </section>
  );
}
