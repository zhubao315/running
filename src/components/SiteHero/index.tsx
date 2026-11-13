import useActivities from '@/hooks/useActivities';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import SportIcon from '@/components/SportIcon';
import styles from './style.module.css';

const fmt = (value: number) => Math.round(value).toLocaleString('en-US');

/**
 * The hero of a sport site.
 *
 * The order is the brand order: mother brand first, then the site, then the
 * numbers, then the last thing that happened. Every number here comes from
 * the activity data — nothing is written by hand.
 */
const SiteHero = () => {
  const { activities, years } = useActivities();
  const { siteTitle, tagline, siteUrl } = useSiteMetadata();

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

  const sportKey = siteUrl.replace(/\/$/, '').split('/').pop() ?? '';

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <SportIcon name={sportKey} size={15} className={styles.eyebrowIcon} />
          <span>ZB ACTIVE</span>
          <span className={styles.eyebrowSlash} aria-hidden="true">
            /
          </span>
          <span>{sportKey.toUpperCase()}</span>
          {latest ? (
            <span className={styles.stamp}>数据截至 {latest.start_date_local.slice(0, 10)}</span>
          ) : null}
        </p>

        <h1 className={styles.title}>{siteTitle}</h1>
        {tagline ? <p className={styles.tagline}>{tagline}</p> : null}

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
