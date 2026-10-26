import { intComma } from '@/utils/utils';
import styles from './style.module.css';

interface IStatProperties {
  value: string | number;
  description: string;
  className?: string;
  citySize?: number;
  onClick?: () => void;
}

const Stat = ({
  value,
  description,
  className = '',
  citySize,
  onClick,
}: IStatProperties) => {
  const sizeClass =
    citySize === 3 ? 'text-2xl' : citySize === 4 ? 'text-3xl' : 'text-4xl';

  return (
    <div className={`${styles.stat} ${className}`} onClick={onClick}>
      <span className={`${styles.value} ${sizeClass}`}>
        {intComma(value.toString())}
      </span>
      <span className={styles.label}>{description.trim()}</span>
    </div>
  );
};

export default Stat;
