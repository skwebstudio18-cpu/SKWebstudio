const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
let referenceHelpers;
test.before(async () => { referenceHelpers = await import('../SKTS-netlify/request-references.mjs'); });

// Isolate the actual form controller from the page's service-card rendering.
const app = fs.readFileSync(path.join(__dirname, '../SKTS-netlify/app.js'), 'utf8');
const controller = app.slice(app.indexOf('function updateRequestFields(){'));

function setup({ id = 'quote-form', hostname = 'example.netlify.app', ok = true, fetcher, cart = ['website'], receiptFailure = false } = {}) {
  const fields = { 'form-name': id === 'quote-form' ? 'project-enquiry' : id === 'payment-form' ? 'payment-reference' : 'service-request', name: 'Local & QA', email: 'qa@example.com', brief: 'Verify the request flow.', consent: 'Agreed', 'bot-field': '' };
  const status = { hidden: true, dataset: {}, focus() {} };
  const receiptPanel = { hidden: true };
  const button = { textContent: 'Send enquiry', disabled: false };
  const elements = { services: { value: '' }, 'estimated-total': { value: '' }, subject: { value: '' }, 'request-reference': { value: '' }, 'submission-reference': { value: '' }, 'project-reference': { value: 'SKTS-20261101-0123456789ABCDEF' }, 'transaction-reference': { value: 'QA-REFERENCE-ONLY' }, amount: { value: '1.00' }, namedItem(name) { return this[name]; } };
  const form = {
    id, fields, dataset: {}, elements, attributes: {}, resetCount: 0,
    reportValidity: () => true,
    querySelector: selector => selector === '.form-status' ? status : selector === '[data-receipt]' ? receiptPanel : button,
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    reset() { this.resetCount++; this.fields.name = ''; this.elements['request-reference'].value = ''; this.elements['submission-reference'].value = ''; },
    addEventListener() {},
  };
  const requests = [];
  let saved = 0;
  let totalCleared = false;
  const receipts = [];
  const context = vm.createContext({
    location: { hostname, protocol: 'https:' }, URLSearchParams, AbortController, setTimeout, clearTimeout,
    FormData: class {
      constructor(target) {
        const entries = Object.entries(target.fields);
        if (target.id === 'checkout-form') entries.push(['services', target.elements.services.value], ['estimated-total', target.elements['estimated-total'].value]);
        entries.push(['subject', target.elements.subject.value]);
        if (target.id === 'payment-form') {
          for (const key of ['submission-reference', 'project-reference', 'transaction-reference', 'amount']) entries.push([key, target.elements[key].value]);
        } else entries.push(['request-reference', target.elements['request-reference'].value]);
        return new Map(entries);
      }
    },
    cart: [...cart], services: [{ id: 'website', name: 'Website development', price: 14999 }],
    money: value => `INR ${value}`, total: () => 14999, notify() {}, save() { saved++; },
    createReference: kind => referenceHelpers.createReference(kind, webcrypto), receiptLabel: kind => referenceHelpers.receiptLabel(kind),
    recordSubmission(form, reference) { if (receiptFailure) throw new Error('Receipt storage/display unavailable'); receipts.push({ reference, kind: form.id }); },
    $: selector => selector === '#checkout-total' ? { replaceChildren() { totalCleared = true; } } : form,
    fetch: async (...args) => { requests.push(args); return fetcher ? fetcher(...args) : { ok }; },
  });
  vm.runInContext(controller, context);
  const send = () => context.sendEnquiry({ preventDefault() {}, currentTarget: form });
  return { send, context, form, status, button, receiptPanel, requests, receipts, saved: () => saved, totalCleared: () => totalCleared };
}

test('static local preview checks availability but never posts or falsely reports success', async () => {
  for (const hostname of ['localhost', '127.0.0.1', 'qa.localhost']) {
    const run = setup({ hostname });
    await run.send();
    assert.equal(run.requests.length, 1);
    assert.equal(run.requests[0][0], '/api/local/config');
    assert.ok(!run.requests.some(([,options])=>options.method==='POST'));
    assert.equal(run.form.fields.name, 'Local & QA');
    assert.equal(run.status.dataset.state, 'error');
    assert.match(run.status.textContent, /details have not been sent/);
  }
});

test('local backend receives submissions only after capability and CSRF checks',async()=>{
  const run=setup({hostname:'localhost',fetcher:async(url)=>url==='/api/local/config'?{ok:true,json:async()=>({local:true,ready:true,csrf:'local-csrf'})}:{ok:true}});
  await run.send();
  assert.equal(run.requests[1][0],'/api/local/intake');
  assert.equal(run.requests[1][1].headers['X-SKTS-CSRF'],'local-csrf');
  assert.equal(run.form.resetCount,1);
  assert.match(run.status.textContent,/Saved to this computer/);
  assert.match(run.status.textContent,/No email notification/);
});

test('a repeated local submission during backend detection cannot create two records',async()=>{
  let release;
  const capability=new Promise(resolve=>{release=resolve;});
  const run=setup({hostname:'localhost',fetcher:async(url)=>url==='/api/local/config'?capability:{ok:true}});
  const first=run.send();await run.send();assert.equal(run.requests.length,1);
  release({ok:true,json:async()=>({local:true,ready:true,csrf:'local-csrf'})});await first;
  assert.equal(run.requests.filter(([,options])=>options.method==='POST').length,1);
});

test('HTTP rejection preserves entered details and restores submit controls', async () => {
  const run = setup({ ok: false });
  run.receiptPanel.hidden = false;
  await run.send();
  assert.equal(run.form.resetCount, 0);
  assert.equal(run.form.fields.name, 'Local & QA');
  assert.match(run.status.textContent, /could not be sent/);
  assert.equal(run.button.disabled, false);
  assert.equal(run.form.dataset.submitting, 'false');
  assert.equal(run.form.attributes['aria-busy'], undefined);
  assert.equal(run.receiptPanel.hidden, true);
});

test('network failure preserves the service shortlist', async () => {
  const run = setup({ id: 'checkout-form', fetcher: () => Promise.reject(new TypeError('offline')) });
  await run.send();
  assert.equal(run.context.cart.length, 1);
  assert.equal(run.form.resetCount, 0);
  assert.equal(run.saved(), 0);
  assert.match(run.status.textContent, /could not be sent/);
});

test('successful request uses URL encoding and clears details only after acceptance', async () => {
  const run = setup({ id: 'checkout-form' });
  await run.send();
  const [url, options] = run.requests[0];
  assert.equal(url, '/');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(options.body).get('name'), 'Local & QA');
  assert.equal(new URLSearchParams(options.body).get('form-name'), 'service-request');
  assert.match(new URLSearchParams(options.body).get('services'), /Website development: INR 14999/);
  assert.match(new URLSearchParams(options.body).get('estimated-total'), /final quote required/);
  assert.equal(run.form.resetCount, 1);
  assert.equal(run.context.cart.length, 0);
  assert.equal(run.saved(), 1);
  assert.equal(run.totalCleared(), true);
  assert.match(run.status.textContent, /request has been received/);
});

test('a second submit while a request is pending cannot create a duplicate request', async () => {
  let release;
  const pendingResponse = new Promise(resolve => { release = resolve; });
  const run = setup({ fetcher: () => pendingResponse });
  const first = run.send();
  assert.equal(run.button.disabled, true);
  await run.send();
  assert.equal(run.requests.length, 1);
  release({ ok: true });
  await first;
  assert.equal(run.form.resetCount, 1);
});

test('an empty shortlist cannot be submitted as a service request', async () => {
  const run = setup({ id: 'checkout-form', cart: [] });
  await run.send();
  assert.equal(run.requests.length, 0);
  assert.match(run.status.textContent, /at least one service/);
});

test('a failed attempt has no receipt and reuses its reference on retry', async () => {
  let attempt = 0;
  const run = setup({ fetcher: () => ({ ok: ++attempt > 1 }) });
  await run.send();
  const first = new URLSearchParams(run.requests[0][1].body).get('request-reference');
  assert.match(first, /^SKTS-\d{8}-[A-F0-9]{16}$/);
  assert.equal(run.receipts.length, 0);
  await run.send();
  const retry = new URLSearchParams(run.requests[1][1].body);
  assert.equal(retry.get('request-reference'), first);
  assert.match(retry.get('subject'), new RegExp(first));
  assert.equal(run.receipts.length, 1);
  assert.match(run.status.textContent, new RegExp(first));
});

test('payment details are linked to the project but never marked verified', async () => {
  const run = setup({ id: 'payment-form' });
  await run.send();
  const body = new URLSearchParams(run.requests[0][1].body);
  assert.equal(body.get('form-name'), 'payment-reference');
  assert.equal(body.get('project-reference'), 'SKTS-20261101-0123456789ABCDEF');
  assert.equal(body.get('transaction-reference'), 'QA-REFERENCE-ONLY');
  assert.equal(body.get('amount'), '1.00');
  assert.match(body.get('submission-reference'), /^SKTS-PAY-\d{8}-[A-F0-9]{16}$/);
  assert.equal(body.has('payment-status'), false);
  assert.match(run.status.textContent, /awaiting manual verification/);
  assert.equal(run.receipts.length, 1);
});

test('invalid payment amounts or blank references are rejected before sending', async () => {
  for (const [field, value] of [['amount', '-1'], ['amount', '0.001'], ['amount', 'NaN'], ['transaction-reference', '      '], ['project-reference', '    ']]) {
    const run = setup({ id: 'payment-form' });
    run.form.elements[field].value = value;
    await run.send();
    assert.equal(run.requests.length, 0, `Rejected invalid ${field}`);
    assert.equal(run.receipts.length, 0);
    assert.equal(run.status.dataset.state, 'error');
  }
});

test('a timed-out request preserves the reference without saving a success receipt', async () => {
  const run = setup({ fetcher: () => Promise.reject({ name: 'AbortError' }) });
  await run.send();
  assert.match(run.status.textContent, /could not confirm whether/);
  assert.match(run.status.textContent, /SKTS-\d{8}-[A-F0-9]{16}/);
  assert.equal(run.form.resetCount, 0);
  assert.equal(run.receipts.length, 0);
});

test('receipt storage or display failure does not falsely report a failed submission', async () => {
  const run = setup({ receiptFailure: true });
  await run.send();
  assert.equal(run.form.resetCount, 1);
  assert.equal(run.status.dataset.state, 'success');
  assert.match(run.status.textContent, /request has been received/);
  assert.match(run.status.textContent, /SKTS-\d{8}-[A-F0-9]{16}/);
});
