import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { InstallBanner } from "@/components/install-banner";
import { Toaster } from "@/components/toaster";

export const metadata: Metadata = {
  title: { default: "FindEkifo — Find your space in Uganda", template: "%s · FindEkifo" },
  description: "Hostels, arcade stalls, rentals and flexi-stays across Uganda. Verified landlords, no viewing fees, Mobile Money deposits held in escrow.",
  applicationName: "FindEkifo",
  appleWebApp: { capable: true, title: "FindEkifo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-UG">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-dvh antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
            <p>© {new Date().getFullYear()} FindEkifo · Find your space in Uganda</p>
            <p>All prices in Uganda Shillings · Deposits held in escrow until move-in</p>
          </div>
        </footer>
        <InstallBanner />
        <Toaster />
      </body>
    </html>
  );
}
