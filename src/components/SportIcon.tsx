export type SportKey = 'health' | 'running' | 'cycling' | 'hiking';

interface Props {
  name: SportKey | string;
  size?: number;
  className?: string;
}

/**
 * The four sub-brand icons.
 *
 * All of them share one grid (24x24), one stroke (2px) and round ends, so
 * they read as one family. The shapes are deliberately plain: a heart-rate
 * line, a climbing trail, a bicycle, two peaks.
 */
const SportIcon = ({ name, size = 20, className }: Props) => {
  const key = (name || '').toLowerCase() as SportKey;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
    focusable: false,
    className,
  };

  if (key === 'health') {
    return (
      <svg {...common}>
        <path
          d="M2.5 12.5h4.2l2.1-6.4 3.5 12.2 2.6-7 1.9 3.2h4.7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === 'running') {
    return (
      <svg {...common}>
        <path
          d="M2.5 18.8c3.7 0 4-9.3 8.8-9.3 3.1 0 4.2 4 7.2 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.6 10.9 18.7 13.5l-3.1 2.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === 'cycling') {
    return (
      <svg {...common}>
        <circle
          cx="5.6"
          cy="16.4"
          r="3.6"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx="18.4"
          cy="16.4"
          r="3.6"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M5.6 16.4 10.4 8.2h3.8l1.9 3.4M10.4 8.2l2.6 8.2h5.4M14.2 8.2h2.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path
        d="M2.2 18.6 8.4 8.2l4.1 7 2.4-3.9 4.7 7.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.2 18.6h17.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M6.1 13.2c1.9-1.3 3.9-1.3 5.8 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
};

export default SportIcon;
