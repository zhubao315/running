import useSiteMetadata from '@/hooks/useSiteMetadata';
import BrandMark from '@/components/BrandMark';
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

const Footer = () => {
  const { navLinks, repoUrl, siteTitle } = useSiteMetadata();
  const sites = navLinks.filter((link) => isSiteKey(link.name.toLowerCase()));
  const extras = navLinks.filter((link) => !isSiteKey(link.name.toLowerCase()));

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <BrandMark size={30} className={styles.mark} />
          <span className={styles.brandText}>
            <span className={styles.wordmark}>ZB ACTIVE</span>
            <span className={styles.brandLine}>朱宝 · 运动与健康数字档案</span>
          </span>
        </div>

        <nav className={styles.links} aria-label="四站导航">
          {sites.map((link) => {
            const key = link.name.toLowerCase() as SiteKey;
            return (
              <a key={key} href={link.url} className={styles.link}>
                <SportIcon name={key} size={15} className={styles.linkIcon} />
                <span>{LABELS[key].zh}</span>
              </a>
            );
          })}
          {extras.map((link) => (
            <a
              key={link.name}
              href={link.url}
              className={styles.link}
              target="_blank"
              rel="noreferrer"
            >
              {link.name}
            </a>
          ))}
          {repoUrl ? (
            <a
              href={repoUrl}
              className={styles.link}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          ) : null}
        </nav>

        <p className={styles.note}>
          {siteTitle} · 数据来自 COROS · 每天早上自动同步 · 轨迹由 FIT 原始文件生成
        </p>
      </div>
    </footer>
  );
};

export default Footer;
