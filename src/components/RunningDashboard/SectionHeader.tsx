import type { ReactNode } from 'react';
import styles from './style.module.css';

interface ISectionHeaderProps {
  /** Kept for API compatibility; no longer rendered (kicker above a heading
   * and decorative section numbers are design anti-patterns). */
  index?: string;
  kicker?: string;
  title: string;
  children?: ReactNode;
}

const SectionHeader = ({ title, children }: ISectionHeaderProps) => (
  <div className={styles.sectionHead}>
    <div className={styles.sectionHeading}>
      <h2 className={styles.sectionTitle}>{title}</h2>
    </div>
    {children ? <div className={styles.sectionTools}>{children}</div> : null}
  </div>
);

export default SectionHeader;
