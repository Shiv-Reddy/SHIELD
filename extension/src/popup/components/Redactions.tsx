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
    <ul className="space-y-1.5">
      {items.map((item) => {
        const share = Math.max(MIN_SHARE, item.count / largest);
        return (
          <li key={item.category} className="flex items-center gap-2.5">
            <span
              className="bg-bright h-3.5 shrink-0 rounded-[2px]"
              style={{ width: `${share * 132}px` }}
              // The bar carries no text, so the row's meaning has to reach a
              // screen reader some other way. The label beside it does that,
              // which is why the bar itself is hidden from the tree rather
              // than given a redundant label of its own.
              aria-hidden="true"
            />
            <span className="text-dim text-[12px] leading-none">
              {categoryLabel(item.category)}
            </span>
            <span className="text-faint ml-auto text-[12px] leading-none tabular-nums">
              {item.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
