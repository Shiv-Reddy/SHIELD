/**
 * Telecom and utilities.
 *
 * These pages exist because a mobile number in India is an identity document in
 * practice — it is the login, the OTP channel and the KYC key — and because the
 * shapes differ from a form. Half of what identifies somebody here is rendered
 * text on a bill rather than a field with an `autocomplete` attribute.
 */

import { button, field, image, page, text } from './build';

export const TELECOM = [
  page({
    id: 'tel-01-recharge',
    source: 'synthetic',
    about: 'A prepaid recharge. One field carries everything.',
    elements: [
      text('h', 'Recharge your prepaid number'),
      field('mob', {
        label: 'Mobile Number',
        name: 'mobileNumber',
        inputType: 'tel',
        value: '9820011223',
      }),
      field('op', { label: 'Operator', inputType: 'select-one', value: 'Airtel' }),
      field('circle', { label: 'Circle', inputType: 'select-one', value: 'Mumbai' }),
      field('amt', { label: 'Amount', value: '299' }),
      button('go', 'Proceed to pay'),
      text('plan', 'Rs. 299 · 1.5 GB per day · 28 days · Unlimited calls'),
    ],
    sensitive: [{ elementId: 'mob', category: 'phone' }],
    // Operator, circle and plan are catalogue data. The circle is the one worth
    // arguing about: it narrows somebody to a region, and on its own it is far
    // too coarse to be worth hiding.
  }),

  page({
    id: 'tel-02-sim-kyc',
    source: 'synthetic',
    about: 'SIM KYC. Aadhaar, a photograph and a port-out code in one place.',
    elements: [
      text('h', 'Complete your SIM KYC'),
      field('mob', { label: 'Mobile Number', inputType: 'tel', value: '+91 98455 20031' }),
      field('name', { label: 'Name as on ID', value: 'Suresh Iyer' }),
      field('aadhaar', { label: 'Aadhaar Number', name: 'aadhaar', value: '7769 7301 0036' }),
      field('addr', {
        label: 'Address as on ID',
        autocomplete: 'street-address',
        value: '9 Cathedral Road, Chennai 600086',
      }),
      image('selfie', 'Live photograph for verification', { width: 260, height: 300 }),
      field('consent', {
        label: 'I consent to Aadhaar-based verification',
        inputType: 'checkbox',
        value: 'checked',
      }),
      button('sub', 'Verify'),
    ],
    sensitive: [
      { elementId: 'mob', category: 'phone' },
      { elementId: 'name', category: 'name' },
      { elementId: 'aadhaar', category: 'id_number' },
      { elementId: 'addr', category: 'address' },
      { elementId: 'selfie', category: 'face' },
    ],
  }),

  page({
    id: 'tel-03-postpaid-bill',
    source: 'synthetic',
    about: 'A postpaid bill. Identifying data as rendered text, plus a call log.',
    elements: [
      text('h', 'Bill for August 2026'),
      text('acc', 'Account 402711558903 · Relationship number 91234567'),
      text('who', 'Billed to Rohan Mehra, Flat 3B, 14 Marine Lines, Mumbai 400020'),
      text('num', 'Mobile 9820011223 · Plan Postpaid 599'),
      text('c1', '04 Aug 19:22 · 98455 20031 · 6 min 12 sec'),
      text('c2', '17 Aug 08:41 · 022 2266 1400 · 2 min 05 sec'),
      text('due', 'Amount payable Rs. 712.00 by 12 Sep 2026'),
      button('pay', 'Pay bill'),
      text('care', 'Customer care 121 · Complaints 198'),
    ],
    sensitive: [
      { elementId: 'acc', category: 'id_number' },
      { elementId: 'who', category: 'name' },
      { elementId: 'num', category: 'phone' },
      // A call log is somebody else's number and the fact that these two
      // people spoke. Sensitive twice over, and about a person who never
      // consented to anything here.
      { elementId: 'c1', category: 'phone' },
      { elementId: 'c2', category: 'phone' },
      { elementId: 'due', category: 'other' },
    ],
    // `care` is two published short codes.
  }),

  page({
    id: 'tel-04-broadband-order',
    source: 'synthetic',
    about: 'A new broadband connection. An installation address is a home address.',
    elements: [
      text('h', 'Book a new fibre connection'),
      field('name', { label: 'Full Name', autocomplete: 'name', value: 'Meera Pillai' }),
      field('mob', { label: 'Contact Number', inputType: 'tel', value: '9008841207' }),
      field('alt', { label: 'Alternate Number', inputType: 'tel', value: '080 4123 7788' }),
      field('mail', { label: 'Email', inputType: 'email', value: 'meera.pillai@example.in' }),
      field('addr', {
        label: 'Installation Address',
        autocomplete: 'street-address',
        value: '412, 4th Cross, Indiranagar, Bengaluru 560038',
      }),
      field('slot', { label: 'Preferred Slot', inputType: 'select-one', value: 'Morning' }),
      button('book', 'Book installation'),
    ],
    sensitive: [
      { elementId: 'name', category: 'name' },
      { elementId: 'mob', category: 'phone' },
      { elementId: 'alt', category: 'phone' },
      { elementId: 'mail', category: 'email' },
      { elementId: 'addr', category: 'address' },
    ],
  }),

  page({
    id: 'tel-05-electricity-bill',
    source: 'synthetic',
    about: 'A utility account, where the consumer number is the identifier.',
    elements: [
      text('h', 'View and pay your electricity bill'),
      field('consumer', {
        label: 'Consumer Number',
        name: 'consumerNumber',
        value: '150034729',
      }),
      button('view', 'View bill'),
      text('r1', 'Consumer 150034729 · MEERA PILLAI · 412 4th Cross Indiranagar'),
      text('r2', 'Units consumed 214 · Bill Rs. 2,318.00 · Due 20 Sep 2026'),
      text('r3', 'Sanctioned load 4 kW · Meter 8842551009'),
    ],
    sensitive: [
      { elementId: 'consumer', category: 'id_number' },
      // A name and a home address in one line of prose, which is how every
      // utility in the country renders a bill.
      { elementId: 'r1', category: 'name' },
      { elementId: 'r2', category: 'other' },
      // A meter number identifies a physical address as reliably as the address
      // does, and it looks like nothing at all.
      { elementId: 'r3', category: 'id_number' },
    ],
  }),
];
