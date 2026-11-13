import useSiteMetadata from '@/hooks/useSiteMetadata';
import ThemeToggle from '@/components/ThemeToggle';
import BrandMark from '@/components/BrandMark';
import SportIcon from '@/components/SportIcon';
import styles from './style.module.css';

const ORDER = ['health', 'running', 'cycling', 'hiking'] as const;
type SiteKey = (typeof ORDER)[number];

/**
 * The four sites share one navigation. Each entry carries a Chinese label —
 * the word a person reads first — and the English name of the site, so the
 * navigation stays the brand it always was while being readable at a glance.
 */
const LABELS: Record<SiteKey, { zh: string; en: string }> = {
  health: { zh: '健康', en: 'HEALTH' },
  running: { zh: '跑步', en: 'RUNNING' },
  cycling: { zh: '骑行', en: 'CYCLING' },
  hiking: { zh: '徒步', en: 'HIKING' },
};

const isSiteKey = (name: string): name is SiteKey =>
  (ORDER as readonly string[]).includes(name);

const Header = () => {
  const { logo, siteUrl, navLinks, siteTitle, sportLabel } = useSiteMetadata();
  const current = siteUrl.replace(/\/$/, '').split('/').pop() ?? '';
  const sites = navLinks.filter((link) => isSiteKey(link.name.toLowerCase()));
  const extras = navLinks.filter((link) => !isSiteKey(link.name.toLowerCase()));

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href={siteUrl} className={styles.brand} aria-label="ZB ACTIVE">
          <BrandMark size={26} className={styles.mark} />
          <span className={styles.wordmark}>ZB ACTIVE</span>
          <span className={styles.rule} aria-hidden="true" />
          <span className={styles.site}>
            <span className={styles.siteZh}>{sportLabel || siteTitle}</span>
            <span className={styles.siteEn}>{current.toUpperCase()}</span>
          </span>
          {/* The personal avatar stays a personal thing: it is not the brand
              mark of a sport site any more. */}
          <img className={styles.avatar} alt="" src={logo} hidden />
        </a>
        <div className={styles.right}>
          <nav className={styles.nav} aria-label="运动与健康站点导航">
            {sites.map((link) => {
              const key = link.name.toLowerCase() as SiteKey;
              const active = key === current;
              return (
                <a
                  key={key}
                  href={link.url}
                  data-site={key}
                  className={`${styles.navItem} ${active ? styles.navActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={`${LABELS[key].zh} · ${LABELS[key].en}`}
                >
                  <SportIcon name={key} size={16} className={styles.navIcon} />
                  <span className={styles.navText}>
                    <span className={styles.navZh}>{LABELS[key].zh}</span>
                    <span className={styles.navEn}>{LABELS[key].en}</span>
                  </span>
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
