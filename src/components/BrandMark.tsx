interface Props {
  size?: number;
  className?: string;
}

/**
 * The ACTIVE master mark — a real PNG slice from the supplied identity board
 * (brand/assets/ACTIVE_Brand_Identity_Board.png), not a redrawn vector.
 * The white card backdrop was keyed to alpha by brand/slice-board.py, leaving
 * the original gradient "A" pixels byte-for-byte from the source image.
 *
 * Decorative only: the surrounding brand link carries `aria-label="ACTIVE"`.
 */
const BrandMark = ({ size = 28, className }: Props) => (
  <img
    className={className}
    src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/active-mark.png`}
    width={96}
    height={64}
    style={{ height: size, width: 'auto' }}
    alt=""
    aria-hidden="true"
    decoding="async"
  />
);

export default BrandMark;
