/**
 * Controls. The correct answer on every page here is nothing at all.
 *
 * WHY A CORPUS ABOUT FINDING THINGS NEEDS PAGES WITH NOTHING ON THEM
 *
 * Precision is only measurable against pages where being wrong is possible.
 * Without these, the way to score well is to flag everything, and the report
 * would applaud a detector that redacted entire pages.
 *
 * These are not blank pages. Every one is dense with strings shaped exactly
 * like the things Shield hunts: an IFSC directory, a PNR help page, GSTINs
 * printed on invoices because the law requires it, tender numbers, ranges,
 * versions and prices. Public reference data that LOOKS like personal data is
 * the hard half of this problem, and it is the half a corpus of forms never
 * touches.
 */

import { button, field, page, text } from './build';

export const CONTROLS = [
  page({
    id: 'ctl-01-ifsc-directory',
    source: 'synthetic',
    about: 'A public branch directory. Every code here belongs to a bank, not a person.',
    elements: [
      text('h', 'Find a branch IFSC'),
      field('bank', { label: 'Bank', inputType: 'select-one', value: 'State Bank of India' }),
      field('state', { label: 'State', inputType: 'select-one', value: 'Maharashtra' }),
      button('find', 'Search'),
      text('r1', 'Fort, Mumbai · SBIN0000300 · MICR 400002003'),
      text('r2', 'Andheri West, Mumbai · HDFC0000123 · MICR 400240015'),
      text('r3', 'Dadar TT, Mumbai · ICIC0004567 · MICR 400229088'),
      text('n', 'Directory last updated 01 Aug 2026. 1,42,000 branches listed.'),
    ],
    // Deliberately empty. An IFSC identifies a branch; a MICR line identifies a
    // branch; both are published so that people can pay each other. Shield
    // flags IFSC codes wherever it finds them, so this page is expected to cost
    // precision — and that cost is a real property of a rule that cannot see
    // context, not something to define away.
    sensitive: [],
  }),

  page({
    id: 'ctl-02-pnr-help',
    source: 'synthetic',
    about: 'A help page about number formats. Every example is a decoy.',
    elements: [
      text('h', 'Where do I find my PNR?'),
      text('p1', 'A PNR is the ten-digit number printed at the top left of your ticket.'),
      text('p2', 'Example: 4512345678. It is not your ticket number and not your UTS ID.'),
      text('p3', 'A train number has four or five digits, for example 12951 Rajdhani Express.'),
      text('p4', 'Enquiries: 139. Refund rules are in sections 210-260 of the manual.'),
      field('q', { inputType: 'search', placeholder: 'Search help articles', value: null }),
      button('s', 'Search'),
    ],
    // A ten-digit example number belonging to nobody, a train number, a short
    // code and a section range. The digit-run rules have no way to tell any of
    // these from an account number, which is exactly why the page is here.
    sensitive: [],
  }),

  page({
    id: 'ctl-03-invoice-footer',
    source: 'synthetic',
    about: 'A seller listing. GSTINs printed because the law requires it.',
    elements: [
      text('h', 'Sold by Northline Retail'),
      text('g1', 'GSTIN 27ABCPE1234F1Z5 · Registered office: Unit 4, MIDC Andheri, Mumbai'),
      text('g2', 'CIN U52100MH2015PTC264471 · PAN ABCPE1234F'),
      text('c', 'Support: care@northline.example.in · 1800 200 4400'),
      text('t', 'Prices include GST at 18%. Invoice series NR/2026-27/004512.'),
      text('r', 'Returns accepted within 7 days. See sections 4-9 of our policy.'),
    ],
    // A company's GSTIN, CIN and PAN are public register entries that a seller
    // is required to display, and its support line is published to be called.
    // Shield flags GSTIN and PAN unconditionally, so this page will cost
    // precision. That is the honest trade: a rule that hid a person's PAN and
    // not a company's would need to know which it was looking at, and nothing
    // in the markup says.
    sensitive: [],
  }),

  page({
    id: 'ctl-04-tender-notice',
    source: 'synthetic',
    about: 'A government notice. Dense with references, empty of people.',
    elements: [
      text('h', 'Notice Inviting Tender — Civil Works'),
      text('t1', 'Tender 2026/PWD/MH/004471 · Published 01 Sep 2026 · Closes 22 Sep 2026'),
      text('t2', 'Estimated cost Rs. 4,85,00,000. Earnest money Rs. 9,70,000.'),
      text('t3', 'Documents may be downloaded between 02 Sep 2026 and 20 Sep 2026.'),
      text('t4', 'Queries to the Executive Engineer, PWD Division 2, during office hours.'),
      text('t5', 'Corrigendum 1 dated 05 Sep 2026 revises clauses 12-18 and annexure 4.'),
      button('dl', 'Download tender document'),
    ],
    // A designation is not a person, and every number here is a reference, an
    // amount or a date. The first phone pattern this project wrote matched
    // "2024-2025"; this page is what that lesson looks like as a control.
    sensitive: [],
  }),
];
