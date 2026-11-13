import { useMemo } from 'react';
import SectionHeader from './SectionHeader';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import BrandMark from '@/components/BrandMark';
import SportIcon from '@/components/SportIcon';
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
  const sportKey = meta.siteUrl.replace(/\/$/, '').split('/').pop() ?? '';

  return (
    <section className={styles.profile} aria-labelledby="profile-title">
      <SectionHeader index="01" kicker="RUNNING PERFORMANCE & CAREER" title="个人跑步档案" />
      <div className={styles.profileIdentity}>
        <div className={styles.brandBlock}>
          <BrandMark size={40} className={styles.brandMark} />
          <span className={styles.brandLabel}>
            <SportIcon name={sportKey} size={14} className={styles.brandIcon} />
            <span>ZB ACTIVE / {sportKey.toUpperCase()}</span>
          </span>
          {totals.lastDate ? (
            <span className={styles.brandStamp}>数据截至 {dotDate(totals.lastDate)}</span>
          ) : null}
        </div>
        <div className={styles.profileText}>
          <h1 id="profile-title" className={styles.profileTitle}>
            {meta.siteTitle}
          </h1>
          {span ? <p className={styles.profileYear}>{span}</p> : null}
          {meta.tagline ? (
            <p className={styles.tagline}>{meta.tagline}</p>
          ) : null}
          <p className={styles.profileFoot}>
            {formatNumber(totals.count)} 次跑步 · {geo.countries.length} 个国家 ·{' '}
            {geo.provinces.length} 个省份 · {geo.cities.length} 座城市
            {geo.trackPlaced
              ? ` · 地点来源：设备原生 ${formatNumber(
                  geo.devicePlaced
                )} 次，轨迹坐标解析 ${formatNumber(geo.trackPlaced)} 次`
              : ''}
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
