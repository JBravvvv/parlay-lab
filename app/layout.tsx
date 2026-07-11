import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk, Unbounded } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-unbounded",
});

export const metadata: Metadata = {
  title: "Parlay Lab",
  description: "MLB betting analytics terminal — informational only, not betting advice.",
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${unbounded.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
