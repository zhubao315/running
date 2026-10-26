import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.css';

const Footer = () => {
  const { navLinks, repoUrl, siteTitle } = useSiteMetadata();
  const siteLinks = navLinks.filter((link) => link.name !== 'X');

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.mark} />
          <span>{siteTitle}</span>
        </div>
        <nav className={styles.links}>
          {siteLinks.map((link) => (
            <a key={link.name} href={link.url} className={styles.link}>
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
          数据来自 COROS · 每天早上自动同步 · 轨迹由 FIT 原始文件生成
        </p>
      </div>
    </footer>
  );
};

export default Footer;
