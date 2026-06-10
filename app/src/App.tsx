import { useEffect, useState } from 'react';
import Landing from './pages/Landing';
import Dapp from './pages/Dapp';
import { CursorGlow } from './components/CursorGlow';
import { useMagnetic } from './hooks/useReveal';

type View = 'landing' | 'app';
export type Theme = 'dark' | 'light';

export default function App() {
  // Lightweight hash routing so /#app deep-links into the dApp.
  const [view, setView] = useState<View>(() =>
    window.location.hash === '#app' ? 'app' : 'landing',
  );
  const [theme, setTheme] = useState<Theme>(() => {
    const p = new URLSearchParams(window.location.search).get('theme');
    if (p === 'light' || p === 'dark') return p;
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });

  useEffect(() => {
    const onHash = () => setView(window.location.hash === '#app' ? 'app' : 'landing');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function go(next: View) {
    window.location.hash = next === 'app' ? 'app' : '';
    setView(next);
    window.scrollTo({ top: 0 });
  }

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  useMagnetic();

  return (
    <>
      <CursorGlow />
      {view === 'app' ? (
        <Dapp onHome={() => go('landing')} theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <Landing onLaunch={() => go('app')} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </>
  );
}
