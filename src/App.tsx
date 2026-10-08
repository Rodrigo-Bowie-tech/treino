import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Dumbbell, History, ListChecks, Settings } from 'lucide-react';
import { Avatar } from './components/PinField';
import { db } from './db';
import { ProfileContext, useCurrentProfileId, useProfiles } from './hooks/data';
import { setCurrentProfileId } from './lib/profiles';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { HistoryPage } from './pages/HistoryPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ConnectPage } from './pages/ConnectPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const location = useLocation();
  const inSession = location.pathname === '/sessao';
  const connecting = location.pathname.startsWith('/conectar');
  const profiles = useProfiles();
  const currentId = useCurrentProfileId();
  const profile = profiles?.find((p) => p.id === currentId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Perfil excluído (aqui ou em outro aparelho): volta para a tela de entrada. Confere no banco,
  // porque logo depois de criar o perfil a lista ainda pode não ter sido atualizada.
  useEffect(() => {
    if (!profiles || !currentId || profile) return;
    let alive = true;
    void db.profiles.get(currentId).then((p) => {
      if (alive && (!p || p.deleted)) setCurrentProfileId(undefined);
    });
    return () => {
      alive = false;
    };
  }, [profiles, currentId, profile]);

  // Conectar a sincronização pelo código QR não exige perfil (o perfil pode estar no outro aparelho).
  if (connecting) {
    return (
      <div className="app in-session">
        <main className="content">
          <Routes>
            <Route path="/conectar" element={<ConnectPage />} />
            <Route path="/conectar/:code" element={<ConnectPage />} />
          </Routes>
        </main>
      </div>
    );
  }

  // Carregando, ou esperando o perfil recém-criado aparecer na lista.
  if (!profiles || (currentId && !profile)) return null;

  if (!profile) {
    return (
      <div className="app in-session">
        <main className="content">
          <LoginPage />
        </main>
      </div>
    );
  }

  const links = [
    { to: '/', label: 'Treino', icon: Dumbbell, end: true },
    { to: '/historico', label: 'Histórico', icon: History },
    { to: '/exercicios', label: 'Exercícios', icon: ListChecks },
    { to: '/ajustes', label: 'Ajustes', icon: Settings },
  ];

  return (
    <ProfileContext.Provider value={profile}>
      <div className={`app${inSession ? ' in-session' : ''}`}>
        {!inSession && (
          <nav className="nav" aria-label="Principal">
            <div className="nav-brand">
              <img src="./icons/favicon.svg" alt="" /> Treino
            </div>
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={22} aria-hidden />
                <span>{label}</span>
              </NavLink>
            ))}
            <Link to="/ajustes" className="nav-profile" aria-label={`Perfil: ${profile.name}`}>
              <Avatar name={profile.name} /> <span>{profile.name}</span>
            </Link>
          </nav>
        )}
        <main className="content">
          {/* A chave troca as telas inteiras ao trocar de perfil (nada de um perfil fica na tela do outro). */}
          <Routes key={profile.id}>
            <Route path="/" element={<HomePage />} />
            <Route path="/sessao" element={<SessionPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/exercicios" element={<ExercisesPage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ProfileContext.Provider>
  );
}
