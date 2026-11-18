export type SportKey = 'health' | 'running' | 'cycling' | 'hiking';

interface Props {
  name: SportKey | string;
  size?: number;
  className?: string;
}

/**
 * The four sub-brand icons.
 *
 * True SVG vectors rebuilt from the four icons in the ACTIVE identity board
 * (ACTIVE-BRAND-VECTOR/sub-brands/). 24x24 grid, crisp at any size, with the
 * official sub-brand colours baked into the vector fills.
 */
const SportIcon = ({ name, size = 20, className }: Props) => {
  const key = (name || '').toLowerCase() as SportKey;
  const known: SportKey[] = ['health', 'running', 'cycling', 'hiking'];
  const srcKey = known.includes(key) ? key : 'health';
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/icons/${srcKey}.svg`}
      width={size}
      height={size}
      style={{ width: size, height: 'auto', display: 'block' }}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
};

export default SportIcon;
