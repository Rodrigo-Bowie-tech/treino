export type Equipment = 'halteres' | 'elastico' | 'barra';

export type Category = 'aquecimento' | 'fascite' | 'biceps' | 'triceps' | 'ombros' | 'antebraco' | 'alongamento';

/** Blocos do treino, nesta ordem. */
export type Phase = 'aquecimento' | 'fascite' | 'bracos' | 'alongamento';

export type Side = 'esquerdo' | 'direito';

export type FootSide = 'ambos' | Side;

interface BaseExercise {
  id: string;
  name: string;
  category: Category;
  /** Equipamento exigido; sem valor = feito em casa sem equipamento. */
  equipment?: Equipment;
  /** Alternativa caseira: só entra no treino de quem não tem este equipamento. */
  replaces?: Equipment;
  /** Objetos comuns usados (cadeira, toalha...), só para exibir. */
  needs?: string;
  steps: string[];
  tip?: string;
  caution?: string;
  /** Feito sentado ou deitado (poupa o pé). */
  seated?: boolean;
  /** Feito de um lado de cada vez. */
  perSide?: boolean;
  /** Descanso entre séries; sem valor = descanso padrão dos ajustes (ou nenhum, nos exercícios por tempo). */
  restSec?: number;
}

/** Exercício por tempo (aquecimento, alongamentos, isometrias). */
export interface TimedExercise extends BaseExercise {
  kind: 'tempo';
  seconds: number;
  sets?: number;
}

/** Exercício por repetições, em séries. */
export interface RepsExercise extends BaseExercise {
  kind: 'reps';
  sets: number;
  reps: [min: number, max: number];
  /** Segundos estimados por repetição (para calcular a duração). */
  secPerRep?: number;
  /** Registra a carga (kg). */
  load?: boolean;
  /** Começa sem carga extra (o peso entra depois, como progressão). */
  bodyweightFirst?: boolean;
  /** Cadência recomendada, ex.: "3 s subindo · 2 s parado · 3 s descendo". */
  tempo?: string;
}

export type Exercise = TimedExercise | RepsExercise;

/** PIN guardado só como hash (PBKDF2-SHA-256 com sal). */
export interface PinHash {
  salt: string;
  hash: string;
  iterations: number;
}

/** Perfil de uma pessoa que usa o app. Cada perfil tem seus ajustes e treinos. */
export interface Profile {
  id: string;
  name: string;
  pin: PinHash;
  createdAt: string;
  updatedAt: number;
  /** Excluído (mantido para propagar a exclusão aos outros aparelhos). */
  deleted?: boolean;
}

export interface Settings {
  /** Id do perfil dono destes ajustes. */
  id: string;
  /** Equipamentos disponíveis (sem equipamento está sempre disponível). */
  equipment: Equipment[];
  /** Duração planejada do treino (o limite é sempre 60 min). */
  durationMin: 30 | 45 | 60;
  /** Descanso entre séries dos exercícios de braço. */
  restSec: number;
  /** Inclui o bloco de fascite plantar. */
  fasciitis: boolean;
  footSide: FootSide;
  weeklyGoal: number;
  voice: boolean;
  sound: boolean;
  /** Já passou pela configuração inicial. */
  configured: boolean;
  updatedAt: number;
}

export interface SetLog {
  reps?: number;
  load?: number;
  seconds?: number;
}

export interface SessionEntry {
  exerciseId: string;
  phase: Phase;
  sets: SetLog[];
}

export type EndReason = 'concluido' | 'limite' | 'encerrado';

export interface SessionRecord {
  id: string;
  /** Perfil que fez o treino (só falta em dados antigos, antes dos perfis). */
  profileId?: string;
  startedAt: string;
  endedAt: string;
  /** Tempo de treino, sem as pausas. */
  activeSec: number;
  plannedMin: number;
  endedBy: EndReason;
  entries: SessionEntry[];
  /** Dor no calcanhar/sola do pé (0 a 10). */
  footPain?: number;
  notes?: string;
  updatedAt: number;
  /** Excluído (mantido para propagar a exclusão aos outros aparelhos). */
  deleted?: boolean;
}

export interface PlanItem {
  exerciseId: string;
  phase: Phase;
  sets: number;
  /** Segundos por série (exercícios por tempo). */
  seconds?: number;
  /** Faixa de repetições (exercícios por repetições). */
  reps?: [number, number];
  restSec: number;
  /** Lados a fazer, quando o exercício é de um lado de cada vez. */
  sides?: Side[];
  target?: Target;
  estSec: number;
}

export interface Target {
  reps?: number;
  load?: number;
  note: string;
}

export interface Plan {
  durationMin: number;
  items: PlanItem[];
  totalSec: number;
}
