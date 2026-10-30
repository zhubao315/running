import { useMemo } from 'react';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import {
  computeGeo,
  computeTotals,
  formatNumber,
  type RunRecord,
} from '@/utils/runningStats';
import styles from './style.module.css';

const dotDate = (date: string | null): string =>
  date ? date.replaceAll('-', '.') : '—';

interface IProfileProps {
  runs: RunRecord[];
}

const Profile = ({ runs }: IProfileProps) => {
  const meta = useSiteMetadata();
  const totals = useMemo(() => computeTotals(runs), [runs]);
  const geo = useMemo(() => computeGeo(runs), [runs]);

  const firstYear = totals.firstDate?.slice(0, 4) ?? '';
  const lastYear = totals.lastDate?.slice(0, 4) ?? '';
  const span = firstYear && lastYear ? `${firstYear}—${lastYear}` : '';

  return (
    <section className={styles.profile} aria-labelledby="profile-title">
      <div className={styles.profileAccent} aria-hidden="true" />
      <div className={styles.profileIdentity}>
        <img className={styles.avatar} src={meta.logo} alt="" />
        <div className={styles.profileText}>
          <p className={styles.eyebrow}>RUNNING PROFILE · {span}</p>
          <h1 id="profile-title" className={styles.profileTitle}>
            {meta.siteTitle}
          </h1>
          {meta.tagline ? (
            <p className={styles.tagline}>{meta.tagline}</p>
          ) : null}
          <p className={styles.profileFoot}>
            {formatNumber(totals.count)} 次跑步 · {geo.countries.length} 个国家 ·{' '}
            {geo.provinces.length} 个省份 · {geo.cities.length} 座城市
          </p>
        </div>
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>起跑</dt>
          <dd title={totals.firstDate ?? ''}>{dotDate(totals.firstDate)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>最近一次</dt>
          <dd title={totals.lastDate ?? ''}>{dotDate(totals.lastDate)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>跑步日</dt>
          <dd>{formatNumber(totals.activeDays)} 天</dd>
        </div>
        <div className={styles.fact}>
          <dt>主场</dt>
          <dd>{geo.homeProvince ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
};

export default Profile;
