/**
 * How the recognition engine should be told to segment what it is looking at.
 *
 * WHY THIS IS THE NEXT THING TRIED
 *
 * Metric 1 has one failing row and it is markup-only: text the engine is
 * looking straight at and cannot read. Pooled over ten pages that is 2678 items
 * against 762 agreed — DOM coverage 22.2% (DECISIONS.md 236). Two explanations
 * have been tested and neither was the cause. Resolution bought four points
 * (212). Lossless encoding bought exactly zero, measured to the item (230).
 * Both of those were about the PIXELS handed to the engine, and the pixels are
 * now exhausted as a lever.
 *
 * What has never been examined is what the engine is TOLD. Tesseract's default
 * page segmentation mode is PSM 3 — fully automatic page layout analysis, which
 * looks for columns, paragraphs and a reading order, because Tesseract was
 * built for scanned documents and a scanned document has those things.
 *
 * **A web page screenshot does not.** It is a navigation bar, some buttons, a
 * form, a footer, and a heading over on the right — scattered short runs of
 * text in boxes, with no column structure and no reading order worth
 * recovering. Asked to find a page layout in that, the analyser groups
 * unrelated regions, decides some of them are not text at all, and discards
 * them before recognition ever runs. PSM 11 exists for exactly this case:
 * "sparse text — find as much text as possible in no particular order."
 *
 * WHAT IS AND IS NOT CLAIMED HERE
 *
 * That layout analysis is a plausible cause of a large markup-only row, and
 * that sparse mode is what Tesseract offers for it. **Not that it will work.**
 * 230 is the standing lesson: the encoding hypothesis was at least as
 * reasonable and its effect was exactly zero. This is built so it can be
 * measured, and the number that decides it is DOM coverage against 22.2% over
 * the same ten pages, not against the one page that used to say 31.6%.
 *
 * THE TWO PATHS GET DIFFERENT ANSWERS, WHICH IS THE POINT OF A MODULE
 *
 * A crop of a photographed ID card IS a document — a block of related lines in
 * reading order — and it is what PSM 3 was designed for. Only the whole-frame
 * path is a UI screenshot. Changing both would conflate two different
 * questions and put the metric-3 pixel figures at risk while chasing metric 1.
 */

/**
 * Tesseract page segmentation modes, by number, because that is what the
 * engine's `tessedit_pageseg_mode` parameter takes.
 *
 * Only the two in use are named. A full enum would imply the others had been
 * considered and rejected, and they have not been.
 */
export const PSM = {
  /**
   * Fully automatic page segmentation, no orientation detection. Tesseract's
   * own default, and correct for a document: a scanned card, a photographed
   * page, anything with lines that belong together in an order.
   */
  AUTO: '3',
  /**
   * Sparse text. Find as much text as possible in no particular order, with no
   * layout analysis to discard regions first.
   *
   * What a browser viewport actually is.
   */
  SPARSE: '11',
} as const;

export type SegmentationMode = (typeof PSM)[keyof typeof PSM];

/** What is being read. The two cases genuinely differ; see the file header. */
export type RecognitionSubject = 'screen' | 'crop';

/**
 * Pure, so the choice can be tested without a browser and without a 2.7MB
 * engine — the same reason `recognition-scale.ts` exists separately from
 * `ocr.ts`. This rule is load-bearing on 25% of the score and should not be
 * the one part of the change nobody can check.
 */
export function segmentationFor(subject: RecognitionSubject): SegmentationMode {
  return subject === 'screen' ? PSM.SPARSE : PSM.AUTO;
}

/**
 * The engine parameters for a subject, in the shape Tesseract.js takes.
 *
 * Returned as a whole object rather than a bare mode so that a second
 * parameter can be added here later without every call site learning about it.
 */
export function recognitionParameters(
  subject: RecognitionSubject,
): { tessedit_pageseg_mode: SegmentationMode } {
  return { tessedit_pageseg_mode: segmentationFor(subject) };
}
