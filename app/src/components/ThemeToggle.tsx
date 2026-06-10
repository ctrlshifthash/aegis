import type { Theme } from '../App';

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isLight = theme === 'light';
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      <span className={`tt-track ${isLight ? 'light' : ''}`}>
        <span className="tt-thumb">{isLight ? '☀' : '☾'}</span>
      </span>
    </button>
  );
}
