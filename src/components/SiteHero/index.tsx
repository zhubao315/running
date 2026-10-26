import useActivities from '@/hooks/useActivities';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.css';

const fmt = (value: number) => Math.round(value).toLocaleString('en-US');

const SiteHero = () => {
  const { activities, years } = useActivities();
  const { tagline, sportLabel, repoUrl, siteTitle } = useSiteMetadata();

  const totalKm = activities.reduce((sum, run) => sum + (run.distance || 0), 0) / 1000;
  const totalClimb = activities.reduce(
    (sum, run) => sum + ((run as { elevation_gain?: number }).elevation_gain || 0),
    0
  );
  const maxStreak = activities.reduce(
    (max, run) => Math.max(max, run.streak || 0),
    0
  );
  const latest = activities.reduce(
    (last, run) =>
      !last || run.start_date_local > last.start_date_local ? run : last,
    activities[0]
  );

  return (
    <section className={styles.hero}>
      <div className={styles.ring} />
      <div className={styles.inner}>
        <div className={styles.badge}>
          <span className={styles.dot} />
          {sportLabel} · COROS 自动同步 · 每天早上更新
        </div>
        <h1 className={styles.title}>{siteTitle}</h1>
        <p className={styles.tagline}>{tagline}</p>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.value}>{fmt(activities.length)}</span>
            <span className={styles.label}>次记录</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.value}>{fmt(totalKm)}</span>
            <span className={styles.label}>累计公里</span>
          </div>
          {totalClimb > 0 ? (
            <div className={styles.stat}>
              <span className={styles.value}>{fmt(totalClimb)}</span>
              <span className={styles.label}>累计爬升 m</span>
            </div>
          ) : (
            <div className={styles.stat}>
              <span className={styles.value}>{maxStreak}</span>
              <span className={styles.label}>最长连续天数</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.value}>{years.length}</span>
            <span className={styles.label}>年记录</span>
          </div>
        </div>

        <div className={styles.actions}>
          <a className={styles.primary} href="#explore">
            查看轨迹地图
          </a>
          {repoUrl ? (
            <a className={styles.ghost} href={repoUrl} target="_blank" rel="noreferrer">
              GitHub 源码
            </a>
          ) : null}
          {latest ? (
            <span className={styles.latest}>
              最近一次 · {latest.name} ·{' '}
              {(latest.distance / 1000).toFixed(2)} km ·{' '}
              {latest.start_date_local.slice(0, 10)}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default SiteHero;
