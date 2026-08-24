import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MCCIA Media Monitor | Prashant Girbane Archive',
  description: 'A filterable public-source archive of news, images, video and documents concerning MCCIA Director General Prashant Girbane.',
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
