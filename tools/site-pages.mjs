import {mkdir, readFile, writeFile} from 'node:fs/promises';

const origin='https://lighthearted-shortbread-30a0d3.netlify.app';
export const publicPages=[
  {path:'/',key:'home',title:'SKTS — Technology that moves your business forward.',description:'SK Technology Solutions: website development, UI/UX design, deployment and digital business support in India.',sections:[0,1,2]},
  {path:'/services/',key:'services',title:'Services & starting prices — SKTS',description:'Explore SKTS website development, UI/UX design, Google Business Profile, deployment, support and PWA services with starting prices.',eyebrow:'WHAT WE DO',heading:'The right services for your next step.',intro:'Explore our expertise, compare starting prices and shortlist the services your business needs.',sections:[2,3]},
  {path:'/company/',key:'company',title:'Our company & approach — SKTS',description:'Meet SK Technology Solutions and learn how we plan, design, develop, launch and support digital projects.',eyebrow:'ABOUT SKTS',heading:'One partner. From idea to launch.',intro:'We bring design, development and ongoing digital support together, with a clear plan at every stage.',sections:[4]},
  {path:'/work/',key:'work',title:'Clients & featured work — SKTS',description:'Explore SKTS featured work and our current website, mobile app and digital branding engagement with Bhavani Group of Institutions India Pvt Ltd.',eyebrow:'CLIENTS & PROJECTS',heading:'Digital experiences taking shape.',intro:'A closer look at our current client engagement and the website we built for our own business.',sections:[5]},
  {path:'/contact/',key:'contact',title:'Contact SKTS — Discuss your project',description:'Contact SK Technology Solutions by phone, email or WhatsApp, or send a project enquiry.',eyebrow:'LET’S CONNECT',heading:'Tell us what you have in mind.',intro:'Have a new idea or need support with an existing project? Start a conversation with our team.',sections:[6]},
  {path:'/payments/',key:'payments',title:'GPay & UPI payment details — SKTS',description:'Find SKTS payment details for agreed quotes and submit a payment reference for manual bank verification.',eyebrow:'FOR AGREED PROJECTS',heading:'Your payment, clearly recorded.',intro:'Pay against your agreed quote, then share the transaction reference so our team can verify the receipt.',sections:[7]},
  {path:'/references/',key:'references',title:'Your submission references — SKTS',description:'Find enquiry, service request and payment submission references saved on this browser.',eyebrow:'YOUR SAVED REFERENCES',heading:'Keep the next conversation simple.',intro:'Find your saved submission references here. For project progress and verified balances, use the client portal.',sections:[8]}
];
const destinations={home:'/',services:'/services/',packages:'/services/#packages',company:'/company/',approach:'/company/#approach',work:'/work/',contact:'/contact/',payments:'/payments/','request-history':'/references/'};

export function renderSitePages(template){
  const main=template.match(/<main>([\s\S]*?)<\/main>/);
  if(!main)throw new Error('Public site template must contain one main element.');
  const sections=main[1].match(/<section\b[\s\S]*?<\/section>/g)??[];
  const expected=['class="hero"','class="commitments container"','id="services"','id="packages"','id="company"','id="work"','id="contact"','id="payments"','id="request-history"','class="closing"'];
  if(sections.length!==expected.length||sections.some((s,i)=>!s.includes(expected[i]))||main[1].replace(/<section\b[\s\S]*?<\/section>/g,'').trim())throw new Error('Public template sections changed; update the explicit page composition.');
  const navigation=[['/','Home'],['/services/','Services'],['/work/','Work'],['/company/','Company'],['/contact/','Contact'],['/portal/client/','Client portal']];
  return new Map(publicPages.map(page=>{
    const pageHeading=page.key==='home'?'':`<div class="page-heading"><div class="container"><p class="breadcrumbs"><a href="/">Home</a><span aria-hidden="true">/</span><span>${page.key==='references'?'Your references':page.key[0].toUpperCase()+page.key.slice(1)}</span></p><div class="eyebrow">${page.eyebrow}</div><h1 id="page-title">${page.heading}</h1><p class="page-intro">${page.intro}</p>${page.key==='contact'?'<button class="button page-enquiry" data-quote>Send a project enquiry <i class="ti ti-arrow-right" aria-hidden="true"></i></button>':''}</div></div>`;
    let content=page.sections.map(i=>sections[i]).join('\n');
    if(page.key!=='home'&&page.key!=='company'){
      // Use the page heading in place of the former section introduction.
      content=content.replace(/<div class="eyebrow">[\s\S]*?<\/div><div class="section-heading">[\s\S]*?<\/div>/,'').replace(/aria-labelledby="(?:contact-title|payments-title|history-title)"/,'aria-labelledby="page-title"');
    }
    if(page.key==='home'){
      content=content.replace(/<div class="custom-banner">[\s\S]*?(?=<\/div><\/section>$)/,`<div class="home-services-link"><a class="button" href="/services/">View all services &amp; pricing <i class="ti ti-arrow-right" aria-hidden="true"></i></a></div>`);
    }
    let html=template.replace(main[0],'<main id="public-main" tabindex="-1">'+pageHeading+content+sections[9]+'</main>')
      .replace(/<title>[\s\S]*?<\/title>/,`<title>${page.title.replaceAll('&','&amp;')}</title>`)
      .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${page.description}"><link rel="canonical" href="${origin+page.path}">`)
      .replace(/<body>/,`<body data-page="${page.key}">`)
      .replace(/<nav id="main-nav"[\s\S]*?<\/nav>/,`<nav id="main-nav" aria-label="Main navigation">${navigation.map(([href,label])=>`<a href="${href}"${href===page.path?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`)
      .replace('<div class="footer-details"><p>Built in India. Ready for what’s next.</p>','<div class="footer-details"><p>Built in India. Ready for what’s next.</p><a href="/services/">Services &amp; pricing</a><a href="/work/">Our work</a><a href="/company/">Company</a>')
      .replace('class="skip" href="#services">Skip to services','class="skip" href="#public-main">Skip to content');
    html=html.replace(/href="(?:\/)?#([^"\s]+)"/g,(match,id)=>destinations[id]?`href="${destinations[id]}"`:match);
    html=html.replace(/href="\/services\/#packages" data-category="(build|design|grow)"/g,(_,category)=>`href="/services/?category=${category}#packages" data-category="${category}"`);
    if(page.key!=='home')html=html.replace('<link rel="preload" as="image" href="/assets/hero.webp">','');
    if(page.key==='references')html=html.replace('</head>','<meta name="robots" content="noindex, nofollow"></head>');
    return [page.path,html];
  }));
}

export async function buildSitePages(){
  const pages=renderSitePages(await readFile('src/site/template.html','utf8'));
  for(const [path,html] of pages){const folder='SKTS-netlify'+path;await mkdir(folder,{recursive:true});await writeFile(folder+'index.html',html);}
  const sitemapPaths=[...pages.keys(),'/privacy/'];
  await writeFile('SKTS-netlify/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+sitemapPaths.filter(p=>p!=='/references/').map(path=>`  <url><loc>${origin+path}</loc></url>`).join('\n')+'\n</urlset>\n');
  await writeFile('SKTS-netlify/robots.txt',`User-agent: *\nAllow: /\nDisallow: /portal/\nDisallow: /api/\nDisallow: /references/\nSitemap: ${origin}/sitemap.xml\n`);
  console.log('Public pages built: '+[...pages.keys()].join(', '));
}
