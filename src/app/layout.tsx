import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sales Form",
  description: "Sales Form for Submit Data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative min-h-screen`}
      >
        {children}
        <div className="fixed bottom-4 right-4 flex flex-col items-end gap-1 px-3 py-1.5 rounded-lg text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-pulse"></span>
              <span className="text-gray-500/70">BETA</span>
            </div>
            <span className="text-gray-400/30">|</span>
            <span className="text-gray-500/50">DEMO20250225_VER</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-ping"></span>
            <span className="text-gray-500/50">vallian|framework</span>
          </div>
        </div>
      </body>
    </html>
  );
}
