'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/trainers', label: 'Trainers' },
  { href: '/admin/programs', label: 'Programs' },
  { href: '/admin/certificates', label: 'Certificates' },
  { href: '/admin/templates', label: 'Templates' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <header className="nav">
        <span className="nav-brand">QRCertificate</span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname?.startsWith(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
        <button onClick={handleLogout} className="btn btn-secondary" style={{ marginLeft: 'var(--space-4)' }}>
          Log out
        </button>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
