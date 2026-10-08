import { useRef, useState } from 'react';
import { Download, HeartPulse, MonitorDown, Upload } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToasts } from '../components/Toasts';
import { openInstallDialog } from '../components/InstallDialog';
import { isStandalone } from '../hooks/useInstallPrompt';
import { downloadFile } from '../lib/download';
import { toDateKey } from '../lib/dates';
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme';
import { ProfileCard } from '../components/ProfileCard';
import { SyncCard } from '../components/SyncCard';
import { TrainingSettings } from '../components/TrainingSettings';
import { db, exportProfileDoc, importDoc } from '../db';
import { useEditableSettings, useProfile } from '../hooks/data';
import { adoptLegacy, parseDoc } from '../lib/sync';
import { requestSync } from '../lib/syncEngine';

function InstallCard() {
  if (isStandalone()) return null;
  return (
    <section className="card">
      <h2>
        <MonitorDown size={20} aria-hidden /> Instalar o app
      </h2>
      <p className="muted">Instalado, o Treino abre como um app, em tela cheia, e funciona sem internet.</p>
      <button type="button" className="btn" onClick={openInstallDialog}>
        <Download size={16} aria-hidden /> Baixar e instalar
      </button>
    </section>
  );
}

/** O Minha Saúde é outro app, publicado em outro endereço. */
const MINHA_SAUDE_URL = 'https://rodrigo-bowie-tech.github.io/Sa-de-/';

export function SettingsPage() {
  const profile = useProfile();
  const [settings, changeSettings] = useEditableSettings();
  const { notify } = useToasts();
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!settings) return null;

  const exportBackup = async () => {
    const doc = await exportProfileDoc(db, profile.id);
    const slug = profile.name.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'perfil';
    downloadFile(`treino-${slug}-${toDateKey(new Date())}.json`, JSON.stringify(doc, null, 2), 'application/json');
  };

  const importBackup = async (file: File) => {
    try {
      const doc = adoptLegacy(parseDoc(await file.text()), profile.id, Date.now());
      const changed = await importDoc(db, doc);
      requestSync(0);
      notify({ title: 'Backup importado', body: changed ? `${changed} registro(s) atualizados.` : 'Nada novo: os dados já estavam aqui.' });
    } catch (e) {
      notify({ title: 'Não foi possível importar', body: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <PageHeader title="Ajustes" />

      <ProfileCard />

      <SyncCard />

      <section className="card">
        <h2>Treino</h2>
        <TrainingSettings value={settings} onChange={(c) => changeSettings({ ...c, configured: true })} />
      </section>

      <section className="card">
        <h2>Durante o treino</h2>
        <label className="check">
          <input type="checkbox" checked={settings.voice} onChange={(e) => changeSettings({ voice: e.target.checked })} />
          Voz anunciando cada exercício
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => changeSettings({ sound: e.target.checked })} />
          Bipes na contagem regressiva e na troca de exercício
        </label>
        <p className="muted small">A tela fica ligada durante o treino. No computador: espaço pausa e → pula a etapa.</p>
      </section>

      <InstallCard />

      <section className="card">
        <h2>Aparência</h2>
        <div className="chips" role="group" aria-label="Tema">
          {(
            [
              ['auto', 'Automático'],
              ['claro', 'Claro'],
              ['escuro', 'Escuro'],
            ] as [ThemeChoice, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value);
                setThemeState(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted small">Arquivo com os seus treinos e ajustes (só do seu perfil). Importar junta o arquivo aos dados atuais, sem apagar nada.</p>
        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={() => void exportBackup()}>
            <Download size={16} aria-hidden /> Exportar
          </button>
          <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} aria-hidden /> Importar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importBackup(file);
            }}
          />
        </div>
      </section>

      <a className="sync-line" href={MINHA_SAUDE_URL}>
        <HeartPulse size={16} aria-hidden /> Abrir o app Minha Saúde
      </a>
    </>
  );
}
