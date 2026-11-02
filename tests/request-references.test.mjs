import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createReference, readReceipts, rememberReceipt, clearReceipts, receiptStatus, receiptText } from '../SKTS-netlify/request-references.mjs';

function memoryStorage(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem: (key, next) => { value = next; }, removeItem: () => { value = null; } };
}
function receipt(index = 1, kind = 'enquiry') {
  return { reference: `SKTS-${kind === 'payment' ? 'PAY-' : ''}20261101-${index.toString(16).toUpperCase().padStart(16, '0')}`, kind, submittedAt: '2026-11-01T10:00:00.000Z' };
}

test('references use secure random bytes and distinguish payment submissions', () => {
  const fixed = { getRandomValues: bytes => bytes.fill(0xab) };
  assert.equal(createReference('enquiry', fixed, new Date('2026-11-01T00:00:00Z')), 'SKTS-20261101-ABABABABABABABAB');
  assert.equal(createReference('payment', fixed, new Date('2026-11-01T00:00:00Z')), 'SKTS-PAY-20261101-ABABABABABABABAB');
  assert.notEqual(createReference('service', webcrypto), createReference('service', webcrypto));
});

test('stored receipts omit personal data, transaction details and forged payment statuses', () => {
  const storage = memoryStorage();
  rememberReceipt(storage, { ...receipt(1, 'payment'), name: 'Private name', email: 'private@example.com', amount: '999', transactionReference: 'PRIVATE-UTR', status: 'Paid and verified' });
  assert.deepEqual(readReceipts(storage), [receipt(1, 'payment')]);
  assert.equal(storage.getItem().includes('PRIVATE-UTR'), false);
  assert.match(receiptStatus('payment'), /awaiting manual verification/);
  assert.match(receiptText(readReceipts(storage)[0]), /not a payment confirmation/);
});

test('corrupt or invalid saved receipts are safely ignored', () => {
  assert.deepEqual(readReceipts(memoryStorage('{broken')), []);
  assert.deepEqual(readReceipts(memoryStorage('{}')), []);
  assert.deepEqual(readReceipts(memoryStorage(JSON.stringify([{ ...receipt(), reference: '<script>alert(1)</script>' }, { ...receipt(), kind: 'paid' }, { ...receipt(), submittedAt: 'invalid' }]))), []);
});

test('receipt history is bounded and duplicate references are replaced', () => {
  const storage = memoryStorage();
  for (let i = 1; i <= 25; i++) rememberReceipt(storage, receipt(i));
  assert.equal(readReceipts(storage).length, 20);
  assert.equal(readReceipts(storage)[0].reference, receipt(25).reference);
  rememberReceipt(storage, receipt(25));
  assert.equal(readReceipts(storage).length, 20);
  clearReceipts(storage);
  assert.deepEqual(readReceipts(storage), []);
});

test('unavailable storage does not throw or claim that a receipt was saved', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(readReceipts(storage), []);
  assert.equal(rememberReceipt(storage, receipt()), false);
  assert.equal(clearReceipts(storage), false);
});
