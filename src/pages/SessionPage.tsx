import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, StretchHorizontal } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToasts } from '../components/Toasts';
import { ExerciseInfo } from '../components/ExerciseInfo';
import { PainScale } from '../components/PainScale';
import { PHASE_LABELS, getExercise } from '../data/exercises';
import { db, saveSession } from '../db';
import { useProfile, useSettings } from '../hooks/data';
import { loadActive, saveActive } from '../lib/activeStore';
import { beep, clock, keepScreenOn, speak, spokenDuration, unlockAudio, vibrate } from '../lib/cues';
import { fmtKg, summarizeSets } from '../lib/progress';
import {
  activeMs,
  addTime,
  currentPhase,
  currentStep,
  isFinished,
  jumpToPhase,
  limitReached,
  logSet,
  next,
  pause,
  previous,
  resume,
  stepDurationMs,
  stepRemainingMs,
  stepsOf,
  tick,
  toRecord,
  type ActiveSession,
} from '../lib/session';
import { LIMIT_WARNINGS_SEC, SESSION_LIMIT_SEC, isTimed, type Step } from '../lib/steps';
import type { EndReason, Phase, PlanItem, SessionRecord } from '../types';

const PHASES: Phase[] = ['aquecimento', 'fascite', 'bracos', 'alongamento'];

function sideLabel(step: Step, item: PlanItem): string {
  if (step.kind !== 'tempo' || !step.side) return '';
  return getExercise(item.exerciseId).category === 'fascite' ? `Pé ${step.side}` : `Lado ${step.side}`;
}

function setLabel(step: Step, item: PlanItem): string {
  if (step.kind === 'prep') return 'Prepare-se';
  if (step.kind === 'descanso') return 'Descanso';
  const parts = item.sets > 1 ? [`Série ${step.set} de ${item.sets}`] : [];
  const side = sideLabel(step, item);
  if (side) parts.push(side);
  return parts.join(' · ');
}

/** O que a voz diz no começo de cada etapa. */
function announcement(s: ActiveSession, step: Step): string {
  const item = s.plan.items[step.item];
  const ex = getExercise(item.exerciseId);
  switch (step.kind) {
    case 'prep':
      return `Próximo: ${ex.name}.`;
    case 'descanso':
      return `Descanso, ${spokenDuration(step.seconds)}.`;
    case 'serie': {
      const reps = item.target?.reps ?? item.reps?.[1];
      const load = item.target?.load ? `, com ${item.target.load.toLocaleString('pt-BR')} quilos` : '';
      const set = item.sets > 1 ? `Série ${step.set} de ${item.sets}. ` : '';
      return `${step.set === 1 ? `${ex.name}. ` : ''}${set}${reps} repetições${load}${item.sides && item.sides.length > 1 ? ' com cada lado' : ''}.`;
    }
    case 'tempo': {
      const first = step.set === 1 && (!step.side || step.side === item.sides?.[0]);
      const side = sideLabel(step, item).toLowerCase();
      if (!first) return side ? `Agora, ${side}.` : `Série ${step.set}.`;
      return `${ex.name}, ${spokenDuration(step.seconds)}${side ? `, ${side}` : ''}.`;
    }
  }
}

function Stepper({ label, value, onChange, step = 1, unit }: { label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string }) {
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <div className="stepper-row">
        <button type="button" className="icon-btn" aria-label={`Diminuir ${label.toLowerCase()}`} onClick={() => onChange(Math.max(0, Math.round((value - step) * 10) / 10))}>
          <Minus size={20} />
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          aria-label={label}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(',', '.')) || 0))}
        />
        {unit && <span className="muted">{unit}</span>}
        <button type="button" className="icon-btn" aria-label={`Aumentar ${label.toLowerCase()}`} onClick={() => onChange(Math.round((value + step) * 10) / 10)}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

interface Finished {
  record: SessionRecord;
}

export function SessionPage() {
  const navigate = useNavigate();
  const profile = useProfile();
  const settings = useSettings();
  const { notify } = useToasts();
  const [session, setSession] = useState<ActiveSession | undefined>(() => loadActive(profile.id));
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState<Finished | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reps, setReps] = useState(0);
  const [load, setLoad] = useState(0);
  const lastBeep = useRef('');

  const voiceOn = settings?.voice ?? true;
  const soundOn = settings?.sound ?? true;

  const commit = useCallback(
    (next: ActiveSession) => {
      saveActive(next.profileId, next);
      setSession(next);
    },
    [],
  );

  const act = (fn: (s: ActiveSession, now: number) => ActiveSession) => {
    unlockAudio();
    if (session) commit(fn(session, Date.now()));
  };

  const finish = useCallback(
    (s: ActiveSession, reason: EndReason, at: number) => {
      const record = toRecord(s, at, reason);
      saveActive(s.profileId, undefined);
      setSession(undefined);
      setFinished({ record });
      if (record.entries.length) void saveSession(db, record);
      if (soundOn) beep('longo');
      vibrate([200, 100, 200]);
      if (voiceOn) {
        speak(reason === 'limite' ? 'Limite de uma hora atingido. Treino encerrado. Muito bem!' : 'Treino concluído. Muito bem!');
      }
    },
    [soundOn, voiceOn],
  );

  // Relógio.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Tela ligada durante o treino.
  useEffect(() => keepScreenOn(), []);

  // Avança as etapas por tempo, controla o limite de 1 hora e os avisos.
  useEffect(() => {
    if (!session) return;
    if (limitReached(session, now)) return finish(session, 'limite', now);
    const { session: ticked, advanced } = tick(session, now);
    if (isFinished(ticked)) return finish(ticked, 'concluido', now);
    let nextSession = advanced ? ticked : session;

    const activeSec = activeMs(nextSession, now) / 1000;
    const due = LIMIT_WARNINGS_SEC.find((w) => activeSec >= w && !nextSession.warned.includes(w));
    if (due != null) {
      nextSession = { ...nextSession, warned: [...nextSession.warned, due] };
      const left = Math.round((SESSION_LIMIT_SEC - due) / 60);
      if (soundOn) beep('aviso');
      if (voiceOn) speak(`Faltam ${left} minutos para o limite de uma hora.`);
    }
    if (nextSession !== session) commit(nextSession);

    // Bipes de contagem regressiva nos 3 últimos segundos.
    const step = currentStep(nextSession);
    if (step && isTimed(step) && nextSession.pausedAt == null && soundOn) {
      const left = Math.ceil(stepRemainingMs(nextSession, now) / 1000);
      const key = `${nextSession.index}-${left}`;
      if (left >= 1 && left <= 3 && lastBeep.current !== key) {
        lastBeep.current = key;
        beep('curto');
      }
    }
  }, [now, session, finish, commit, soundOn, voiceOn]);

  // Anuncia cada etapa nova e prepara os campos da série.
  const index = session?.index;
  useEffect(() => {
    if (!session) return;
    const step = currentStep(session);
    if (!step) return;
    if (step.kind === 'serie') {
      const item = session.plan.items[step.item];
      const logged = session.log.find((l) => l.item === step.item && l.set === step.set)?.data;
      const prevSet = session.log.filter((l) => l.item === step.item && l.set < step.set).at(-1)?.data;
      setReps(logged?.reps ?? prevSet?.reps ?? item.target?.reps ?? item.reps?.[1] ?? 10);
      setLoad(logged?.load ?? prevSet?.load ?? item.target?.load ?? 0);
    }
    if (session.pausedAt != null) return;
    if (soundOn && session.index > 0) beep(step.kind === 'descanso' ? 'aviso' : 'longo');
    if (session.index > 0) vibrate(150);
    if (voiceOn) speak(announcement(session, step));
    // Só ao mudar de etapa (não a cada segundo do relógio).
  }, [index, session?.id]);

  // Atalhos de teclado no computador: espaço pausa/continua, → pula.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!session || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.key === ' ') {
        e.preventDefault();
        commit(session.pausedAt != null ? resume(session, Date.now()) : pause(session, Date.now()));
      } else if (e.key === 'ArrowRight') {
        commit(next(session, Date.now()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, commit]);

  if (finished) return <FinishScreen record={finished.record} onDone={() => navigate('/')} notify={notify} />;
  if (!session) return <Navigate to="/" replace />;

  const steps = stepsOf(session);
  const step = currentStep(session);
  if (!step) return null;
  const item = session.plan.items[step.item];
  const ex = getExercise(item.exerciseId);
  const phase = currentPhase(session)!;
  const paused = session.pausedAt != null;
  const elapsedSec = activeMs(session, now) / 1000;
  const remainingSec = Math.ceil(stepRemainingMs(session, now) / 1000);
  const phaseItems = session.plan.items.map((it, i) => ({ it, i })).filter(({ it }) => it.phase === phase);
  const posInPhase = phaseItems.findIndex(({ i }) => i === step.item) + 1;
  const nearLimit = elapsedSec >= SESSION_LIMIT_SEC - 5 * 60 && phase !== 'alongamento' && session.plan.items.some((it) => it.phase === 'alongamento');
  const nextStep = steps[session.index + 1];
  const nextItem = nextStep && session.plan.items[nextStep.item];
  const prevLogged = session.log.filter((l) => l.item === step.item).map((l) => l.data);
  const firstOfExercise =
    step.kind === 'prep' ||
    (step.kind === 'serie' && step.set === 1) ||
    (step.kind === 'tempo' && step.set === 1 && (!step.side || step.side === item.sides?.[0]));

  return (
    <div className={`player phase-${phase}${paused ? ' is-paused' : ''}`}>
      <header className="player-top">
        <button
          type="button"
          className="icon-btn big"
          aria-label={paused ? 'Continuar' : 'Pausar'}
          onClick={() => act((s, t) => (paused ? resume(s, t) : pause(s, t)))}
        >
          {paused ? <Play size={22} /> : <Pause size={22} />}
        </button>
        <div className="player-clock" aria-label="Tempo de treino">
          <strong>{clock(elapsedSec)}</strong>
          <span className="muted"> / {clock(SESSION_LIMIT_SEC)}</span>
        </div>
        <button type="button" className="btn small secondary" onClick={() => setConfirmEnd(true)}>
          Encerrar
        </button>
      </header>
      <div
        className={`meter slim${elapsedSec >= LIMIT_WARNINGS_SEC[0] ? ' over' : ''}`}
        role="progressbar"
        aria-label="Tempo usado do limite de 1 hora"
        aria-valuemin={0}
        aria-valuemax={60}
        aria-valuenow={Math.floor(elapsedSec / 60)}
      >
        <span style={{ width: `${Math.min(100, (elapsedSec / SESSION_LIMIT_SEC) * 100)}%` }} />
      </div>

      <ol className="phase-strip" aria-label="Blocos do treino">
        {PHASES.filter((p) => session.plan.items.some((it) => it.phase === p)).map((p) => (
          <li key={p} aria-current={p === phase ? 'step' : undefined} className={PHASES.indexOf(p) < PHASES.indexOf(phase) ? 'done' : ''}>
            {PHASE_LABELS[p]}
          </li>
        ))}
      </ol>

      {elapsedSec >= LIMIT_WARNINGS_SEC[0] && (
        <div className="alert warning">
          <div className="alert-body">
            <strong>Faltam {Math.max(0, Math.ceil((SESSION_LIMIT_SEC - elapsedSec) / 60))} min para o limite de 1 hora</strong>
            <span>O treino termina e é salvo automaticamente ao completar 1 hora.</span>
            {nearLimit && (
              <button type="button" className="btn small" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => act((s, t) => jumpToPhase(s, 'alongamento', t))}>
                <StretchHorizontal size={16} aria-hidden /> Ir para o alongamento final
              </button>
            )}
          </div>
        </div>
      )}

      <section className={`step-card kind-${step.kind}`} aria-live="polite">
        <p className="overline">
          {PHASE_LABELS[phase]} · {posInPhase} de {phaseItems.length}
        </p>
        <h1>{ex.name}</h1>
        <p className="step-sub">{setLabel(step, item)}</p>

        {isTimed(step) ? (
          <>
            <div className="big-clock" role="timer" aria-label="Tempo restante">
              {clock(remainingSec)}
            </div>
            <div className="meter" aria-hidden>
              <span style={{ width: `${Math.min(100, Math.max(0, 100 - (remainingSec * 1000 * 100) / Math.max(1, stepDurationMs(session))))}%` }} />
            </div>
            {step.kind === 'descanso' && nextItem && nextStep.kind === 'serie' && (
              <p className="muted center">
                Próximo: série {nextStep.set} de {nextItem.sets}
                {nextItem.target?.reps ? ` · ${nextItem.target.reps} repetições` : ''}
                {nextItem.target?.load ? ` · ${fmtKg(nextItem.target.load)}` : ''}
              </p>
            )}
            <div className="btn-row center">
              <button type="button" className="btn secondary" onClick={() => act((s) => addTime(s, 15))}>
                <Plus size={18} aria-hidden /> 15 s
              </button>
              <button type="button" className="btn" onClick={() => act(next)}>
                {step.kind === 'tempo' ? 'Concluir' : 'Começar já'} <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <>
            {item.target && <p className="target">{item.target.note}</p>}
            {prevLogged.length > 0 && <p className="muted small center">Hoje: {summarizeSets(prevLogged)}</p>}
            <div className="steppers">
              <Stepper label="Repetições" value={reps} onChange={setReps} />
              {ex.kind === 'reps' && ex.load && <Stepper label="Carga" unit="kg" value={load} onChange={setLoad} step={ex.id === 'fa-elevacao' ? 1 : 0.5} />}
            </div>
            <button
              type="button"
              className="btn block big"
              disabled={reps <= 0}
              onClick={() => act((s, t) => logSet(s, { reps, ...(load > 0 ? { load } : {}) }, t))}
            >
              <Check size={20} aria-hidden /> Concluir série
            </button>
          </>
        )}
      </section>

      <details key={session.index} className="card how" open={firstOfExercise}>
        <summary>Como fazer</summary>
        <ExerciseInfo ex={ex} compact />
      </details>

      <nav className="player-nav" aria-label="Etapas">
        <button type="button" className="btn ghost" onClick={() => act(previous)} disabled={session.index === 0}>
          <ChevronLeft size={18} aria-hidden /> Voltar
        </button>
        <span className="muted small">
          {session.index + 1} / {steps.length}
        </span>
        <button type="button" className="btn ghost" onClick={() => act(next)}>
          Pular <ChevronRight size={18} aria-hidden />
        </button>
      </nav>

      {paused && (
        <div className="paused-overlay">
          <p>Treino pausado</p>
          <p className="muted small">As pausas não contam no limite de 1 hora.</p>
          <button type="button" className="btn big" onClick={() => act(resume)}>
            <Play size={20} aria-hidden /> Continuar
          </button>
        </div>
      )}

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="Encerrar o treino?"
        footer={
          <>
            <button type="button" className="btn danger" onClick={() => {
              if (!confirm('Descartar este treino? Nada dele será salvo.')) return;
              saveActive(profile.id, undefined);
              setSession(undefined);
            }}>
              Descartar
            </button>
            <span className="spacer" />
            <button type="button" className="btn secondary" onClick={() => setConfirmEnd(false)}>
              Continuar treinando
            </button>
            <button type="button" className="btn" onClick={() => { setConfirmEnd(false); finish(session, 'encerrado', Date.now()); }}>
              Encerrar e salvar
            </button>
          </>
        }
      >
        <p>O que você já fez fica salvo no histórico. Faltavam {steps.length - session.index} etapas.</p>
      </Modal>
    </div>
  );
}

function FinishScreen({ record, onDone, notify }: { record: SessionRecord; onDone: () => void; notify: (t: { title: string; body?: string }) => void }) {
  const [pain, setPain] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const arms = record.entries.filter((e) => e.phase === 'bracos');
  const armSets = arms.reduce((n, e) => n + e.sets.length, 0);
  const volume = arms.reduce((t, e) => t + e.sets.reduce((v, s) => v + (s.reps ?? 0) * (s.load ?? 0), 0), 0);
  const title = record.endedBy === 'limite' ? 'Limite de 1 hora atingido' : record.endedBy === 'encerrado' ? 'Treino encerrado' : 'Treino concluído!';

  const save = async () => {
    if (record.entries.length) {
      await saveSession(db, { ...record, ...(pain != null ? { footPain: pain } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      notify({ title: 'Treino salvo', body: 'Ele aparece no histórico de todos os seus aparelhos sincronizados.' });
    }
    onDone();
  };

  return (
    <div className="player finish">
      <section className="card">
        <h1>{title}</h1>
        {!record.entries.length ? (
          <p className="muted">Nenhum exercício foi registrado, então nada foi salvo.</p>
        ) : (
          <>
            <div className="grid-2">
              <div className="stat">
                <span className="stat-label">Tempo de treino</span>
                <span className="stat-value">{clock(record.activeSec)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Exercícios</span>
                <span className="stat-value">{record.entries.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Séries de braço</span>
                <span className="stat-value">{armSets}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Volume de braço</span>
                <span className="stat-value">{volume ? fmtKg(volume) : '—'}</span>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Como está a dor no calcanhar/sola do pé hoje? (0 = nenhuma, 10 = a pior)</span>
              <PainScale value={pain} onChange={setPain} />
            </div>
            <label className="field">
              <span>Anotações (opcional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: rosca martelo ficou fácil; pé doeu no aquecimento." />
            </label>
          </>
        )}
        <button type="button" className="btn block big" onClick={() => void save()}>
          {record.entries.length ? 'Salvar' : 'Voltar ao início'}
        </button>
      </section>
    </div>
  );
}
