import useSiteMetadata from '@/hooks/useSiteMetadata';
import SportIcon from '@/components/SportIcon';
import styles from './style.module.css';

const ORDER = ['health', 'running', 'cycling', 'hiking'] as const;
type SiteKey = (typeof ORDER)[number];

const LABELS: Record<SiteKey, { zh: string; en: string }> = {
  health: { zh: '健康', en: 'HEALTH' },
  running: { zh: '跑步', en: 'RUNNING' },
  cycling: { zh: '骑行', en: 'CYCLING' },
  hiking: { zh: '徒步', en: 'HIKING' },
};

const isSiteKey = (name: string): name is SiteKey =>
  (ORDER as readonly string[]).includes(name);

/**
 * The mobile navigation.
 *
 * On a phone the four sites belong in a bar the thumb can reach: one icon,
 * one Chinese word, the current site in its own accent colour. The bar sits
 * above the home indicator of the phone and never covers the map or a table
 * — the page reserves the space it needs.
 */
const BrandNav = () => {
  const { navLinks, siteUrl } = useSiteMetadata();
  const current = siteUrl.replace(/\/$/, '').split('/').pop() ?? '';
  const sites = navLinks.filter((link) => isSiteKey(link.name.toLowerCase()));

  return (
    <nav className={styles.bar} aria-label="四站导航">
      <div className={styles.inner}>
        {sites.map((link) => {
          const key = link.name.toLowerCase() as SiteKey;
          const active = key === current;
          return (
            <a
              key={key}
              href={link.url}
              className={`${styles.item} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
              title={`${LABELS[key].zh} · ${LABELS[key].en}`}
            >
              <SportIcon name={key} size={22} className={styles.icon} />
              <span className={styles.label}>{LABELS[key].zh}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
};

export default BrandNav;
