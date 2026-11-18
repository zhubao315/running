interface Props {
  size?: number;
  className?: string;
}

/**
 * The ACTIVE master mark (v3.0): the PRECISION MOTION "A" — one ascending
 * leg, one descending leg and a motion arc, in the official blue gradient.
 *
 * It is one byte-identical SVG in all four repositories under /brand/.
 * Decorative only: the surrounding brand link carries `aria-label="ACTIVE"`.
 */
const BrandMark = ({ size = 28, className }: Props) => (
  <img
    className={className}
    src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/active-mark.svg`}
    width={64}
    height={64}
    style={{ height: size, width: 'auto' }}
    alt=""
    aria-hidden="true"
    decoding="async"
  />
);

export default BrandMark;
