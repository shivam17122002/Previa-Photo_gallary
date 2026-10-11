import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Previa — your private cloud',
  description: 'A secure, private home for your files.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
