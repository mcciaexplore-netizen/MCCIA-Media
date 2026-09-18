export const dynamic='force-dynamic';
const removed=()=>Response.json({error:'Online sign-in has been removed.'},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=removed;
export const POST=removed;
