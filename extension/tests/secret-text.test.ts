import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyTextContent } from '../src/lib/pii/dom-rules';
import { scrubTextContent as scrubText } from '../src/lib/redaction/placeholders';

test('a password printed on the page is hidden', () => {
  // The OrangeHRM demo login prints its credentials as text.
  assert.equal(classifyTextContent('Password : admin123')?.category, 'password');
  assert.equal(classifyTextContent('Your OTP = 482913')?.category, 'password');
  assert.equal(classifyTextContent('Wi-Fi passcode: BlueSky2026')?.category, 'password');
});

test('the word alone, with nothing after it, is not a secret', () => {
  assert.equal(classifyTextContent('Forgot your password?'), null);
  assert.equal(classifyTextContent('Change password'), null);
});

test('the scrubber removes the secret with its label', () => {
  assert.equal(scrubText('Username : Admin | Password : admin123').includes('admin123'), false);
});
