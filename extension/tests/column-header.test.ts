import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyByColumn, detectDomPii } from '../src/lib/pii/dom-rules';
import type { DomElement } from '../src/lib/types';

function cell(value: string, columnHeader: string | null): DomElement {
  return {
    elementId: 'e1',
    elementType: 'text',
    selector: '#e1',
    label: null,
    value,
    inputType: null,
    autocomplete: null,
    name: null,
    placeholder: null,
    columnHeader,
    position: { x: 0, y: 0, width: 50, height: 16 },
  };
}

test('a lone first name is hidden when its column says what it is', () => {
  // the-internet.herokuapp.com/tables: "John" and "Smith" in separate cells.
  const [region] = detectDomPii([cell('John', 'First Name')]);
  assert.equal(region?.category, 'name');
  assert.equal(detectDomPii([cell('Smith', 'Last Name')])[0]?.category, 'name');
});

test('the same word with no header, or an unrelated one, is left alone', () => {
  assert.equal(detectDomPii([cell('John', null)]).length, 0);
  assert.equal(detectDomPii([cell('Laptop', 'Item')]).length, 0);
});

test('headers name the kinds a person reads them as', () => {
  assert.equal(classifyByColumn('Email')?.category, 'email');
  assert.equal(classifyByColumn('Mobile')?.category, 'phone');
  assert.equal(classifyByColumn('Aadhaar · PAN')?.category, 'id_number');
  assert.equal(classifyByColumn('Account number')?.category, 'id_number');
  assert.equal(classifyByColumn('Customer')?.category, 'name');
  assert.equal(classifyByColumn('Employee')?.category, 'name');
});

test('columns that are not about a person stay readable', () => {
  for (const header of ['Item name', 'Department', 'City', 'Country', 'Risk', 'Documents', 'Application', 'Due']) {
    assert.equal(classifyByColumn(header), null, header);
  }
});

test('a cell whose own text is recognised keeps that reading', () => {
  const [region] = detectDomPii([cell('priya@example.com', 'Customer')]);
  assert.equal(region?.category, 'email');
});

test('the reason names the column kind, never the value', () => {
  const [region] = detectDomPii([cell('John', 'First Name')]);
  assert.equal(region?.reason.includes('John'), false);
});

test('names from outside India are found too', async () => {
  const { findPersonName } = await import('../src/lib/pii/dom-rules');
  for (const text of ['Cory Yamamoto', 'John Smith', 'Mohammed Al Farsi', 'Wei Zhang', 'Maria Gonzalez']) {
    assert.equal(findPersonName(text), true, text);
  }
});

test('interface words that are also names are not read as people', async () => {
  const { findPersonName } = await import('../src/lib/pii/dom-rules');
  for (const text of ['Mark As Read', 'Grace Period', 'May Update', 'Bill Payment', 'Frank Discussion']) {
    assert.equal(findPersonName(text), false, text);
  }
});

test('bracketed asides and punctuation in a header do not hide what it says', () => {
  assert.equal(classifyByColumn('First (& Middle) Name')?.category, 'name');
  assert.equal(classifyByColumn('E-mail:')?.category, 'email');
});
