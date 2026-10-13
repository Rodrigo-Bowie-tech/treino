import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, CloudOff, Cloud, Footprints, Play, RotateCcw, Timer } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Meter } from '../components/Meter';
import { formatLongDate, formatTime, relativeDay } from '../lib/dates';
import { capitalize } from '../lib/format';
import { PlanView, minutes } from '../components/PlanView';
import { TrainingSettings } from '../components/TrainingSettings';
import { db, saveSession } from '../db';
import { useAllSessions, useEditableSettings, useProfile, useSyncStatus } from '../hooks/data';
import { loadActive, saveActive } from '../lib/activeStore';
import { unlockAudio } from '../lib/cues';
import { buildPlan } from '../lib/plan';
import { liveSessions } from '../lib/progress';
import { abandonedRecord, activeMs, isAbandoned, startSession } from '../lib/session';
import { SESSION_LIMIT_SEC } from '../lib/steps';
import type { SessionRecord } from '../types';

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function thisWeek(sessions: SessionRecord[], now: Date): number {
  const from = startOfWeek(now).toISOString();
  return sessions.filter((s) => s.startedAt >= from).length;
}

export function HomePage() {
  const profile = useProfile();
  const [settings, changeSettings] = useEditableSettings();
  const all = useAllSessions();
  const sync = useSyncStatus();
  const navigate = useNavigate();
  const [active, setActive] = useState(() => loadActive(profile.id));
  const plan = useMemo(() => (settings && all ? buildPlan(settings, all) : undefined), [settings, all]);

  if (!settings || !all || !plan) return null;
  const sessions = liveSessions(all);
  const now = new Date();
  const week = thisWeek(sessions, now);
  const last = sessions[0];
  const lastPain = sessions.find((s) => s.footPain != null);
  const abandoned = !!active && isAbandoned(active, Date.now());

  const start = () => {
    unlockAudio();
    saveActive(profile.id, startSession(plan, Date.now(), crypto.randomUUID(), profile.id));
    navigate('/sessao');
  };

  return (
    <>
      <PageHeader title={`Olá, ${profile.name}`} subtitle={`${capitalize(formatLongDate(now))} · treino de hoje`} />

      {active && (
        <div className="alert warning">
          <Timer className="alert-icon" size={20} aria-hidden />
          <div className="alert-body">
            <strong>{abandoned ? 'Treino interrompido' : 'Treino em andamento'}</strong>
            <span>
              {abandoned
                ? 'O treino ficou parado no meio (o app foi fechado ou ficou pausado por horas). Salve o que você fez ou descarte.'
                : `${Math.floor(activeMs(active, Date.now()) / 60000)} min de treino até agora. Continue de onde parou ou descarte.`}
            </span>
            <div className="btn-row" style={{ marginTop: 8 }}>
              {abandoned ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    const record = abandonedRecord(active, Date.now());
                    if (record.entries.length) void saveSession(db, record);
                    saveActive(profile.id, undefined);
                    setActive(undefined);
                  }}
                >
                  Salvar o que foi feito
                </button>
              ) : (
                <button type="button" className="btn small" onClick={() => navigate('/sessao')}>
                  <Play size={16} aria-hidden /> Continuar
                </button>
              )}
              <button
                type="button"
                className="btn small danger"
                onClick={() => {
                  if (!confirm('Descartar o treino em andamento? Nada dele será salvo.')) return;
                  saveActive(profile.id, undefined);
                  setActive(undefined);
                }}
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {!settings.configured ? (
        <section className="card">
          <div className="card-header">
            <h2>Vamos montar seu treino</h2>
          </div>
          <p className="muted">
            Cada treino tem até 1 hora: aquecimento que faz suar, exercícios para a fascite plantar, bastante braço e um
            alongamento no fim. Conte o que você tem em casa:
          </p>
          <TrainingSettings value={settings} onChange={changeSettings} />
          <button type="button" className="btn block" onClick={() => changeSettings({ configured: true })}>
            Ver meu treino
          </button>
        </section>
      ) : (
        <section className="card">
          <div className="card-header">
            <h2>
              <Timer size={20} aria-hidden /> ≈ {minutes(plan.totalSec)}
            </h2>
            <div className="chips" role="group" aria-label="Duração do treino">
              {([30, 45, 60] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={settings.durationMin === d}
                  onClick={() => changeSettings({ durationMin: d })}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            Limite de {SESSION_LIMIT_SEC / 60} min por treino (pausas não contam). Toque num exercício para ver como fazer.
          </p>
          <button type="button" className="btn block big" onClick={start} disabled={!!active}>
            <Play size={20} aria-hidden /> Começar treino
          </button>
          <PlanView plan={plan} />
        </section>
      )}

      <div className="grid-2 stack-sm">
        <section className="stat">
          <span className="stat-label">
            <CalendarCheck size={16} aria-hidden /> Esta semana
          </span>
          <span className="stat-value">
            {week} <small>de {settings.weeklyGoal} treinos</small>
          </span>
          <Meter value={week} max={settings.weeklyGoal} label="Treinos na semana" slim />
          <span className="stat-sub">
            {last ? `Último: ${relativeDay(new Date(last.startedAt), now).toLowerCase()}, ${minutes(last.activeSec)}` : 'Nenhum treino ainda'}
          </span>
        </section>
        <Link className="stat" to="/historico">
          <span className="stat-label">
            <Footprints size={16} aria-hidden /> Dor no pé
          </span>
          <span className="stat-value">{lastPain ? <>{lastPain.footPain} <small>de 10</small></> : '—'}</span>
          <span className="stat-sub">
            {lastPain ? `Registrada ${relativeDay(new Date(lastPain.startedAt), now).toLowerCase()}` : 'Registre ao fim de cada treino'}
          </span>
        </Link>
      </div>

      <Link to="/ajustes" className={`sync-line${sync.error ? ' error' : ''}`}>
        {sync.enabled ? <Cloud size={16} aria-hidden /> : <CloudOff size={16} aria-hidden />}
        {!sync.enabled
          ? 'Sincronização desligada: ative para usar no celular e no computador'
          : sync.error
            ? `Erro ao sincronizar: ${sync.error}`
            : sync.running
              ? 'Sincronizando…'
              : sync.lastSyncAt
                ? `Sincronizado às ${formatTime(new Date(sync.lastSyncAt))}`
                : 'Sincronização ativada'}
        {sync.running && <RotateCcw size={14} className="spin" aria-hidden />}
      </Link>
    </>
  );
}
