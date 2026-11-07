import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.css';

const ORDER = ['health', 'running', 'cycling', 'hiking'] as const;
const LABELS: Record<string, string> = {
  health: 'HEALTH',
  running: 'RUNNING',
  cycling: 'CYCLING',
  hiking: 'HIKING',
};

const Header = () => {
  const { logo, siteUrl, navLinks, siteTitle } = useSiteMetadata();
  const current = siteUrl.replace(/\/$/, '').split('/').pop() ?? '';
  const sites = navLinks.filter((link) =>
    ORDER.includes(link.name.toLowerCase() as (typeof ORDER)[number])
  );
  const extras = navLinks.filter(
    (link) => !ORDER.includes(link.name.toLowerCase() as (typeof ORDER)[number])
  );

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href={siteUrl} className={styles.brand}>
          <img className={styles.logo} alt="" src={logo} />
          <span className={styles.name}>{siteTitle}</span>
        </a>
        <nav className={styles.nav} aria-label="四站导航">
          {sites.map((link) => {
            const key = link.name.toLowerCase();
            const active = key === current;
            return (
              <a
                key={key}
                href={link.url}
                className={`${styles.navItem} ${active ? styles.navActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {LABELS[key]}
              </a>
            );
          })}
          {extras.map((link) => (
            <a
              key={link.name}
              href={link.url}
              className={styles.navX}
              target="_blank"
              rel="noreferrer"
            >
              {link.name}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
