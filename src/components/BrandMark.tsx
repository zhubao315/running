import styles from './style.module.css';

interface Props {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * The ACTIVE mark.
 *
 * One continuous Z-shaped trail with a gold node where the line crosses:
 * a route, and the point on it where you are now. The stroke inherits the
 * current text colour so the mark works on both themes; the node stays gold.
 */
const BrandMark = ({ size = 26, className, title = 'ACTIVE' }: Props) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    <path
      d="M7 9h18L7 23h18"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="16" cy="16" r="2.4" fill="#FBBF24" />
  </svg>
);

export default BrandMark;
