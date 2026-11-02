export class PortalError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const statuses = ['new','reviewing','quoted','in_progress','awaiting_client','completed','cancelled'];
export const referencePattern = /^SKTS-(?:PAY-)?\d{8}-[A-F0-9]{16}$/;
export function textField(value, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new PortalError(400, 'Check the required fields and their lengths.');
  }
  return value.trim();
}
export function money(value) {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new PortalError(400, 'Enter an INR amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (paise <= 0) throw new PortalError(400, 'The amount must be greater than zero.');
  return paise;
}
export function identity(user) {
  if (!user?.id || !user.email) throw new PortalError(401, 'Sign in to view your projects.');
  if (!user.confirmedAt) throw new PortalError(403, 'Confirm your email before viewing projects. If already confirmed, sign in again.');
  return { id: user.id, email: user.email.trim().toLowerCase(), admin: Array.isArray(user.roles) && user.roles.includes('admin') };
}
export function ingestRecord(data) {
  if (!data || data['bot-field']) return null;
  const kind = data['record-kind'];
  if (!['enquiry','service','payment'].includes(kind)) return null;
  const email = textField(data.email, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PortalError(400, 'Invalid submission email.');
  const reference = textField(data[kind === 'payment' ? 'submission-reference' : 'request-reference'], 80, true);
  if (!referencePattern.test(reference) || reference.includes('-PAY-') !== (kind === 'payment')) throw new PortalError(400, 'Invalid submission reference.');
  const base = { reference, kind, email, name: textField(data.name,120,true), brief: textField(data.brief ?? '',kind === 'payment' ? 2000 : 5000) };
  if (kind !== 'payment') return { ...base, phone: textField(data.phone ?? '',20), business: textField(data.business ?? '',160), services: textField(data.services ?? '',2000), indicativeTotal: textField(data['estimated-total'] ?? '',80) };
  const date = textField(data['payment-date'],10,true);
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date > today) throw new PortalError(400,'Invalid payment date.');
  return { ...base, projectReference: textField(data['project-reference'],80,true), amount: money(data.amount), transactionReference: textField(data['transaction-reference'],100,true), date };
}
function version(body) {
  if (!Number.isSafeInteger(body.version) || body.version < 1) throw new PortalError(400,'Refresh the record before updating it.');
  return body.version;
}
export function projectUpdate(body) {
  if (!statuses.includes(body.status)) throw new PortalError(400,'Choose a valid project status.');
  return { version: version(body), status: body.status, quote: body.quote === '' || body.quote == null ? null : money(body.quote), message: textField(body.message ?? '',2000), internalNote: textField(body.internalNote ?? '',2000) };
}
export function paymentUpdate(body) {
  if (!['verified','rejected'].includes(body.status) || body.bankChecked !== true) throw new PortalError(400,'Check the bank transaction and confirm the review before saving.');
  return { version: version(body), status: body.status, amount: body.status === 'verified' ? money(body.amount) : null, note: textField(body.note,2000,true) };
}
