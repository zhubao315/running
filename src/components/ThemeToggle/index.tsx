import useTheme from '@/hooks/useTheme';
import styles from './style.module.css';

/**
 * The light/dark switch in the header.
 *
 * The button shows an icon only: the sun while the page is dark (it switches
 * to light), the moon while it is light (it switches back). The words live in
 * the aria-label and the tooltip, so the button stays readable for a screen
 * reader without taking space in the header.
 *
 * Which icon is shown is decided by the theme attribute in CSS, not by
 * rebuilding the DOM — the same switch behaves the same on all four sites.
 */
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === 'dark';
  const action = toLight ? '切换到亮色主题' : '切换到暗色主题';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={action}
      title={action}
      aria-pressed={toLight}
      data-theme-state={theme}
    >
      <svg
        className={`${styles.icon} ${styles.sun}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
      <svg
        className={`${styles.icon} ${styles.moon}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z" />
      </svg>
    </button>
  );
};

export default ThemeToggle;
