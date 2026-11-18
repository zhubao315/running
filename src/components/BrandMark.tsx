interface Props {
  size?: number;
  className?: string;
}

/**
 * The ACTIVE master mark — a true SVG vector rebuilt from the identity board
 * with Bézier paths + native gradients (ACTIVE-BRAND-VECTOR/master/active-symbol.svg).
 * Infinite scaling, no bitmap fringing, transparent background.
 *
 * Decorative only: the surrounding brand link carries `aria-label="ACTIVE"`.
 */
const BrandMark = ({ size = 28, className }: Props) => (
  <img
    className={className}
    src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/active-mark.svg`}
    width={172}
    height={116}
    style={{ height: size, width: 'auto' }}
    alt=""
    aria-hidden="true"
    decoding="async"
  />
);

export default BrandMark;
