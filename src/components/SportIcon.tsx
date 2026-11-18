export type SportKey = 'health' | 'running' | 'cycling' | 'hiking';

interface Props {
  name: SportKey | string;
  size?: number;
  className?: string;
}

/**
 * The four sub-brand icons.
 *
 * These are PNG slices from the supplied ACTIVE identity board (the four
 * icons in the "四大子品牌图标" card). The white card backdrop was keyed to
 * alpha by brand/slice-board.py; the icon strokes are the original pixels,
 * not redrawn vectors. All four share one grid and visual weight.
 *
 * They inherit visual weight via CSS `filter` where needed; the source PNGs
 * carry their own official sub-brand colour.
 */
const SportIcon = ({ name, size = 20, className }: Props) => {
  const key = (name || '').toLowerCase() as SportKey;
  const known: SportKey[] = ['health', 'running', 'cycling', 'hiking'];
  const srcKey = known.includes(key) ? key : 'health';
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/icons/icon-${srcKey}.png`}
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
