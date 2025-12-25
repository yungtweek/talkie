import React, { ReactNode } from 'react';
import { IBM_Plex_Sans_KR } from 'next/font/google';

import '@/app/globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { clsx } from 'clsx';
import { Toaster } from 'sonner';

const ibmPlexKr = IBM_Plex_Sans_KR({
  variable: '--font-ibm-plex-kr',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function TalkieLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={clsx(
          ibmPlexKr.variable,
          'min-h-screen bg-background text-foreground antialiased',
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right"/>
        </ThemeProvider>
      </body>
    </html>
  );
}
