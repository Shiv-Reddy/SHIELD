/**
 * DOM rule engine — the primary PII detector.
 *
 * CLAUDE.md makes DOM signals the primary, most reliable source of truth for
 * form-based PII, with the visual model supplementary for what the DOM cannot
 * express. That ordering is not a preference, it is an accuracy argument: a
 * `type="password"` attribute is a statement of intent by the page author, and
 * no amount of pixel analysis matches it for certainty.
 *
 * Deliberately pure — no Chrome APIs, no DOM access, no I/O. It takes an already
 * captured element map and returns decisions. That keeps the detection policy in
 * one place that can be unit-tested against fixtures (TASKS.md Module G) rather
 * than only against a live browser, and it means the rules can be reasoned about
 * without a page in front of you.
 *
 * Policy source: SECURITY_PRIVACY.md Section 4.
 */

import type { DomElement, SensitiveCategory, SensitiveRegion } from '../types';
import { GIVEN_NAMES } from './given-names';

/**
 * Confidence attached to each rule, strongest first.
 *
 * IMPORTANT: these values do NOT gate redaction. Everything this engine flags is
 * redacted, whatever its confidence. SECURITY_PRIVACY.md Section 4 is explicit
 * that a missed detection is a more severe failure than an unnecessary one, so
 * there is no threshold below which Shield decides to let something through.
 * The numbers exist for the audit trail and the trust UI — to say how sure we
 * were, never to decide whether to act.
 *
 * If a future change introduces `if (confidence > x)` around a redaction, that
 * is a policy violation, not an optimisation.
 */
import { describeMatch, strongestIndianId } from './indian-ids';

const CONFIDENCE = {
  /** `input[type=password]`. A declaration by the page author. */
  declaredPassword: 1,
  /** An explicit `autocomplete` token from the HTML standard's list. */
  autocompleteToken: 0.9,
  /** An input type that implies its content, such as `type=email`. */
  declaredInputType: 0.8,
  /** A label, name or placeholder matching a known pattern. */
  textPattern: 0.6,
  /**
   * A formatted identifier whose checksum agrees — a Verhoeff-valid Aadhaar, a
   * Luhn-valid card.
   *
   * Ranked just below an explicit `autocomplete` token. The page author saying
   * what a field holds is still the stronger signal, but a checksum is close:
   * it is arithmetic, not a guess, and the odds of arbitrary text satisfying
   * Verhoeff by accident are one in ten.
   */
  verifiedChecksum: 0.95,
} as const;

/**
 * Autocomplete tokens mapped to categories, from the HTML standard's autofill
 * field list. These are the strongest signal after `type=password` because the
 * page author is stating what the field holds.
 */
const AUTOCOMPLETE_CATEGORIES: ReadonlyArray<readonly [SensitiveCategory, readonly string[]]> = [
  ['password', ['current-password', 'new-password', 'one-time-code']],
  [
    'name',
    [
      'name',
      'given-name',
      'family-name',
      'additional-name',
      'nickname',
      'honorific-prefix',
      'honorific-suffix',
      'username',
    ],
  ],
  ['email', ['email']],
  [
    'phone',
    ['tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-extension'],
  ],
  [
    'address',
    [
      'street-address',
      'address-line1',
      'address-line2',
      'address-line3',
      'address-level1',
      'address-level2',
      'address-level3',
      'address-level4',
      'postal-code',
      'country',
      'country-name',
    ],
  ],
  // Payment fields have no category of their own in API_SPEC.md Section 3's
  // enum, and `id_number` is the closest honest fit: they are sensitive
  // identifying numbers. Worth revisiting if the enum ever grows.
  ['id_number', ['cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-name']],
];

/** `input` type attributes that imply their own content. */
const INPUT_TYPE_CATEGORIES: Readonly<Record<string, SensitiveCategory>> = {
  email: 'email',
  tel: 'phone',
};

/**
 * Text patterns for fields that declare nothing useful.
 *
 * Order matters and is load-bearing. "Email address" contains "address", so
 * email must be tested before address or every email field is mislabelled. Each
 * pattern is matched against the label, the `name` attribute and the placeholder
 * together, because real forms use whichever one they feel like.
 */
const TEXT_PATTERNS: ReadonlyArray<readonly [SensitiveCategory, RegExp]> = [
  ['email', /e[-_\s]?mail/],
  [
    'id_number',
    /\b(ssn|social[-_\s]?security|aadhaar|aadhar|passport|licen[cs]e|national[-_\s]?id|tax[-_\s]?id|pan[-_\s]?(no|number|card)|account[-_\s]?(no|number)|card[-_\s]?(no|number)|cvv|cvc|pin)\b/,
  ],
  ['phone', /\b(phone|mobile|telephone|tel|contact[-_\s]?(no|number)|whatsapp)\b/],
  [
    'address',
    /\b(address|street|city|town|state|province|district|zip|postcode|postal|pincode|country)\b/,
  ],
  ['name', /\b(name|surname|forename|user)\b/],
  ['password', /\b(password|passwd|pwd|passphrase|secret|otp)\b/],
];

/**
 * Input types that hold no free text and therefore no PII value.
 *
 * Excluded rather than classified: a checkbox has no content to leak, and
 * flagging one would put a meaningless entry in the redaction manifest and an
 * unexplainable box on the trust overlay.
 */
const VALUELESS_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Controls whose value comes from the page author, not from the user.
 *
 * A `<select>` can only hold one of the options the page itself supplied, so
 * there is nothing a person entered for it to expose. That matters for the
 * default-to-hide rule below and nowhere else: hiding "How did you hear about
 * us? -> A friend" protects nobody and costs the reasoning model a piece of the
 * page it may need to complete the task, which is a real cost paid for no gain.
 *
 * The content patterns still run over these values. A dropdown listing account
 * email addresses is genuinely sensitive, and it is caught by what the value
 * looks like rather than exempted by what kind of control holds it.
 *
 * A `<textarea>` is deliberately not here. It arrives looking identical — an
 * `input` element with no input type — and holds exactly what the user typed.
 * Telling the two apart is why `dom-map.ts` reads `type` from every control
 * rather than from `<input>` alone.
 */
const AUTHOR_SUPPLIED_VALUE_TYPES: ReadonlySet<string> = new Set([
  'select-one',
  'select-multiple',
]);

/**
 * Patterns matched against *visible text*, not against field names.
 *
 * A separate concern from the field rules above, and a necessary one: text
 * elements carry their content in `value`, and that content goes into
 * `redacted_dom_summary`. A profile page rendering "Email: someone@example.com"
 * as ordinary text is caught by no field rule — nothing about the surrounding
 * markup declares it sensitive — so without this it would travel intact,
 * breaking the one invariant the whole project rests on.
 *
 * These are deliberately high-precision rather than broad. Field rules can
 * afford to over-match because a wrong guess costs one redacted input box; a
 * loose pattern here would black out ordinary prose and make the page
 * unreadable to the reasoning model, which fails the task a different way.
 */
export const CONTENT_PATTERNS: ReadonlyArray<readonly [SensitiveCategory, RegExp]> = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  // An Indian PAN, or a long unbroken digit run: card numbers, Aadhaar,
  // account numbers. Nine digits is above any plausible year, price or count.
  ['id_number', /\b([A-Z]{5}\d{4}[A-Z]|\d{9,})\b/i],
  // Grouped digits with a separator, as phone numbers are written. Requires a
  // leading +, or a bracketed code, or at least three groups, so that dates and
  // "1,234" do not match.
  ['phone', /(\+\d{1,3}[\s-]?)?(\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]\d{3,5}([\s-]\d{3,5})?/],
  /*
   * A currency amount, and it is LAST on purpose.
   *
   * This array is ordered and the first match wins, so appending means every
   * pattern above keeps first claim on any text it wants. That matters here:
   * "Savings A/c 402711558903 · Available balance Rs. 1,84,220.55" carries both
   * an account number and an amount, and it must stay an `id_number` — the
   * account number is the identifier, the balance is a detail about it.
   *
   * WHY AMOUNTS ARE SENSITIVE AT ALL
   *
   * Individually an amount is dull. A statement's worth of them is a record of
   * where somebody was and what they bought, and DECISIONS.md already recorded
   * the asymmetry this fixes: the same figure was hidden in a form field by the
   * default-to-hide rule and passed through untouched in prose. One quantity,
   * two answers, decided by markup rather than by sensitivity.
   *
   * WHAT IT COSTS, KNOWINGLY
   *
   * A currency marker is required, which keeps it far from ordinary prose. It
   * still cannot tell a public tender's budget from a private balance, because
   * that distinction is not in the text. It therefore over-flags a tender
   * notice and a published tariff in the corpus, both of them correct pages to
   * get wrong in the safe direction (SECURITY_PRIVACY.md Section 4: when
   * uncertain, hide). Named in TASKS.md before this was written.
   *
   * Categorised `other` rather than given a category of its own: the taxonomy
   * is fixed by API_SPEC.md and adding a member is a contract change, not a
   * detector change.
   */
  ['other', /(?:₹|\bRs\.?|\bINR\b)\s?\d[\d,]*(?:\.\d{1,2})?/i],
];

/**
 * Digit counts before a phone-shaped match is believed.
 *
 * Two tiers, because a flat threshold cannot separate a phone number from a
 * date range: "Copyright 2024-2025" is eight digits in two groups and matches
 * the shape exactly. An international prefix is strong evidence on its own, so
 * a `+` number is trusted at eight digits; without one, a full national number
 * of ten is required. Checked against ordinary prose — date ranges, order
 * numbers, section ranges and prices — before being adopted.
 */
const MIN_PHONE_DIGITS_WITH_COUNTRY_CODE = 8;
const MIN_PHONE_DIGITS_PLAIN = 10;

/**
 * Category severity, least to most sensitive.
 *
 * Used when two signals disagree about what a field holds. SECURITY_PRIVACY.md
 * Section 4 settles what to do when detectors conflict — always redact — but not
 * what to *call* the result, and the label matters: it becomes the placeholder
 * token the reasoning model sees, and it is what the trust overlay tells the
 * user was hidden. Ranking by severity means a disagreement resolves toward the
 * more sensitive reading, consistent with the same default-to-hide bias.
 */
const CATEGORY_SEVERITY: Readonly<Record<SensitiveCategory, number>> = {
  // Lowest, so any identified category beats "unidentified" in a disagreement.
  // It means "we could not tell", which is weaker evidence than any rule that
  // actually matched — while still being enough to redact.
  other: 0,
  name: 1,
  address: 2,
  phone: 3,
  email: 4,
  face: 5,
  id_number: 6,
  password: 7,
};

/** One rule's verdict on one element. */
export interface DomRuleHit {
  category: SensitiveCategory;
  confidence: number;
  /** Which rule fired and on what evidence, in words, for the trust overlay. */
  reason: string;
}

/**
 * Confidence for a field hidden purely because it was not understood.
 *
 * Deliberately the lowest value in the file: it reflects genuine uncertainty
 * about what the field is. It says nothing about whether to redact it, which is
 * settled — see the note on CONFIDENCE above.
 */
const UNIDENTIFIED_CONFIDENCE = 0.3;

/**
 * Whether a control can hold free text a person typed.
 *
 * Buttons and checkboxes carry a value in the DOM sense without carrying
 * content in any sense that matters, so hiding one would put a meaningless
 * entry in the manifest and an unexplainable box on the trust overlay.
 */
function holdsFreeText(element: DomElement): boolean {
  if (element.elementType !== 'input') return false;
  const inputType = element.inputType?.toLowerCase() ?? null;
  return inputType === null || !VALUELESS_INPUT_TYPES.has(inputType);
}

/** Everything author-written about a field, lowercased for matching. */
function searchableText(element: DomElement): string {
  return [element.label, element.name, element.placeholder]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * Split an `autocomplete` attribute into its tokens.
 *
 * The attribute is a token list, not a single word: `"section-billing shipping
 * street-address"` is valid and common. Matching the whole string would miss
 * every field that uses a section or a billing/shipping qualifier.
 */
function autocompleteTokens(element: DomElement): string[] {
  return (element.autocomplete ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Classify one element, or return null if no rule matched.
 *
 * Rules are tried strongest-first and the first match wins, so a field that is
 * both `type="password"` and labelled "password" is reported once, at full
 * confidence, rather than twice.
 */
export function classifyElement(element: DomElement): DomRuleHit | null {
  // Field rules describe what a control *holds*, so they only apply to controls
  // that hold something. Running them over links and buttons misreads UI chrome
  // as data: a "Forgot password?" link matches the password pattern perfectly
  // and is not a password.
  if (element.elementType !== 'input') return null;

  const inputType = element.inputType?.toLowerCase() ?? null;

  // A control with no free-text content has nothing to redact.
  if (inputType !== null && VALUELESS_INPUT_TYPES.has(inputType)) return null;

  // Rule 1 — the deterministic signal. SECURITY_PRIVACY.md Section 4: always
  // redact, no threshold.
  if (inputType === 'password') {
    return {
      category: 'password',
      confidence: CONFIDENCE.declaredPassword,
      reason: 'input type="password"',
    };
  }

  // Rule 2 — the page author's own declaration of the field's purpose.
  const tokens = autocompleteTokens(element);
  for (const [category, values] of AUTOCOMPLETE_CATEGORIES) {
    const matched = tokens.find((token) => values.includes(token));
    if (matched) {
      return {
        category,
        confidence: CONFIDENCE.autocompleteToken,
        reason: `autocomplete="${matched}"`,
      };
    }
  }

  // Rule 3 — an input type that implies its own content.
  const impliedCategory = inputType ? INPUT_TYPE_CATEGORIES[inputType] : undefined;
  if (impliedCategory) {
    return {
      category: impliedCategory,
      confidence: CONFIDENCE.declaredInputType,
      reason: `input type="${inputType}"`,
    };
  }

  // Rule 4 — the fallback for forms that declare nothing, which is most of them.
  const text = searchableText(element);
  if (text) {
    for (const [category, pattern] of TEXT_PATTERNS) {
      if (pattern.test(text)) {
        return {
          category,
          confidence: CONFIDENCE.textPattern,
          reason: `field text matched ${category} pattern`,
        };
      }
    }
  }

  return null;
}

/**
 * A person's name in running prose, found by a gazetteer of given names.
 *
 * Separate from CONTENT_PATTERNS because it is not a regular expression over
 * the string — it is a lookup per capitalised token, and expressing a few
 * hundred alternatives as one pattern would be slower to run and impossible to
 * read.
 *
 * THE SHAPE: a listed given name, then another capitalised word.
 *
 * The second token is the surname and is deliberately NOT checked against
 * anything, which is what lets this find surnames the list has never seen —
 * "Raghunathan" and "Sundaram" are not in it and both are caught. Requiring
 * that second token is also what keeps the ambiguous entries safe: "Raj",
 * "Dev" and "Tara" are ordinary words in Indian English, and none of them
 * fires without a surname after it.
 *
 * WHAT IT MISSES, WHICH IS THE PART TO SAY OUT LOUD
 *
 * Every name not on the list. Most non-Latin scripts. A surname used alone
 * ("Mr Sundaram"). A name in ALL CAPS. **This is a gazetteer, not a named-entity
 * model**, and SECURITY_PRIVACY.md Section 5.1 states it that way.
 */
export function findPersonNames(text: string): string[] {
  // Every capitalised word, then each adjacent pair — NOT a regex for the pair
  // itself.
  //
  // WHY, BECAUSE THE OBVIOUS VERSION IS WRONG AND WAS SHIPPED
  //
  // `matchAll(/(\p{Lu}\p{Ll}+)\s+(\p{Lu}\p{Ll}+)/gu)` returns NON-OVERLAPPING
  // matches, so a capitalised word in front of a name swallows it: in "Message
  // Priya Sharma" the first match is "Message Priya", "Message" is not a listed
  // name, and "Priya" has already been consumed by the time the scan resumes.
  // "Priya Sharma" alone matched, which is why every fixture passed — and any
  // name after a capitalised word did not, which on a real page is the common
  // case: "Dear …", "Contact …", "Message …", a heading, a table cell.
  //
  // Scanning tokens and testing each pair considers "Priya" as a given name
  // whatever precedes it, so position in the sentence stops mattering.
  const tokens = [...text.matchAll(/\p{Lu}\p{Ll}+/gu)];

  const found: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const given = tokens[i];
    const surname = tokens[i + 1];
    if (given?.index === undefined || surname?.index === undefined) continue;

    if (!GIVEN_NAMES.has(given[0].toLowerCase())) continue;

    // Only whitespace may separate the two. This is what keeps "McDonald" —
    // which tokenises as "Mc" + "Donald" with nothing between — from being read
    // as a given name and a surname, and stops the pair spanning a comma or any
    // other punctuation that means the two words are unrelated.
    //
    // A newline counts as whitespace, deliberately. A name wrapped across two
    // lines, or split by a table cell's markup, is still a name, and the
    // uncertainty rule resolves toward hiding. This matches the behaviour
    // before the tokeniser replaced the pair regex, which also used `\s+`.
    const between = text.slice(given.index + given[0].length, surname.index);
    if (!/^\s+$/u.test(between)) continue;

    found.push(text.slice(given.index, surname.index + surname[0].length));
  }

  return found;
}

/**
 * True when the text contains a name this gazetteer recognises.
 *
 * Delegates rather than duplicating the match, for the reason
 * `phoneMatchIsCredible` exists: the classifier asks *whether*, the scrubber in
 * placeholders.ts asks *which spans*, and two implementations of "is this a
 * name" would eventually disagree. The disagreement is not hypothetical — it is
 * the defect this split was written to fix. A name recognised here but not by
 * the scrubber is hidden in a field's value and transmitted inside a label,
 * which the zero-leak sweep then refuses, turning a silent asymmetry into a
 * blocked run on a real page.
 */
export function findPersonName(text: string): boolean {
  return findPersonNames(text).length > 0;
}

/**
 * True when a phone-shaped match carries enough digits to be believed.
 *
 * Split out so the classifier and the scrubber apply exactly the same rule. Two
 * copies of this threshold would eventually disagree, and the disagreement
 * would be silent: text scrubbed but not flagged, or the reverse.
 */
export function phoneMatchIsCredible(matched: string): boolean {
  const digits = matched.replace(/\D/g, '').length;
  const required = matched.trim().startsWith('+')
    ? MIN_PHONE_DIGITS_WITH_COUNTRY_CODE
    : MIN_PHONE_DIGITS_PLAIN;
  return digits >= required;
}

/**
 * Classify visible text by what it looks like, rather than by what surrounds it.
 *
 * Used only for elements that display content directly. Returns null for
 * ordinary prose, which is the overwhelming majority of text on any page.
 */
export function classifyTextContent(text: string): DomRuleHit | null {
  // Indian identifiers first, because they are the more specific claim on the
  // same characters. The generic rules would still redact most of these — a
  // twelve-digit Aadhaar is a nine-plus digit run — but they would report it as
  // an unnamed id_number, and the name is what reaches the reasoning model's
  // placeholder and the user's overlay. The ones the generic rules miss
  // entirely (IFSC, UPI, voter ID, passport) are the reason this runs at all.
  const indian = strongestIndianId(text);
  if (indian) {
    return {
      category: 'id_number',
      // A confirmed checksum earns the higher confidence. A failed one does not
      // lose the detection — see indian-ids.ts — it only stays unconfirmed.
      confidence: indian.verified ? CONFIDENCE.verifiedChecksum : CONFIDENCE.textPattern,
      // Named through `describeMatch` rather than by kind, because the kind is
      // whichever pattern claimed the span first. Where the shape alone cannot
      // separate two readings the reason says both — see indian-ids.ts.
      reason: `visible text matched ${describeMatch(indian)} format`,
    };
  }

  for (const [category, pattern] of CONTENT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;

    // A phone number is the one shape that collides with ordinary content —
    // dates, prices, reference codes. Counting digits is what separates
    // "+91 98765 43210" from "2024 - 2025".
    if (category === 'phone' && !phoneMatchIsCredible(match[0])) continue;

    return {
      category,
      confidence: CONFIDENCE.textPattern,
      // The matched string is deliberately NOT included. This reason is written
      // to the console and shown in the trust overlay, and quoting the value
      // back would leak exactly what was just detected as sensitive.
      reason: `visible text matched ${category} format`,
    };
  }

  /*
   * The gazetteer runs LAST, after every pattern above has declined.
   *
   * Same reasoning as appending the amount rule: everything already here keeps
   * first claim, so this can only fire on text nothing else wanted, and no
   * existing detection can change category because of it.
   *
   * The cost of being last is narrow and worth naming. A line carrying both a
   * name and a figure — "Billed to Rohan Mehra ... Rs. 712.00" — is recorded as
   * `other` rather than `name`, because the amount rule is declared above and
   * claims it first. Both are redacted either way, so this is a label being
   * less precise than it could be, not a value escaping. No page in the corpus
   * exercises it; if one ever does, the fix is to move this above the amount
   * rule, and the two tests below say which way round they are.
   */
  if (findPersonName(text)) {
    return {
      category: 'name',
      confidence: CONFIDENCE.textPattern,
      // Says what matched — a listed given name — without quoting the name.
      reason: 'visible text matched a known given name followed by a surname',
    };
  }

  return null;
}

/**
 * Reconcile a field's declared purpose with what it actually contains.
 *
 * A field can say one thing and hold another, and the declaration usually wins
 * on specificity while the content usually wins on truth. The login test screen
 * shows exactly this: a field marked `autocomplete="username"` holding
 * `demo.user@example.com`. Classified by declaration alone it is a name; by
 * content alone it is an email address.
 *
 * Neither reading changes whether it is redacted — both are sensitive, and it
 * would be redacted under either. What changes is the placeholder the model
 * sees and the category shown to the user, so the more sensitive reading wins.
 *
 * The value is examined but never logged or quoted, here or in the reason.
 */
function reconcile(declared: DomRuleHit, value: string | null): DomRuleHit {
  if (!value) return declared;

  const byContent = classifyTextContent(value);
  if (!byContent || byContent.category === declared.category) return declared;

  const declaredIsStronger =
    CATEGORY_SEVERITY[declared.category] >= CATEGORY_SEVERITY[byContent.category];
  const winner = declaredIsStronger ? declared : byContent;

  return {
    category: winner.category,
    // Confidence comes from the declaration either way. Two independent signals
    // both saying "sensitive" is more evidence than one, never less, so a
    // disagreement must not be able to lower it.
    confidence: Math.max(declared.confidence, byContent.confidence),
    reason: `${declared.reason}, content looks like ${byContent.category}`,
  };
}

/**
 * Run the rule engine over a whole element map.
 *
 * Fields are flagged whether or not they currently hold a value. An empty
 * password box is still a password box: the page can fill it between capture and
 * transmission, and SECURITY_PRIVACY.md's tampering entry warns precisely about
 * that time-of-check gap. Deciding that an empty field needs no placeholder is
 * the Redaction Engine's job, not the detector's.
 */
export function detectDomPii(elements: readonly DomElement[]): SensitiveRegion[] {
  const regions: SensitiveRegion[] = [];

  for (const element of elements) {
    // Controls are judged by what they are declared to hold; text is judged by
    // what it actually says. Applying either test to the other kind produces
    // both false positives and, worse, false negatives.
    let hit: DomRuleHit | null = null;

    if (element.elementType === 'input') {
      const declared = classifyElement(element);
      // A field the rules did not recognise is still worth examining: its
      // content can identify it when its markup does not.
      hit = declared ? reconcile(declared, element.value) : null;

      const authorSupplied = AUTHOR_SUPPLIED_VALUE_TYPES.has(
        element.inputType?.toLowerCase() ?? '',
      );

      if (!hit && element.value && holdsFreeText(element)) {
        hit = classifyTextContent(element.value);

        // Default-to-hide. A field holding content that nothing recognised is
        // exactly the ambiguous case SECURITY_PRIVACY.md Section 4 rules on:
        // hide it. Until this existed, that rule was stated in the documents
        // and absent from the code, which reads worse than having no rule.
        //
        // The exception is a value the page author supplied rather than the
        // user — see AUTHOR_SUPPLIED_VALUE_TYPES. There is no uncertainty to
        // resolve in favour of hiding when nothing personal could be there.
        if (!hit && !authorSupplied) {
          hit = {
            category: 'other',
            confidence: UNIDENTIFIED_CONFIDENCE,
            reason: 'field holds content that matched no rule; hidden by default',
          };
        }
      }
    } else if (element.elementType === 'text' && element.value) {
      hit = classifyTextContent(element.value);
    }

    if (!hit) continue;

    regions.push({
      regionId: `dom-${element.elementId}`,
      category: hit.category,
      source: 'dom',
      confidence: hit.confidence,
      elementId: element.elementId,
      reason: hit.reason,
      position: element.position,
    });
  }

  return regions;
}
