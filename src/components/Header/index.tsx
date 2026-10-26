import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.css';

const Header = () => {
  const { logo, siteUrl, navLinks, siteTitle } = useSiteMetadata();
  const normalized = siteUrl.replace(/\/$/, '');

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href={siteUrl} className={styles.brand}>
          <img className={styles.logo} alt="logo" src={logo} />
          <span className={styles.name}>{siteTitle}</span>
        </a>
        <nav className={styles.nav} aria-label="站点导航">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              className={`pill ${
                link.url.replace(/\/$/, '') === normalized ? 'pill-active' : ''
              }`}
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
