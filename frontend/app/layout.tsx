import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { NavBar } from '@/components/NavBar';
import { Providers } from '@/components/Providers';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'MicroMart', template: '%s · MicroMart' },
  description: 'Shop electronics, accessories and more at MicroMart.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-subtle sm:flex-row sm:px-6">
              <span>© {new Date().getFullYear()} MicroMart. All rights reserved.</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
