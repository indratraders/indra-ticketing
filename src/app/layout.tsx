import type { Metadata } from "next";
import { DM_Sans, Libre_Franklin } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const displayFont = Libre_Franklin({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Indra Traders | Test Drive Tokens",
  description:
    "Test Drive Token Ticketing and Queue Management System for Indra Traders (PVT) LTD",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
