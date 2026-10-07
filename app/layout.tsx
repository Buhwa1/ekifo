import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { display, text } from "./fonts";
import { SiteHeader } from "@/components/site-header";
import { InstallBanner } from "@/components/install-banner";
import { Toaster } from "@/components/toaster";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "FindEkifo — Find your space in Uganda", template: "%s · FindEkifo" },
  description: "Hostels, arcade stalls, rentals and flexi-stays across Uganda. Verified landlords, no viewing fees, Mobile Money deposits held in escrow until you move in.",
  applicationName: "FindEkifo",
  appleWebApp: { capable: true, title: "FindEkifo", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: { siteName: "FindEkifo", type: "website", locale: "en_UG" },
};

export const viewport: Viewport = {
  themeColor: "#0b1f7a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-UG" className={`${display.variable} ${text.variable}`}>
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">Skip to content</a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-16">{children}</main>
        <footer className="hidden border-t border-line bg-white md:block">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 text-sm text-muted md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-bold text-ink"><Logo className="size-6" /> FindEkifo</p>
              <p className="mt-2 max-w-xs">Rooms, stalls and flats across Uganda, listed by verified landlords. Prices in Uganda Shillings.</p>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-ink">For tenants</p>
              <p><Link href="/" className="hover:text-ink">Find a space</Link></p>
              <p><Link href="/me" className="hover:text-ink">Your bookings</Link></p>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-ink">For landlords</p>
              <p><Link href="/owner/verify" className="hover:text-ink">List your space</Link></p>
              <p><Link href="/owner" className="hover:text-ink">Landlord dashboard</Link></p>
            </div>
          </div>
        </footer>
        <InstallBanner />
        <Toaster />
      </body>
    </html>
  );
}
