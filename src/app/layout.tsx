import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';
import './setup.css';

export const metadata: Metadata = {
  title: 'FieldProof — Field-service work-order integrity',
  description: 'Prove every high-risk work order is covered by a certified, equipped technician before the truck rolls.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="pact-app-layout antialiased font-sans bg-paper-base text-ink-primary">
        {children}
      </body>
    </html>
  );
}
