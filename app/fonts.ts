import localFont from "next/font/local";

// Self-hosted (no Google Fonts request): faster first paint on mobile data, works offline in the PWA,
// and next/font sizes the fallback so text doesn't jump when the real font arrives.

/** Display: headlines, prices and big numbers. Roboto variable (weight + width axes). */
export const display = localFont({
  src: "./fonts/roboto.woff2",
  variable: "--font-display-face",
  weight: "100 900",
  display: "swap",
  preload: true,
  fallback: ["Roboto", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
});

/** Text: everything else. Inter variable — very legible at small sizes on low-end screens. */
export const text = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-text-face",
  weight: "100 900",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
});
