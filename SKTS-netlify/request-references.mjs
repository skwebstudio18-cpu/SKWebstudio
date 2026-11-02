const STORAGE_KEY = 'skts-submission-receipts-v1';
const KINDS = new Set(['enquiry', 'service', 'payment']);
const REFERENCE = /^SKTS-(?:PAY-)?\d{8}-[A-F0-9]{16}$/;

export function createReference(kind, random = globalThis.crypto, date = new Date()) {
  if (!KINDS.has(kind)) throw new Error('Unknown request kind');
  const bytes = new Uint8Array(8);
  random.getRandomValues(bytes);
  const suffix = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `SKTS-${kind === 'payment' ? 'PAY-' : ''}${day}-${suffix}`;
}

function cleanReceipt(value) {
  if (!value || typeof value !== 'object' || !KINDS.has(value.kind) || !REFERENCE.test(value.reference)) return null;
  if ((value.kind === 'payment') !== value.reference.startsWith('SKTS-PAY-')) return null;
  if (typeof value.submittedAt !== 'string' || !Number.isFinite(Date.parse(value.submittedAt))) return null;
  // Keep only receipt metadata. Never persist names, email addresses, amounts or UPI transaction details.
  return { reference: value.reference, kind: value.kind, submittedAt: new Date(value.submittedAt).toISOString() };
}

export function readReceipts(storage) {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    return data.map(cleanReceipt).filter(receipt => {
      if (!receipt || seen.has(receipt.reference)) return false;
      seen.add(receipt.reference);
      return true;
    }).slice(0, 20);
  } catch { return []; }
}

export function rememberReceipt(storage, value) {
  const receipt = cleanReceipt(value);
  if (!receipt) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([receipt, ...readReceipts(storage).filter(item => item.reference !== receipt.reference)].slice(0, 20)));
    return true;
  } catch { return false; }
}

export function clearReceipts(storage) {
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

export function receiptLabel(kind) {
  return { enquiry: 'Project enquiry', service: 'Service request', payment: 'Payment reference' }[kind] || 'Request';
}

export function receiptStatus(kind) {
  return kind === 'payment' ? 'Submitted — awaiting manual verification' : 'Request submitted';
}

export function receiptText(receipt) {
  return `SKTS — Submission receipt\n\nReference: ${receipt.reference}\nType: ${receiptLabel(receipt.kind)}\nSubmitted: ${receipt.submittedAt}\nStatus: ${receiptStatus(receipt.kind)}\n\nThis records a submitted request. It is not a payment confirmation, invoice or live project-status report.\nFor an update, quote your reference to skwebstudio18@gmail.com or +91 98404 07296.\n`;
}
