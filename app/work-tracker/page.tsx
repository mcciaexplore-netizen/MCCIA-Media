import {notFound} from 'next/navigation';
import WorkTracker from './WorkTracker';
export const metadata={title:'MCCIA | Editorial work tracker'};
export const dynamic='force-dynamic';
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <WorkTracker/>}
