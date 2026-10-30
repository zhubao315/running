import type { ReactNode } from 'react';
import styles from './style.module.css';

interface ISectionHeaderProps {
  index: string;
  kicker: string;
  title: string;
  children?: ReactNode;
}

const SectionHeader = ({
  index,
  kicker,
  title,
  children,
}: ISectionHeaderProps) => (
  <div className={styles.sectionHead}>
    <div className={styles.sectionHeading}>
      <p className={styles.kicker}>
        <span className={styles.kickerIndex}>{index}</span>
        {kicker}
      </p>
      <h2 className={styles.sectionTitle}>{title}</h2>
    </div>
    {children ? <div className={styles.sectionTools}>{children}</div> : null}
  </div>
);

export default SectionHeader;
