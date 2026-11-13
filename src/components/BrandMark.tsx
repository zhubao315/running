interface Props {
  size?: number;
  className?: string;
}

/**
 * The ACTIVE mark is the main site's trail symbol (owner decision 2026-11-13):
 * one raster, byte-identical in all four repositories under /brand/.
 * It is decorative — the surrounding brand link carries the accessible name,
 * exactly like the main site does.
 */
const BrandMark = ({ size = 28, className }: Props) => (
  <img
    className={className}
    src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/zhubao-symbol.png`}
    width={592}
    height={530}
    style={{ height: size, width: 'auto' }}
    alt=""
    aria-hidden="true"
    decoding="async"
  />
);

export default BrandMark;
