import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'QRCertificate',
  description: 'QR-Verified Training Certificate Generation Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers() here — even without using the value — is what tells
  // Next.js to switch this render into per-request nonce mode and stamp the
  // CSP nonce (generated in middleware.ts) onto the <script> tags IT emits
  // (webpack runtime, page chunks, hydration data). Without this line, none
  // of Next's own scripts carry the nonce, so the production CSP's
  // 'strict-dynamic' (which disables host-based allowlisting) blocks every
  // script on the page — this broke the entire app, not just one page. See
  // SECURITY.md.
  headers();

  return (
    <html lang="en" className={archivo.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
