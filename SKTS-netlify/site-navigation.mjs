const legacySections={
  services:'/services/',packages:'/services/#packages',
  company:'/company/',approach:'/company/#approach',work:'/work/',
  contact:'/contact/',payments:'/payments/','request-history':'/references/'
};
// Keep bookmarked links from the former single-page website useful.
export function legacyDestination(pathname,hash){
  if(pathname!=='/'&&pathname!=='/index.html')return null;
  return legacySections[hash.replace(/^#/,'')]??null;
}
