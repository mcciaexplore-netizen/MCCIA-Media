import type { Metadata } from 'next';
import './globals.css';
import './theme.css';
import ThemeEffects from './ThemeEffects';

export const metadata: Metadata = {
  title: 'MCCIA Media Monitor | Prashant Girbane Archive',
  description: 'A filterable public-source archive of news, images, video and documents concerning MCCIA Director General Prashant Girbane.',
  icons: { icon: '/mccia-logo.png' },
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
    {/* eslint-disable-next-line @next/next/no-page-custom-font */}
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Outfit:wght@400;500;600;700&display=swap"/>
  </head><body>{children}<ThemeEffects/></body></html>;
}
