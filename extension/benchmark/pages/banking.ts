/**
 * Banking and payments.
 *
 * The pages where a miss costs money rather than privacy, and where the hardest
 * labelling calls in the corpus live. An IFSC beside an account number is half
 * a payment instruction; the same IFSC in a branch directory is public
 * reference data. A GSTIN on an invoice footer is published by law. Getting
 * those two right in opposite directions is what stops the corpus from being a
 * list of everything that looks like a number.
 *
 * Card numbers here are the standard test values (Luhn-valid, issued to nobody).
 * Account numbers and names are invented.
 */

import { button, field, image, page, text } from './build';

export const BANKING = [
  page({
    id: 'bank-01-netbanking-login',
    source: 'synthetic',
    about: 'Net banking sign-in. A customer ID is not an account number.',
    elements: [
      text('h', 'Personal Banking — Login'),
      field('cif', { label: 'Customer ID', name: 'userName', value: '48210577' }),
      field('pw', {
        label: 'Password',
        name: 'password',
        inputType: 'password',
        autocomplete: 'current-password',
        value: '[has value]',
      }),
      field('cap', { label: 'Enter the text shown', name: 'captcha', value: null }),
      button('in', 'Login'),
      text('warn', 'We never ask for your password, OTP or card PIN over phone or email.'),
      text('help', 'Toll free 1800 11 2211 · Report fraud at 155260'),
    ],
    sensitive: [
      { elementId: 'cif', category: 'id_number' },
      { elementId: 'pw', category: 'password' },
    ],
    // `warn` and `help` are the bank talking to everybody. Public, and the
    // second is a live test of whether the phone rule can tell a helpline from
    // a person's mobile.
  }),

  page({
    id: 'bank-02-add-beneficiary',
    source: 'synthetic',
    about: 'Adding a payee. Everything on this screen is a payment credential.',
    elements: [
      text('h', 'Add a beneficiary'),
      field('bname', { label: 'Beneficiary Name', value: 'Lakshmi Narayanan' }),
      field('acc', { label: 'Account Number', name: 'accountNumber', value: '30123456789' }),
      field('reacc', { label: 'Re-enter Account Number', value: '30123456789' }),
      field('ifsc', { label: 'IFSC', name: 'ifsc', value: 'SBIN0001234' }),
      field('nick', { label: 'Nickname', autocomplete: 'nickname', value: 'Lakshmi - rent' }),
      field('limit', { label: 'Transfer Limit (Rs.)', value: '100000' }),
      button('add', 'Add beneficiary'),
      text('n', 'A beneficiary can be used thirty minutes after being added.'),
    ],
    sensitive: [
      { elementId: 'bname', category: 'name' },
      { elementId: 'acc', category: 'id_number' },
      { elementId: 'reacc', category: 'id_number' },
      { elementId: 'ifsc', category: 'id_number' },
      // A nickname the user typed, carrying a person's name and what the money
      // is for. Declared a nickname, holds far more.
      { elementId: 'nick', category: 'name' },
    ],
    // `limit` is a setting the user chose, not a fact about them. Not labelled.
  }),

  page({
    id: 'bank-03-account-summary',
    source: 'synthetic',
    about: 'A logged-in summary. Everything identifying is rendered text, not fields.',
    elements: [
      text('h', 'Accounts'),
      text('who', 'Welcome back, Rohan Mehra'),
      text('a1', 'Savings A/c 402711558903 · Available balance Rs. 1,84,220.55'),
      text('a2', 'Credit Card XXXX XXXX XXXX 1486 · Outstanding Rs. 12,430.00'),
      text('a3', 'Last login 08 Sep 2026, 21:14 from Mumbai'),
      button('stmt', 'Download statement'),
      text('n', 'Statements are available for the last 24 months.'),
    ],
    sensitive: [
      // A name in prose, in the place every bank puts one.
      { elementId: 'who', category: 'name' },
      { elementId: 'a1', category: 'id_number' },
      // The last four digits of a card are shown by design and identify nobody
      // on their own; the outstanding balance beside them is personal financial
      // data, and that is what earns this label.
      { elementId: 'a2', category: 'other' },
      { elementId: 'a3', category: 'other' },
    ],
  }),

  page({
    id: 'bank-04-kyc-update',
    source: 'synthetic',
    about: 'Re-KYC, with a document upload preview.',
    elements: [
      text('h', 'Complete your re-KYC'),
      field('pan', { label: 'PAN', name: 'pan', value: 'BXYPK4521M' }),
      field('aadhaar', { label: 'Aadhaar (last 4 digits)', value: '3512' }),
      field('addr1', {
        label: 'Address Line 1',
        autocomplete: 'address-line1',
        value: '7 Nehru Cross Road',
      }),
      field('addr2', { label: 'Address Line 2', autocomplete: 'address-line2', value: 'Vile Parle East' }),
      field('city', { label: 'City', autocomplete: 'address-level2', value: 'Mumbai' }),
      field('pin', { label: 'PIN', autocomplete: 'postal-code', value: '400057' }),
      image('proof', 'Uploaded address proof'),
      button('sub', 'Submit for verification'),
    ],
    sensitive: [
      { elementId: 'pan', category: 'id_number' },
      { elementId: 'addr1', category: 'address' },
      { elementId: 'addr2', category: 'address' },
      { elementId: 'pin', category: 'address' },
      // A scan of a utility bill or a passport page. Its contents are pixels.
      { elementId: 'proof', category: 'id_number' },
    ],
    // `aadhaar` here holds four digits, which is what the bank displays back
    // and what identifies nobody. Labelled as a negative deliberately: the word
    // "Aadhaar" in the label is exactly the signal a name-matching rule fires
    // on, and this is where that costs precision.
    // `city` alone is not an address.
  }),

  page({
    id: 'bank-05-upi-pay',
    source: 'synthetic',
    about: 'A UPI payment. Short identifiers the digit-run rules never see.',
    elements: [
      text('h', 'Pay by UPI'),
      field('vpa', { label: 'UPI ID', name: 'payeeVpa', value: 'lakshmi.n@okhdfcbank' }),
      field('amt', { label: 'Amount', value: '4500' }),
      field('note', { label: 'Add a note', value: 'Rent for September, flat 3B' }),
      field('pin', { label: 'UPI PIN', inputType: 'password', value: '[has value]' }),
      button('pay', 'Pay'),
      text('from', 'Paying from A/c ending 8903'),
    ],
    sensitive: [
      { elementId: 'vpa', category: 'id_number' },
      { elementId: 'pin', category: 'password' },
      // A note the user typed, naming where they live.
      { elementId: 'note', category: 'address' },
    ],
    // `from` shows four digits, by design, and identifies nothing.
  }),

  page({
    id: 'bank-06-loan-application',
    source: 'synthetic',
    about: 'A loan application: identity, employment and income together.',
    elements: [
      text('h', 'Personal Loan — Applicant Details'),
      field('name', { label: 'Full Name (as per PAN)', value: 'Ayesha Khan' }),
      field('pan', { label: 'PAN', value: 'AFZPK7190H' }),
      field('dob', { label: 'Date of Birth', inputType: 'date', value: '1993-05-30' }),
      field('mob', { label: 'Mobile', inputType: 'tel', value: '+91 99303 41120' }),
      field('mail', { label: 'Email', inputType: 'email', value: 'ayesha.khan@example.in' }),
      field('emp', { label: 'Employer Name', value: 'Northline Logistics Pvt Ltd' }),
      field('income', { label: 'Net Monthly Income (Rs.)', value: '92000' }),
      field('obl', { label: 'Existing EMI Obligations (Rs.)', value: '18400' }),
      button('sub', 'Check eligibility'),
    ],
    sensitive: [
      { elementId: 'name', category: 'name' },
      { elementId: 'pan', category: 'id_number' },
      { elementId: 'dob', category: 'other' },
      { elementId: 'mob', category: 'phone' },
      { elementId: 'mail', category: 'email' },
      // Where somebody works is personal, and on a loan form it is the field
      // that ties the rest to a real life.
      { elementId: 'emp', category: 'other' },
      { elementId: 'income', category: 'other' },
      { elementId: 'obl', category: 'other' },
    ],
  }),

  page({
    id: 'bank-07-card-statement',
    source: 'synthetic',
    about: 'A card statement. The full number appears once, in prose.',
    elements: [
      text('h', 'Credit Card Statement — August 2026'),
      text('card', 'Card 4539 5787 6362 1486 issued to ROHAN MEHRA'),
      text('addr', 'Statement address: Flat 3B, 14 Marine Lines, Mumbai 400020'),
      text('t1', '02 Aug · Blue Tokai Coffee, Bandra · Rs. 640.00'),
      text('t2', '11 Aug · IRCTC Rail Connect · Rs. 2,145.00'),
      text('t3', '19 Aug · Apollo Pharmacy, Vile Parle · Rs. 1,890.00'),
      text('due', 'Total due Rs. 12,430.00 by 05 Sep 2026'),
      button('pay', 'Pay now'),
    ],
    sensitive: [
      { elementId: 'card', category: 'id_number' },
      { elementId: 'addr', category: 'address' },
      // A line of transactions is a record of where somebody was and what they
      // bought. Individually dull, together a movement history, and the
      // pharmacy line is health-adjacent. None of it has a pattern to match.
      { elementId: 't1', category: 'other' },
      { elementId: 't2', category: 'other' },
      { elementId: 't3', category: 'other' },
      { elementId: 'due', category: 'other' },
    ],
  }),

  page({
    id: 'bank-08-cheque-deposit',
    source: 'synthetic',
    about: 'A deposit slip with the cheque photographed. Almost all of it is pixels.',
    elements: [
      text('h', 'Deposit a cheque'),
      field('acc', { label: 'Credit to Account', inputType: 'select-one', value: '402711558903' }),
      field('amt', { label: 'Cheque Amount (Rs.)', value: '25000' }),
      field('cheq', { label: 'Cheque Number', value: '004512' }),
      image('front', 'Photograph of the cheque, front', { width: 420, height: 190 }),
      image('back', 'Photograph of the cheque, back', { width: 420, height: 190 }),
      button('sub', 'Deposit'),
    ],
    sensitive: [
      { elementId: 'acc', category: 'id_number' },
      // A cheque carries the drawer's name, account number, IFSC and signature.
      // Nothing in the markup says any of that; it is a photograph.
      { elementId: 'front', category: 'id_number' },
      { elementId: 'back', category: 'id_number' },
    ],
    // A cheque number alone is meaningless without the account, which is why it
    // is a negative and the account select is not.
  }),
];
