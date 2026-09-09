/**
 * Indian government portals.
 *
 * WHY THESE FIRST
 *
 * The identifier taxonomy is what separates Shield from a generic PII redactor,
 * and these are the pages that exercise it. An Aadhaar number, a PAN, a UAN, an
 * EPIC and a GSTIN all live here, in the field-naming conventions the real
 * portals use — `uid`, `panAadhaar`, `uan`, `epicNumber` — because a detector
 * tuned on `id_number` and `national_id` would find none of them.
 *
 * These pages were written from what these forms carry, and labelled from that.
 * No page here was checked against `detectDomPii` before its labels existed,
 * and several are labelled in places the DOM path cannot reach.
 */

import { button, field, image, page, text } from './build';

export const GOVERNMENT = [
  page({
    id: 'gov-01-itr-login',
    source: 'synthetic',
    about: 'Income tax e-filing sign-in. The user ID is a PAN.',
    elements: [
      text('h', 'e-Filing — Income Tax Department, Government of India'),
      text('g', 'Your PAN is your user ID. Do not share your password with anyone.'),
      field('userId', {
        label: 'Enter your User ID',
        name: 'panAadhaar',
        value: 'ABCPE1234F',
      }),
      field('pw', {
        label: 'Password',
        name: 'password',
        inputType: 'password',
        autocomplete: 'current-password',
        value: '[has value]',
      }),
      field('captcha', { label: 'Enter the characters shown', name: 'captcha', value: null }),
      button('go', 'Continue'),
      text('f', 'Helpdesk 1800 103 0025 · efilingwebmanager@incometax.gov.in'),
    ],
    sensitive: [
      { elementId: 'userId', category: 'id_number' },
      { elementId: 'pw', category: 'password' },
    ],
    // `f` is a published helpdesk line and a departmental mailbox. Neither
    // belongs to a person and neither is worth hiding, so it is a negative —
    // and an honest test of whether the phone and email rules can tell a public
    // contact from a personal one.
  }),

  page({
    id: 'gov-02-itr-personal',
    source: 'synthetic',
    about: 'Prefilled return, personal information step. The dense case.',
    elements: [
      text('h', 'Personal Information — Assessment Year 2026-27'),
      field('pan', { label: 'PAN', name: 'pan', value: 'ABCPE1234F' }),
      field('aadhaar', {
        label: 'Aadhaar Number',
        name: 'aadhaarNumber',
        value: '4253 3561 6902',
      }),
      field('fname', { label: 'First Name', autocomplete: 'given-name', value: 'Rohan' }),
      field('lname', { label: 'Last Name', autocomplete: 'family-name', value: 'Mehra' }),
      field('dob', { label: 'Date of Birth', name: 'dob', inputType: 'date', value: '1991-07-14' }),
      field('mob', {
        label: 'Mobile Number',
        name: 'mobile',
        inputType: 'tel',
        value: '+91 98200 11223',
      }),
      field('mail', {
        label: 'Email Address',
        name: 'email',
        inputType: 'email',
        value: 'rohan.mehra@example.in',
      }),
      field('addr', {
        label: 'Flat / Door / Building',
        autocomplete: 'street-address',
        value: 'Flat 3B, 14 Marine Lines',
      }),
      field('pin', { label: 'PIN Code', name: 'pincode', value: '400020' }),
      text('n', 'Your Aadhaar is linked to this PAN. Contact details are used for e-verification.'),
      button('save', 'Save and continue'),
    ],
    sensitive: [
      { elementId: 'pan', category: 'id_number' },
      { elementId: 'aadhaar', category: 'id_number' },
      { elementId: 'fname', category: 'name' },
      { elementId: 'lname', category: 'name' },
      // A date of birth is personal data and none of the named categories fit.
      { elementId: 'dob', category: 'other' },
      { elementId: 'mob', category: 'phone' },
      { elementId: 'mail', category: 'email' },
      { elementId: 'addr', category: 'address' },
      // A PIN code alone is coarse; this one is part of the filer's own address
      // and sits beside it, and a careful person would not send it.
      { elementId: 'pin', category: 'address' },
    ],
  }),

  page({
    id: 'gov-03-epfo-passbook',
    source: 'synthetic',
    about: 'EPFO member sign-in. A UAN is twelve digits and is not an Aadhaar.',
    elements: [
      text('h', 'Member Passbook — Employees Provident Fund Organisation'),
      field('uan', { label: 'UAN', name: 'uan', value: '101234567890' }),
      field('pw', {
        label: 'Password',
        name: 'password',
        inputType: 'password',
        value: '[has value]',
      }),
      field('cap', { label: 'Captcha', name: 'captcha', value: null }),
      button('in', 'Sign in'),
      text('n', 'The Universal Account Number is a twelve-digit number allotted to each member.'),
    ],
    sensitive: [
      { elementId: 'uan', category: 'id_number' },
      { elementId: 'pw', category: 'password' },
    ],
    // `n` explains the format without carrying a number. It is here because a
    // rule matching on the words around a value, rather than on the value,
    // flags sentences like this one.
  }),

  page({
    id: 'gov-04-uidai-update',
    source: 'synthetic',
    about: 'Aadhaar self-service address update, with the letter shown as an image.',
    elements: [
      text('h', 'Update your address in Aadhaar'),
      field('uid', { label: 'Aadhaar Number', name: 'uid', value: '5121 3778 3512' }),
      field('otp', { label: 'Enter OTP', name: 'otp', value: null }),
      text('sent', 'An OTP has been sent to the mobile number ending 1223.'),
      field('newaddr', {
        label: 'New address',
        autocomplete: 'street-address',
        value: '22 Sardar Patel Road, Andheri East',
      }),
      field('pin', { label: 'PIN Code', value: '400069' }),
      image('letter', 'Your current Aadhaar letter'),
      button('sub', 'Submit update request'),
    ],
    sensitive: [
      { elementId: 'uid', category: 'id_number' },
      { elementId: 'newaddr', category: 'address' },
      { elementId: 'pin', category: 'address' },
      // The letter carries the number, the name, the address and a photograph.
      // Labelled here as the identifier it leads with; what is printed inside
      // it is labelled again, as boxes, in pixels.ts.
      { elementId: 'letter', category: 'id_number' },
    ],
    // `otp` is empty and `sent` gives four digits of a mobile number. Neither is
    // labelled. The second is a deliberate near-miss: it reads like a phone
    // number to a person and carries almost nothing.
  }),

  page({
    id: 'gov-05-passport-seva',
    source: 'synthetic',
    about: 'Passport Seva registration, part-filled.',
    elements: [
      text('h', 'Register — Passport Seva Online Portal'),
      field('office', { label: 'Passport Office', inputType: 'select-one', value: 'Mumbai' }),
      field('given', { label: 'Given Name', autocomplete: 'given-name', value: 'Priya' }),
      field('surname', { label: 'Surname', autocomplete: 'family-name', value: 'Raghunathan' }),
      field('dob', { label: 'Date of Birth', inputType: 'date', value: '1996-02-03' }),
      field('mail', {
        label: 'E-mail Id',
        name: 'email',
        inputType: 'email',
        value: 'priya.r@example.in',
      }),
      field('loginid', { label: 'Login Id', name: 'loginId', value: 'priya.r@example.in' }),
      field('pw', {
        label: 'Password',
        inputType: 'password',
        autocomplete: 'new-password',
        value: '[has value]',
      }),
      field('hint', { label: 'Hint Answer', name: 'hintAnswer', value: 'Kanchipuram' }),
      button('reg', 'Register'),
    ],
    sensitive: [
      { elementId: 'given', category: 'name' },
      { elementId: 'surname', category: 'name' },
      { elementId: 'dob', category: 'other' },
      { elementId: 'mail', category: 'email' },
      { elementId: 'loginid', category: 'email' },
      { elementId: 'pw', category: 'password' },
      // A security answer is a credential in every way that matters. It is
      // usually a place or a relative's name, and it resets the account.
      { elementId: 'hint', category: 'other' },
    ],
    // `office` is a value from a public list. Nothing about it identifies anyone.
  }),

  page({
    id: 'gov-06-gst-registration',
    source: 'synthetic',
    about: 'GST registration, business details. A GSTIN contains a PAN.',
    elements: [
      text('h', 'Application for Registration — Business Details'),
      field('gstin', { label: 'GSTIN / UIN', name: 'gstin', value: '27ABCPE1234F1Z5' }),
      field('legal', {
        label: 'Legal Name of Business (as per PAN)',
        value: 'Mehra Traders Private Limited',
      }),
      field('trade', { label: 'Trade Name', value: 'Mehra Traders' }),
      field('pan', { label: 'Permanent Account Number', name: 'pan', value: 'ABCPE1234F' }),
      field('mail', {
        label: 'Email Address of Primary Authorised Signatory',
        inputType: 'email',
        value: 'accounts@mehratraders.example.in',
      }),
      field('mob', { label: 'Mobile Number', inputType: 'tel', value: '9820011223' }),
      button('next', 'Save and continue'),
    ],
    sensitive: [
      // A GSTIN is published and must be displayed on invoices, but on the
      // holder's own registration screen it sits beside their PAN and their
      // signatory's contact details, and the combination is the filing itself.
      { elementId: 'gstin', category: 'id_number' },
      { elementId: 'pan', category: 'id_number' },
      { elementId: 'mail', category: 'email' },
      { elementId: 'mob', category: 'phone' },
    ],
    // A registered company name is public record, so `legal` and `trade` are
    // negatives. The name rules are expected to flag `legal` on the word
    // "Name" — an over-flag worth seeing rather than defining away.
  }),

  page({
    id: 'gov-07-nsp-scholarship',
    source: 'synthetic',
    about: 'Scholarship application. Aadhaar, bank account and IFSC on one screen.',
    elements: [
      text('h', 'National Scholarship Portal — Bank and Identity Details'),
      field('student', { label: 'Name of Applicant', value: 'Ayesha Khan' }),
      field('aadhaar', { label: 'Aadhaar Number', name: 'aadhaar', value: '6949 4185 1304' }),
      field('acc', { label: 'Bank Account Number', name: 'accountNumber', value: '50100234567890' }),
      field('confirm', { label: 'Confirm Account Number', value: '50100234567890' }),
      field('ifsc', { label: 'IFSC Code', name: 'ifsc', value: 'HDFC0000123' }),
      field('branch', { label: 'Branch', value: 'Andheri West' }),
      field('income', { label: 'Annual Family Income (Rs.)', value: '248000' }),
      button('sub', 'Submit'),
    ],
    sensitive: [
      { elementId: 'student', category: 'name' },
      { elementId: 'aadhaar', category: 'id_number' },
      { elementId: 'acc', category: 'id_number' },
      { elementId: 'confirm', category: 'id_number' },
      // An IFSC identifies a branch, not a person — but next to that account
      // number it is half of a payment instruction, which is the reading that
      // matters here.
      { elementId: 'ifsc', category: 'id_number' },
      // Household income is exactly what a careful person does not send. Shield
      // has no rule for an amount, so this is an expected miss, and it is
      // labelled because it is sensitive rather than because it is reachable.
      { elementId: 'income', category: 'other' },
    ],
  }),

  page({
    id: 'gov-08-parivahan-dl',
    source: 'synthetic',
    about: 'Driving licence status check, with the number repeated in prose.',
    elements: [
      text('h', 'Parivahan Sewa — Application Status'),
      field('dl', { label: 'Driving Licence Number', name: 'dlNo', value: 'MH14 2019 0012345' }),
      field('dob', { label: 'Date of Birth', inputType: 'date', value: '1988-11-22' }),
      field('cap', { label: 'Verification Code', value: null }),
      button('check', 'Check status'),
      text('res', 'Application DL-1420190012345 is at stage: Biometrics captured.'),
    ],
    sensitive: [
      { elementId: 'dl', category: 'id_number' },
      { elementId: 'dob', category: 'other' },
      // The same licence number as prose. A field and a sentence are two
      // different detection problems and only one of them has attributes.
      { elementId: 'res', category: 'id_number' },
    ],
  }),

  page({
    id: 'gov-09-voter-epic',
    source: 'synthetic',
    about: 'Electoral roll search. A result page about one named person.',
    elements: [
      text('h', 'Search in Electoral Roll'),
      field('epic', { label: 'EPIC Number', name: 'epicNumber', value: 'MHZ8842301' }),
      field('state', { label: 'State', inputType: 'select-one', value: 'Maharashtra' }),
      button('find', 'Search'),
      text('r1', 'Elector: Vikram Sundaram, Age 41'),
      text('r2', 'Part number 118, Serial number 442, Polling station: Municipal School, Dadar'),
      image('photo', 'Elector photograph', { width: 180, height: 220 }),
    ],
    sensitive: [
      { elementId: 'epic', category: 'id_number' },
      // A name in prose. A known structural limit, labelled anyway.
      { elementId: 'r1', category: 'name' },
      // Part, serial and polling station together place a named person at an
      // address, and none of the named categories covers that.
      { elementId: 'r2', category: 'other' },
      { elementId: 'photo', category: 'face' },
    ],
  }),

  page({
    id: 'gov-10-cpgrams',
    source: 'synthetic',
    about: 'A public grievance, where the identifying data is inside free text.',
    elements: [
      text('h', 'Lodge a Public Grievance'),
      field('name', { label: 'Name of Complainant', value: 'Suresh Iyer' }),
      field('mob', { label: 'Mobile', inputType: 'tel', value: '+91 98455 20031' }),
      field('mail', { label: 'Email', inputType: 'email', value: 'suresh.iyer@example.in' }),
      field('cat', { label: 'Grievance Category', inputType: 'select-one', value: 'Pension' }),
      field('body', {
        label: 'Grievance Description',
        // A textarea. `dom-map.ts` reports one as an input carrying the DOM's
        // own type name, so that is what the page says here.
        inputType: 'textarea',
        value:
          'My pension has not been credited since April. PPO number 5121377835 and ' +
          'account 30123456789 at IFSC PUNB0123456 were verified at the branch in March.',
        size: { width: 520, height: 96 },
      }),
      button('sub', 'Lodge grievance'),
      text('n', 'Grievances are forwarded to the concerned ministry within seven days.'),
    ],
    sensitive: [
      { elementId: 'name', category: 'name' },
      { elementId: 'mob', category: 'phone' },
      { elementId: 'mail', category: 'email' },
      // The least tested shape on any government portal: a free text box the
      // user has pasted their own identifiers into. Nothing in the markup says
      // this field is sensitive. Only its contents do.
      { elementId: 'body', category: 'id_number' },
    ],
  }),
];
