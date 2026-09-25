/**
 * The redaction bars — this interface's one memorable element.
 *
 * WHY A BAR AND NOT A NUMBER
 *
 * "3 fields hidden" is a claim. A bar is the thing itself: the same mark
 * Shield paints over the screenshot, in the interface that reports it.
 * Somebody who has watched the overlay cover a password field recognises this
 * without being told what it means, which is the whole reason for borrowing a
 * visual language that predates software rather than inventing one.
 *
 * WHY THEY ARE LIGHT, NOT BLACK
 *
 * A redaction bar is black on paper. On this ground a black bar is a hole
 * rather than a mark, so it inverts: the block is near-white and the ground
 * shows through around it. The meaning is unchanged — a solid, opaque,
 * unreadable block where something used to be — and it is the mark being
 * inverted, not abandoned.
 *
 * THE WIDTHS ARE REAL
 *
 * Each bar's width is that category's share of everything hidden, floored so a
 * single finding is still visibly a bar rather than a dot. A chart whose
 * proportions were decorative would be the exact failure this project keeps
 * writing down — a plausible rectangle that means nothing — so if the widths
 * ever stop being the data, the bars should be deleted rather than kept for
 * the look of them.
 */

export interface Redaction {
  category: string;
  count: number;
}

/**
 * Below this a bar reads as a speck and the eye skips it, which would hide the
 * rarest category — the opposite of what this is for.
 */
const MIN_SHARE = 0.18;

/** Plain words for what was hidden. The popup never shows a raw category key. */
const CATEGORY_LABEL: Record<string, string> = {
  password: 'Passwords',
  email: 'Email addresses',
  phone: 'Phone numbers',
  name: 'Names',
  address: 'Addresses',
  id_number: 'ID numbers',
  face: 'Faces',
  other: 'Unidentified fields',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
}

export function Redactions({ items }: { items: Redaction[] }) {
  if (items.length === 0) return null;

  const largest = Math.max(...items.map((item) => item.count));

  return (
    // A chart rather than a list: labels share a left edge, bars share a start
    // line, counts share a right edge. The only ragged edge left is the end of
    // each bar, and that edge is the data.
    <ul className="grid grid-cols-[max-content_1fr_auto] items-center gap-x-3 gap-y-2">
      {items.map((item) => {
        const share = Math.max(MIN_SHARE, item.count / largest);
        return (
          <li key={item.category} className="contents">
            <span className="text-dim text-[12.5px] leading-none">
              {categoryLabel(item.category)}
            </span>
            <span className="block h-3" aria-hidden="true">
              <span
                className="bg-bright block h-full rounded-[2px]"
                style={{ width: `${share * 100}%` }}
              />
            </span>
            <span className="text-bright text-right text-[12.5px] leading-none font-medium tabular-nums">
              {item.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
