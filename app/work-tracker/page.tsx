import WorkTracker from './WorkTracker';
export const dynamic='force-dynamic';
// Visible to everyone, no sign-in. Editing exists only in the local development editor; everywhere else it is read-only.
export default function Page(){return <WorkTracker readOnly={process.env.NODE_ENV!=='development'}/>}
