/**
 * Health, insurance, employment and commerce.
 *
 * The categories a rubric written around "PII" tends to miss. A prescription is
 * not an identifier and is more sensitive than one; a nominee's name belongs to
 * somebody who is not at the keyboard; a résumé is a dossier. These pages are
 * here so the corpus measures more than digits in a box.
 */

import { button, field, image, page, text } from './build';

export const SERVICES = [
  page({
    id: 'svc-01-abha-appointment',
    source: 'synthetic',
    about: 'A hospital booking. A health ID plus what the visit is for.',
    elements: [
      text('h', 'Book an appointment'),
      field('abha', { label: 'ABHA Number', name: 'abhaNumber', value: '12-3456-7890-1234' }),
      field('name', { label: 'Patient Name', autocomplete: 'name', value: 'Vikram Sundaram' }),
      field('dob', { label: 'Date of Birth', inputType: 'date', value: '1985-01-09' }),
      field('mob', { label: 'Mobile', inputType: 'tel', value: '+91 98200 44517' }),
      field('dept', { label: 'Department', inputType: 'select-one', value: 'Cardiology' }),
      field('reason', {
        label: 'Reason for visit',
        value: 'Follow-up after angioplasty in June, chest tightness on exertion',
      }),
      button('book', 'Confirm appointment'),
    ],
    sensitive: [
      { elementId: 'abha', category: 'id_number' },
      { elementId: 'name', category: 'name' },
      { elementId: 'dob', category: 'other' },
      { elementId: 'mob', category: 'phone' },
      // The department is a health fact about a named patient the moment it
      // travels beside their name.
      { elementId: 'dept', category: 'other' },
      // The most sensitive string on the page and the one with no pattern
      // whatsoever. Labelled because of what it is, not what we can reach.
      { elementId: 'reason', category: 'other' },
    ],
  }),

  page({
    id: 'svc-02-insurance-policy',
    source: 'synthetic',
    about: 'A policy summary. A nominee is a third party who never consented.',
    elements: [
      text('h', 'Policy Details'),
      text('pol', 'Policy 8842551009 · Term Life · Sum assured Rs. 1,00,00,000'),
      text('life', 'Life assured: Meera Pillai, DOB 12 Mar 1990'),
      text('nom', 'Nominee: Arjun Pillai (Son), DOB 04 Jul 2016'),
      text('prem', 'Next premium Rs. 18,240 due 01 Oct 2026'),
      button('dl', 'Download policy document'),
      text('n', 'Claims helpline 1800 266 9999, 9 am to 6 pm.'),
    ],
    sensitive: [
      { elementId: 'pol', category: 'id_number' },
      { elementId: 'life', category: 'name' },
      // A minor's name and date of birth. The strongest argument in the corpus
      // for labelling from the page: nothing in this markup is distinguishable
      // from the line above it, and the stakes are not comparable.
      { elementId: 'nom', category: 'name' },
      { elementId: 'prem', category: 'other' },
    ],
  }),

  page({
    id: 'svc-03-job-application',
    source: 'synthetic',
    about: 'An application form. A résumé upload is a dossier in one element.',
    elements: [
      text('h', 'Apply — Backend Engineer, Bengaluru'),
      field('name', { label: 'Full Name', autocomplete: 'name', value: 'Ayesha Khan' }),
      field('mail', { label: 'Email', inputType: 'email', value: 'ayesha.khan@example.in' }),
      field('mob', { label: 'Phone', inputType: 'tel', value: '+91 99303 41120' }),
      field('ctc', { label: 'Current CTC (Rs. lakh)', value: '24.5' }),
      field('notice', { label: 'Notice Period', inputType: 'select-one', value: '60 days' }),
      field('linkedin', { label: 'LinkedIn', value: 'linkedin.example/in/ayesha-khan-4471' }),
      field('cover', {
        label: 'Cover note',
        inputType: 'textarea',
        value:
          'I am on a work visa expiring in March and would need sponsorship. ' +
          'Reachable on ayesha.khan@example.in or 99303 41120.',
        size: { width: 520, height: 80 },
      }),
      button('sub', 'Submit application'),
    ],
    sensitive: [
      { elementId: 'name', category: 'name' },
      { elementId: 'mail', category: 'email' },
      { elementId: 'mob', category: 'phone' },
      { elementId: 'ctc', category: 'other' },
      // A profile URL names a person as surely as their name does.
      { elementId: 'linkedin', category: 'other' },
      // Immigration status, plus the contact details again. Free text is where
      // people put the things a form never asked for.
      { elementId: 'cover', category: 'email' },
    ],
    // Notice period is a fact about a job, not about a person.
  }),

  page({
    id: 'svc-04-checkout',
    source: 'synthetic',
    about: 'A commerce checkout: a delivery address and a card, mid-entry.',
    elements: [
      text('h', 'Checkout'),
      field('cname', { label: 'Name on card', autocomplete: 'cc-name', value: 'ROHAN MEHRA' }),
      field('cnum', {
        label: 'Card number',
        autocomplete: 'cc-number',
        value: '5425 2334 3010 9903',
      }),
      field('cexp', { label: 'Expiry', autocomplete: 'cc-exp', value: '07/29' }),
      field('cvv', { label: 'CVV', autocomplete: 'cc-csc', inputType: 'password', value: '[has value]' }),
      field('ship', {
        label: 'Delivery address',
        autocomplete: 'street-address',
        value: 'Flat 3B, 14 Marine Lines, Mumbai 400020',
      }),
      field('gift', { label: 'Gift message', value: 'Happy birthday Priya! - R' }),
      text('order', 'Order 2026-4471290 · 3 items · Rs. 6,214.00'),
      button('pay', 'Pay Rs. 6,214.00'),
    ],
    sensitive: [
      { elementId: 'cname', category: 'name' },
      { elementId: 'cnum', category: 'id_number' },
      // An expiry date is a third of a card credential and useless alone, but
      // it is on the same screen as the number, and the pair is the credential.
      { elementId: 'cexp', category: 'other' },
      { elementId: 'cvv', category: 'password' },
      { elementId: 'ship', category: 'address' },
      // Two first names and an occasion. Trivial-looking, and it is somebody
      // else's data.
      { elementId: 'gift', category: 'name' },
    ],
    // `order` is a reference number that means nothing outside this account,
    // and it is shaped exactly like the things that do. A precision test.
  }),

  page({
    id: 'svc-05-profile-edit',
    source: 'synthetic',
    about: 'A social profile being edited. A face, a handle and a public bio.',
    elements: [
      text('h', 'Edit profile'),
      image('avatar', 'Your profile photograph', { width: 160, height: 160 }),
      field('handle', { label: 'Username', autocomplete: 'username', value: 'meerap' }),
      field('display', { label: 'Display name', value: 'Meera P.' }),
      field('bio', {
        label: 'Bio',
        value: 'Structural engineer in Bengaluru. Opinions mine. meera.pillai@example.in',
      }),
      field('mail', {
        label: 'Email (private)',
        inputType: 'email',
        autocomplete: 'email',
        value: 'meera.pillai@example.in',
      }),
      field('birthday', { label: 'Birthday', inputType: 'date', value: '1990-03-12' }),
      field('vis', { label: 'Who can see your birthday', inputType: 'select-one', value: 'Friends' }),
      button('save', 'Save changes'),
    ],
    sensitive: [
      { elementId: 'avatar', category: 'face' },
      { elementId: 'display', category: 'name' },
      // The bio is public by intent, and the user has put their email in it
      // anyway. Public-by-intent is not the same as safe to transmit.
      { elementId: 'bio', category: 'email' },
      { elementId: 'mail', category: 'email' },
      { elementId: 'birthday', category: 'other' },
    ],
    // A handle is chosen to be seen. `vis` is a setting.
  }),
];
