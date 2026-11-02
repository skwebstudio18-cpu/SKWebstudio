import {PortalError} from '../portal/model.mjs';

// Server getUser() may return JWT claims without a confirmation timestamp.
// Resolve that missing field from Identity's authoritative account record;
// never infer verification from the email address or editable metadata.
export function verifiedUserReader({getUser,readUser}){
  return async()=>{
    const user=await getUser();
    if(!user?.id||!user.email||user.confirmedAt)return user;
    let account;
    try{account=await readUser(user.id);}
    catch{throw new PortalError(503,'Your account status could not be checked. Please try signing in again.');}
    if(account?.id!==user.id||account.email?.trim().toLowerCase()!==user.email.trim().toLowerCase())throw new PortalError(403,'Your account details have changed. Please sign in again.');
    // Keep the authenticated session's roles. Changes apply at next login or
    // token refresh; the lookup must not promote the current session early.
    return {...user,confirmedAt:account.confirmedAt};
  };
}
