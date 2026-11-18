import { useMemo } from 'react';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import SportIcon from '@/components/SportIcon';
import { computeGeo, computeTotals, type RunRecord } from '@/utils/runningStats';
import styles from './style.module.css';

const dotDate = (date: string | null): string =>
  date ? date.replaceAll('-', '.') : '—';

interface IProfileProps {
  runs: RunRecord[];
}

/**
 * Compact personal running archive.
 * One identity block + a single row of metadata tags. Counts, KPIs and
 * repeat dates are deliberately left to CoreMetrics — no duplication.
 */
const Profile = ({ runs }: IProfileProps) => {
  const meta = useSiteMetadata();
  const totals = useMemo(() => computeTotals(runs), [runs]);
  const geo = useMemo(() => computeGeo(runs), [runs]);

  const firstYear = totals.firstDate?.slice(0, 4) ?? '';
  const lastYear = totals.lastDate?.slice(0, 4) ?? '';
  const span = firstYear && lastYear ? `${firstYear}—${lastYear}` : '—';
  const sportKey = meta.siteUrl.replace(/\/$/, '').split('/').pop() ?? '';
  const footprint = geo.countries.length
    ? `${geo.countries.length}/${geo.provinces.length}/${geo.cities.length}`
    : '—';

  return (
    <section className={styles.profile} aria-labelledby="profile-title">
      <div className={styles.identity}>
        <SportIcon name={sportKey} size={24} className={styles.sportIcon} />
        <div className={styles.identityText}>
          <p className={styles.eyebrow}>{sportKey.toUpperCase()} / PERSONAL ARCHIVE</p>
          <h1 id="profile-title" className={styles.profileTitle}>跑步生涯</h1>
          {meta.tagline ? <p className={styles.tagline}>{meta.tagline}</p> : null}
        </div>
      </div>
      <dl className={styles.metaTags}>
        <div className={styles.metaTag}>
          <dt>记录跨度</dt>
          <dd>{span}</dd>
        </div>
        <div className={styles.metaTag}>
          <dt>最近活动</dt>
          <dd>{dotDate(totals.lastDate)}</dd>
        </div>
        <div className={styles.metaTag}>
          <dt>跑步足迹</dt>
          <dd>{footprint}</dd>
        </div>
      </dl>
    </section>
  );
};

export default Profile;
