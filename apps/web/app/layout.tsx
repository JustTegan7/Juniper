import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { baseMetadata } from "../lib/seo";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });
const body = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = baseMetadata;
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F8F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1A18" },
  ],
};

// Applies a saved light/dark choice before paint, so there is no flash.
const themeScript = `try{var t=localStorage.getItem("app-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
