export const OWNER_EMAIL='skwebstudio18@gmail.com';
export function accessFromPath(path){return /^\/portal\/admin\/?$/.test(path)?'admin':'client';}
export function workspacePath(account){return account?.admin===true?'/portal/admin/':'/portal/client/';}
export function authErrorMessage(error){
  const message=String(error?.message??'');
  if(/invalid_grant|no user found|password invalid|invalid login/i.test(message))return 'We couldn’t sign you in. Check the invited email address and your portal password.';
  if(/too many|rate.?limit|\b429\b/i.test(message))return 'There have been too many sign-in attempts. Please wait a few minutes, then try again.';
  return message||'Unable to sign in. Please try again.';
}
const icons={
  admin:'<path d="M12 3 4.5 6v5.4c0 4.2 2.8 7.6 7.5 9.6 4.7-2 7.5-5.4 7.5-9.6V6L12 3Z"/><path d="m8.8 11.9 2.1 2.1 4.4-4.6"/>',
  client:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18M8 3v4m8-4v4m-9 8 3 2 6-4"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>'
};
const icon=type=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[type]}</svg>`;
export function loginScreen(access='client'){
  const admin=access==='admin';
  const features=admin?[['01','Manage every project','Keep client services, milestones and delivery updates together.'],['02','Review with confidence','Verify payments and review project documents in one workspace.'],['03','Keep work moving','Set priorities, track balances and manage client invitations.']]:[['01','See your progress','Follow milestones, delivery dates and the next step for your project.'],['02','Stay clear on payments','See your agreed budget, verified payments and remaining balance.'],['03','Work together','Share documents, read feedback and accept completed deliveries.']];
  return `<div id="auth-screen" class="auth-layout access-layout">
  <section class="welcome access-welcome" aria-labelledby="welcome-title"><div class="access-hero-top"><span class="access-hero-icon">${icon(access)}</span><span class="access-hero-label">${admin?'SKTS CONTROL CENTRE':'THE SKTS CLIENT EXPERIENCE'}</span><span class="access-spark" aria-hidden="true">✦</span></div>
  <div class="access-hero-copy"><span class="eyebrow">${admin?'BUILT FOR THE WAY YOU WORK':'GOOD WORK. CLEARLY CONNECTED.'}</span><h1 id="welcome-title">${admin?'A clear view.<br><em>Full control.</em>':'Your project.<br><em>Beautifully clear.</em>'}</h1><p>${admin?'A dedicated workspace for the people behind every SKTS project.':'A little less chasing. A lot more clarity. Your project, payments and files, all together.'}</p></div>
  <div class="access-features">${features.map(([n,title,description])=>`<div class="access-feature"><span>${n}</span><div><h3>${title}</h3><p>${description}</p></div></div>`).join('')}</div>
  <div class="access-hero-footer"><span class="access-live-dot" aria-hidden="true"></span>${admin?'OWNER & AUTHORISED ADMIN ACCESS':'YOUR PROJECT. YOUR PRIVATE SPACE.'}<span aria-hidden="true">↗</span></div></section>
  <section class="auth-card access-card" aria-labelledby="auth-title"><nav class="access-switch" aria-label="Choose sign-in area"><a href="/portal/client/"${!admin?' aria-current="page"':''}>${icon('client')}<span>Client portal</span></a><a href="/portal/admin/"${admin?' aria-current="page"':''}>${icon('admin')}<span>Admin portal</span></a></nav>
  <div class="access-card-heading"><span class="access-badge">${icon(access)}${admin?'ADMIN ACCESS':'CLIENT ACCESS'}</span><h2 id="auth-title">${admin?'Admin sign in':'Client sign in'}</h2><p id="auth-intro">${admin?'Welcome back. Your business workspace is ready.':'Welcome back. Let’s see how your project is moving.'}</p></div>
  <div class="access-account-hint" id="access-account-hint">${admin?`<span>Owner account</span><strong>${OWNER_EMAIL}</strong>`:'<span>Invited clients</span><strong>Use the email that received your SKTS invitation.</strong>'}</div>
  <div id="auth-loading" role="status">Checking sign-in availability…</div>
  <form id="auth-form" hidden><label id="name-label" hidden>Full name<input name="name" autocomplete="name" maxlength="120"></label><label id="email-label">${admin?'Admin email address':'Client email address'}<input name="email" type="email" autocomplete="username" maxlength="254" placeholder="${admin?OWNER_EMAIL:'you@company.com'}"${admin?` value="${OWNER_EMAIL}"`:''} required></label><label id="password-label">Password<input name="password" type="password" autocomplete="current-password" minlength="1" maxlength="128" placeholder="Your portal password" required></label><label id="password-confirm-label" hidden>Confirm password<input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button id="auth-submit" type="submit"><span>Sign in to ${admin?'admin':'client'} portal</span>${icon('arrow')}</button></form>
  <div id="providers"></div><p id="auth-status" class="notice" role="status" tabindex="-1" hidden></p>
  <div class="auth-options" id="auth-options" hidden><button class="text-button" id="signup-mode">Create an account</button><button class="text-button" id="recovery-mode">Forgot password?</button><button class="text-button" id="login-mode" hidden>Back to sign in</button></div>
  <p class="access-invite-note">${admin?'Use the portal password you chose from your invitation.':'Need access? Ask SKTS to send your client invitation.'} <a href="/contact/">Contact SKTS ↗</a></p><p class="fineprint">Your account opens its authorised workspace. Read our <a href="/privacy/">privacy notice</a>.</p></section></div>`;
}
