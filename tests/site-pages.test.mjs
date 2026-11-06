import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderSitePages,publicPages,pageAliases,renderPageAlias} from '../tools/site-pages.mjs';
import {legacyDestination} from '../SKTS-netlify/site-navigation.mjs';

const template=await readFile(new URL('../src/site/template.html',import.meta.url),'utf8');
const serviceDetails=await readFile(new URL('../src/site/service-details.html',import.meta.url),'utf8');
const pages=renderSitePages(template,{serviceDetails});

test('public pages have distinct content, one main heading and unique IDs',()=>{
  assert.equal(pages.size,6);
  for(const [path,html] of pages){
    assert.equal((html.match(/<h1\b/g)??[]).length,1,path);
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(ids.length,new Set(ids).size,path);
    for(const [,label] of html.matchAll(/aria-labelledby="([^"]+)"/g))for(const id of label.split(' '))assert.ok(ids.includes(id),path+': '+id);
    assert.match(html,/<main id="public-main" tabindex="-1">/);
    assert.match(html,/class="skip" href="#public-main"/);
    assert.ok(html.includes('rel="canonical" href="https://lighthearted-shortbread-30a0d3.netlify.app'+path+'"'));
  }
  assert.ok(!pages.get('/').includes('id="service-grid"'));
  assert.ok(!pages.get('/').includes('id="payments"'));
  assert.ok(pages.get('/').includes('id="company"'));
  assert.ok(pages.get('/').includes('id="approach"'));
  assert.ok(pages.get('/').includes('id="home-work-title"'));
  assert.ok(pages.get('/').includes('Bhavani Group of Institutions India Pvt Ltd'));
  assert.ok(pages.get('/about/').includes('id="company"'));
  assert.ok(pages.get('/about/').includes('id="work"'));
  assert.ok(!pages.has('/company/')&&!pages.has('/work/'));
  assert.ok(pages.get('/services/').includes('id="service-grid"'));
  assert.ok(pages.get('/services/').includes('id="faq-title"'));
  assert.ok(pages.get('/payments/').includes('id="upi-id"'));
  assert.ok(pages.get('/references/').includes('id="request-history-list"'));
});

test('all pages retain the same enquiry and payment form contracts',()=>{
  for(const [path,html] of pages){
    for(const name of ['service-request','project-enquiry','payment-reference'])assert.ok(html.includes('name="'+name+'" method="POST" action="/thank-you" data-netlify="true"'),path+': '+name);
    assert.equal((html.match(/netlify-honeypot="bot-field"/g)??[]).length,3,path);
    assert.ok(html.includes('id="cart-dialog"'));
    assert.equal(html.includes('id="quote-dialog"'),path!=='/contact/');
    assert.equal((html.match(/<form id="quote-form"/g)??[]).length,1);
  }
  assert.match(pages.get('/contact/'),/<section id="contact-enquiry"[\s\S]*?<form id="quote-form"/);
});

test('navigation identifies the current page and all local links resolve',()=>{
  for(const [path,html] of pages){
    if(['payments','references'].some(key=>path.includes(key)))assert.equal((html.match(/aria-current="page"/g)??[]).length,0);
    else assert.ok(html.includes('href="'+path+'" aria-current="page"'));
    for(const [,href] of html.matchAll(/href="(\/[^"]*)"/g)){
      const url=new URL(href,'https://example.test');
      const target=pages.get(url.pathname);
      if(target&&url.hash)assert.ok(target.includes('id="'+url.hash.slice(1)+'"'),path+': '+href);
      if(!url.pathname.includes('.')&&!url.pathname.startsWith('/portal')&&url.pathname!=='/privacy')assert.ok(target||url.pathname==='/privacy/',path+': '+href);
    }
  }
  assert.ok(pages.get('/').includes('href="/services/?category=design#packages"'));
});

test('old root section bookmarks redirect only to known public destinations',()=>{
  for(const hash of ['#services','#packages','#contact','#company','#work','#payments','#request-history','#approach'])assert.ok(legacyDestination('/',hash));
  assert.equal(legacyDestination('/','#packages'),'/services/#packages');
  assert.equal(legacyDestination('/index.html','#work'),'/about/#work');
  assert.equal(legacyDestination('/','#company'),'/about/#company');
  assert.equal(legacyDestination('/','#approach'),'/about/#approach');
  assert.equal(legacyDestination('/portal/','#contact'),null);
  assert.equal(legacyDestination('/services/','#packages'),null);
  assert.equal(legacyDestination('/','#invite_token=private'),null);
  assert.equal(legacyDestination('/','#home'),null);
});

test('previous Company and Work pages lead to their matching combined sections',()=>{
  assert.equal(pageAliases.get('/company/'),'/about/#company');
  assert.equal(pageAliases.get('/work/'),'/about/#work');
  for(const destination of pageAliases.values()){
    const html=renderPageAlias(destination);
    assert.ok(html.includes('content="0;url='+destination+'"'));
    assert.ok(html.includes('rel="canonical" href="https://lighthearted-shortbread-30a0d3.netlify.app/about/"'));
    assert.ok(!html.includes('<form'));
    assert.ok(pages.get('/about/').includes('id="'+destination.split('#')[1]+'"'));
  }
  assert.throws(()=>renderPageAlias('https://example.test'),/Unknown public page alias/);
});

test('page composition fails clearly if the template structure changes',()=>{
  assert.throws(()=>renderSitePages(template.replace('id="payments"','id="unexpected"')),/sections changed/);
  assert.equal(new Set(publicPages.map(p=>p.title)).size,publicPages.length);
});
