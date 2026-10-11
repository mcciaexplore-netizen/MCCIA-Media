export type Role='Administrator'|'Reviewer'|'Editor'|'Viewer';
export type Identity={name:string;role:Role;id:string};
// No sign-in: the local editor always acts as the machine's owner. The editor itself only runs in development on loopback.
export async function identity(request?:Request):Promise<Identity>{void request;return {id:'local-owner',name:process.env.USERNAME||'Local owner',role:'Administrator'}}
