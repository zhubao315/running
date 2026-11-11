import useTheme from '@/hooks/useTheme';
import styles from './style.module.css';

/**
 * The light/dark switch in the header.
 *
 * The label states the theme the button switches *to*, not the one that is
 * on: in the dark theme it reads "亮色 / LIGHT". The glyph is a decoration
 * only — the words carry the meaning, so the button works with a screen
 * reader and without the symbol font.
 */
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === 'dark';
  const label = toLight ? '亮色' : '暗色';
  const english = toLight ? 'LIGHT' : 'DARK';
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
      <span className={styles.glyph} aria-hidden="true">
        {toLight ? '☼' : '☾'}
      </span>
      <span className={styles.zh}>{label}</span>
      <span className={styles.en}>{english}</span>
    </button>
  );
};

export default ThemeToggle;
