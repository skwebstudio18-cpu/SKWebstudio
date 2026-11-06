import {mkdir, readFile, writeFile} from 'node:fs/promises';

const origin='https://lighthearted-shortbread-30a0d3.netlify.app';
export const publicPages=[
  {path:'/',key:'home',title:'SKTS — Technology that moves your business forward.',description:'Explore SK Technology Solutions services, our working process and current client projects. Websites, apps, design and digital business support in India.',sections:[0,1,2,4]},
  {path:'/services/',key:'services',label:'Services & Pricing',title:'Services & starting prices — SKTS',description:'Explore SKTS website development, UI/UX design, Google Business Profile, deployment, support and PWA services with starting prices.',eyebrow:'WHAT WE DO',heading:'Services built around your next step.',intro:'Compare starting prices, see what is included and find answers before you start your project.',sections:[3]},
  {path:'/about/',key:'about',label:'About & Work',title:'About SKTS & our work',description:'Learn about SK Technology Solutions, our working process and our current website, mobile app and branding engagement with Bhavani Group of Institutions India Pvt Ltd.',eyebrow:'ABOUT & WORK',heading:'Our approach. Our work.',intro:'Meet your technology partner and explore the digital experiences we are building.',sections:[4,5]},
  {path:'/contact/',key:'contact',title:'Contact SKTS — Discuss your project',description:'Contact SK Technology Solutions by phone, email or WhatsApp, or send a project enquiry.',eyebrow:'LET’S CONNECT',heading:'Tell us what you have in mind.',intro:'Have a new idea or need support with an existing project? Start a conversation with our team.',sections:[6]},
  {path:'/payments/',key:'payments',title:'GPay & UPI payment details — SKTS',description:'Find SKTS payment details for agreed quotes and submit a payment reference for manual bank verification.',eyebrow:'FOR AGREED PROJECTS',heading:'Your payment, clearly recorded.',intro:'Pay against your agreed quote, then share the transaction reference so our team can verify the receipt.',sections:[7]},
  {path:'/references/',key:'references',title:'Your submission references — SKTS',description:'Find enquiry, service request and payment submission references saved on this browser.',eyebrow:'YOUR SAVED REFERENCES',heading:'Keep the next conversation simple.',intro:'Find your saved submission references here. For project progress and verified balances, use the client portal.',sections:[8]}
];
const destinations={home:'/',services:'/services/',packages:'/services/#packages',company:'/about/#company',approach:'/about/#approach',work:'/about/#work',contact:'/contact/',payments:'/payments/','request-history':'/references/'};
export const pageAliases=new Map([['/company/','/about/#company'],['/work/','/about/#work']]);

export function renderPageAlias(destination){
  if(![...pageAliases.values()].includes(destination))throw new Error('Unknown public page alias.');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>About &amp; Work — SKTS</title><link rel="canonical" href="${origin}/about/"><meta name="robots" content="noindex, follow"><meta http-equiv="refresh" content="0;url=${destination}"></head><body><p>Company and Work are now together. <a href="${destination}">Continue to About &amp; Work</a>.</p></body></html>`;
}

export function renderSitePages(template,{serviceDetails=''}={}){
  const main=template.match(/<main>([\s\S]*?)<\/main>/);
  if(!main)throw new Error('Public site template must contain one main element.');
  const sections=main[1].match(/<section\b[\s\S]*?<\/section>/g)??[];
  const expected=['class="hero"','class="commitments container"','id="services"','id="packages"','id="company"','id="work"','id="contact"','id="payments"','id="request-history"','class="closing"'];
  if(sections.length!==expected.length||sections.some((s,i)=>!s.includes(expected[i]))||main[1].replace(/<section\b[\s\S]*?<\/section>/g,'').trim())throw new Error('Public template sections changed; update the explicit page composition.');
  const navigation=[['/','Home'],['/services/','Services &amp; Pricing'],['/about/','About &amp; Work'],['/contact/','Contact'],['/portal/client/','Client portal']];
  const quoteDialog=template.match(/<dialog id="quote-dialog"[\s\S]*?<\/form><\/dialog>/)?.[0];
  const quoteForm=quoteDialog?.match(/<form id="quote-form"[\s\S]*?<\/form>/)?.[0];
  if(!quoteForm)throw new Error('The shared enquiry form is missing.');
  return new Map(publicPages.map(page=>{
    const pageHeading=page.key==='home'?'':`<div class="page-heading"><div class="container"><p class="breadcrumbs"><a href="/">Home</a><span aria-hidden="true">/</span><span>${(page.label??(page.key==='references'?'Your references':page.key[0].toUpperCase()+page.key.slice(1))).replaceAll('&','&amp;')}</span></p><div class="eyebrow">${page.eyebrow}</div><h1 id="page-title">${page.heading}</h1><p class="page-intro">${page.intro}</p></div></div>`;
    let content=page.sections.map(i=>sections[i]).join('\n');
    if(page.key!=='home'&&page.key!=='about'){
      // Use the page heading in place of the former section introduction.
      content=content.replace(/<div class="eyebrow">[\s\S]*?<\/div><div class="section-heading">[\s\S]*?<\/div>/,'').replace(/aria-labelledby="(?:contact-title|payments-title|history-title)"/,'aria-labelledby="page-title"');
    }
    if(page.key==='home'){
      content=content.replace(/<div class="custom-banner">[\s\S]*?<\/button><\/div>/,`<div class="home-services-link"><a class="button" href="/services/">View all services &amp; pricing <i class="ti ti-arrow-right" aria-hidden="true"></i></a></div>`);
      content=content.replace('</p></div><div class="steps"', '</p><a class="text-link" href="/about/">Get to know SKTS <i class="ti ti-arrow-right" aria-hidden="true"></i></a></div><div class="steps"');
      const client=sections[5].match(/<article class="portfolio-project client-project"[\s\S]*?<\/article>/)?.[0];
      if(!client)throw new Error('The current client preview is missing.');
      content+=`<section class="section container home-work" aria-labelledby="home-work-title"><div class="eyebrow">A CURRENT CLIENT</div><div class="section-heading"><h2 id="home-work-title">Built around real businesses.</h2><p>Website, app and digital branding support brought together for one client engagement.</p></div>${client}<a class="text-link" href="/about/#work">Explore our work &amp; approach <i class="ti ti-arrow-right" aria-hidden="true"></i></a></section>`;
    }
    if(page.key==='services')content=content.replace(/(<section id="packages"[^>]*>)/,'$1<h2 class="sr-only">Service packages and starting prices</h2>')+serviceDetails;
    if(page.key==='contact'){
      content=content.replace(/<address class="contact-grid">[\s\S]*?<\/address>/,address=>`<div class="contact-layout"><div class="contact-methods"><h2>Speak with our team.</h2>${address}<p class="pricing-note">Already a client? <a href="/portal/client/">Open your client portal</a> for project progress, payments and files.</p></div><section id="contact-enquiry" class="enquiry-panel" aria-labelledby="quote-title"><h2 id="quote-title">Send a project enquiry.</h2><p>Share your idea and we will discuss the scope with you. Sending an enquiry does not place an order or process a payment.</p>${quoteForm}</section></div>`);
    }
    const closing=page.key==='home'?sections[9].replace(/<button class="button white" data-quote>[\s\S]*?<\/button>/,'<a class="button white" href="/contact/">Let’s talk about your project <i class="ti ti-arrow-right" aria-hidden="true"></i></a>'):sections[9];
    let html=template.replace(main[0],'<main id="public-main" tabindex="-1">'+pageHeading+content+closing+'</main>');
    if(page.key==='contact')html=html.replace(quoteDialog,'');
    html=html
      .replace(/<title>[\s\S]*?<\/title>/,`<title>${page.title.replaceAll('&','&amp;')}</title>`)
      .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${page.description}"><link rel="canonical" href="${origin+page.path}">`)
      .replace(/<body>/,`<body data-page="${page.key}">`)
      .replace(/<nav id="main-nav"[\s\S]*?<\/nav>/,`<nav id="main-nav" aria-label="Main navigation">${navigation.map(([href,label])=>`<a href="${href}"${href===page.path?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`)
      .replace('<div class="footer-details"><p>Built in India. Ready for what’s next.</p>','<div class="footer-details"><p>Built in India. Ready for what’s next.</p><a href="/services/">Services &amp; pricing</a><a href="/about/">About &amp; Work</a>')
      .replace('class="skip" href="#services">Skip to services','class="skip" href="#public-main">Skip to content');
    html=html.replace(/href="(?:\/)?#([^"\s]+)"/g,(match,id)=>destinations[id]?`href="${destinations[id]}"`:match);
    html=html.replace(/href="\/services\/#packages" data-category="(build|design|grow)"/g,(_,category)=>`href="/services/?category=${category}#packages" data-category="${category}"`);
    if(page.key!=='home')html=html.replace('<link rel="preload" as="image" href="/assets/hero.webp">','');
    if(page.key==='references')html=html.replace('</head>','<meta name="robots" content="noindex, nofollow"></head>');
    return [page.path,html];
  }));
}

export async function buildSitePages(){
  const [template,serviceDetails]=await Promise.all([readFile('src/site/template.html','utf8'),readFile('src/site/service-details.html','utf8')]);
  const pages=renderSitePages(template,{serviceDetails});
  for(const [path,html] of pages){const folder='SKTS-netlify'+path;await mkdir(folder,{recursive:true});await writeFile(folder+'index.html',html);}
  for(const [path,destination] of pageAliases){await mkdir('SKTS-netlify'+path,{recursive:true});await writeFile('SKTS-netlify'+path+'index.html',renderPageAlias(destination));}
  // Exact legacy routes only; auth and API routes keep their own routing.
  await writeFile('SKTS-netlify/_redirects',[...pageAliases].flatMap(([path,destination])=>[`${path.slice(0,-1)} ${destination} 301!`,`${path} ${destination} 301!`,`${path}index.html ${destination} 301!`]).join('\n')+'\n');
  const sitemapPaths=[...pages.keys(),'/privacy/'];
  await writeFile('SKTS-netlify/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+sitemapPaths.filter(p=>p!=='/references/').map(path=>`  <url><loc>${origin+path}</loc></url>`).join('\n')+'\n</urlset>\n');
  await writeFile('SKTS-netlify/robots.txt',`User-agent: *\nAllow: /\nDisallow: /portal/\nDisallow: /api/\nDisallow: /references/\nSitemap: ${origin}/sitemap.xml\n`);
  console.log('Public pages built: '+[...pages.keys()].join(', '));
}
