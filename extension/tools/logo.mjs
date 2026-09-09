/**
 * The Shield logo, as geometry.
 *
 * ONE SOURCE FOR EVERY SURFACE
 *
 * The mark appears in three places — the toolbar icon (PNG, four sizes), the
 * popup header, and anywhere the docs or deck need it. Drawing it three times
 * means three things that drift, and a logo that is subtly different in the
 * toolbar than in the popup looks like a bug in a product whose entire pitch is
 * that it is careful. So the shapes live here once, and both the SVG files and
 * the raster icons are generated from them.
 *
 * It also keeps the property the icon generator was written for: no opaque
 * image blob in the repository that a reviewer has to take on trust. Every
 * pixel is derived from the numbers below.
 *
 * THE MARK
 *
 * A shield split down its vertical axis. The left half is solid and holds an
 * eye; the right half has dissolved into scattered squares. It says what the
 * product does in one glyph — the screen is seen, and half of what was there
 * has been broken into blocks and taken away.
 *
 * Coordinates are a 725x725 square with the shield's centre line at x=347.5.
 */

export const SIZE = 725;
export const CENTRE = 347.5;

/** Bezier circle constant: handle length for a quarter arc. */
const K = 0.5522847498;

/** A circle as four cubic segments, so the flattener needs no arc support. */
function circle(cx, cy, r) {
  const o = r * K;
  return {
    start: [cx + r, cy],
    curves: [
      [cx + r, cy + o, cx + o, cy + r, cx, cy + r],
      [cx - o, cy + r, cx - r, cy + o, cx - r, cy],
      [cx - r, cy - o, cx - o, cy - r, cx, cy - r],
      [cx + o, cy - r, cx + r, cy - o, cx + r, cy],
    ],
  };
}

/**
 * The shield body, eye and pupil, as closed subpaths.
 *
 * Filled with the even-odd rule, so they alternate solid and hollow as they
 * nest: shield solid, eye lens hollow, iris solid again, pupil hollow. The
 * hollows are genuine holes rather than white fills — the mark has to sit on a
 * dark toolbar and a light popup without carrying its own background with it.
 */
export const SHIELD_SUBPATHS = [
  // Outer shield: down the centre line, sweeping out to the left shoulder and
  // back in to the point at the bottom.
  {
    start: [CENTRE, 0],
    curves: [
      [245, 28, 128, 92, 47.5, 163],
      [47.5, 380, 140, 600, CENTRE, 725],
    ],
    close: true,
  },
  // Eye: a lens, pointed at the left, cut square where it meets the centre.
  {
    start: [100, 352],
    curves: [
      [165, 245, 258, 232, CENTRE, 232],
      [CENTRE, 232, CENTRE, 472, CENTRE, 472],
      [258, 472, 165, 459, 100, 352],
    ],
    close: true,
  },
  { ...circle(293, 352, 70), close: true },
  { ...circle(330, 352, 19), close: true },
];

/**
 * The dissolve.
 *
 * Larger and denser against the centre line, smaller and sparser to the right,
 * so it reads as the shield breaking up rather than as a pattern beside it.
 * Hand-placed: a generated scatter looks generated.
 */
export const SQUARES = [
  [352, 214, 40], [352, 297, 36], [352, 372, 36], [352, 449, 40],
  [398, 258, 46], [400, 340, 28], [398, 398, 44],
  [452, 166, 50], [455, 320, 30], [452, 440, 48],
  [505, 96, 34], [512, 250, 56], [515, 355, 36], [500, 512, 50],
  [568, 158, 46], [566, 310, 50], [560, 440, 40], [530, 592, 36],
  [636, 232, 28], [640, 366, 34], [620, 536, 28], [478, 610, 24],
];

// --- SVG ---------------------------------------------------------------------

function pathData(subpath) {
  const parts = [`M${subpath.start[0]} ${subpath.start[1]}`];
  for (const c of subpath.curves) parts.push(`C${c.join(' ')}`);
  if (subpath.close) parts.push('Z');
  return parts.join('');
}

/**
 * The whole mark as an SVG document in one colour.
 *
 * `clipPath` trims the shield group at the centre line. The iris and pupil are
 * full circles that overhang it, and the overhang is what gives the eye its
 * cut-off edge against the dissolve — drawing them pre-truncated would mean
 * re-deriving the intersection by hand every time the eye moved.
 */
export function toSvg(colour) {
  const shield = SHIELD_SUBPATHS.map(pathData).join('');
  const squares = SQUARES.map(
    ([x, y, s]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}"/>`,
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" fill="${colour}">
<clipPath id="half"><rect x="0" y="0" width="${CENTRE}" height="${SIZE}"/></clipPath>
<path d="${shield}" fill-rule="evenodd" clip-path="url(#half)"/>
${squares}
</svg>
`;
}

// --- Rasterising -------------------------------------------------------------

/** Flatten one subpath to a polygon. */
export function flatten(subpath, steps = 48) {
  const points = [subpath.start];
  let current = subpath.start;

  for (const [x1, y1, x2, y2, x3, y3] of subpath.curves) {
    const [x0, y0] = current;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      points.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    current = [x3, y3];
  }

  return points;
}

/** Crossing count for one polygon — the even-odd test's building block. */
function crossings(polygon, x, y) {
  let count = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) count += 1;
  }
  return count;
}

const POLYGONS = SHIELD_SUBPATHS.map((subpath) => flatten(subpath));

/**
 * Whether the mark covers this point, in logo coordinates.
 *
 * Even-odd across the shield subpaths, clipped at the centre line, plus a
 * straight rectangle test for the squares.
 */
export function covers(x, y) {
  if (x < CENTRE) {
    let total = 0;
    for (const polygon of POLYGONS) total += crossings(polygon, x, y);
    if (total % 2 === 1) return true;
  }

  for (const [sx, sy, s] of SQUARES) {
    if (x >= sx && x < sx + s && y >= sy && y < sy + s) return true;
  }

  return false;
}
