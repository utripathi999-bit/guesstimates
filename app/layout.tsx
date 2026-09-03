import type { Metadata } from "next";
import { IBM_Plex_Sans, Nunito } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Navbar } from "@/components/Navbar";
import { ProgressProvider } from "@/components/ProgressProvider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

/**
 * Formulas and calculations were falling back to the browser's default
 * monospace, which reads as unstyled console output. IBM Plex Sans is a
 * neutral, technical sans that sits well against Nunito's rounded body text,
 * and its tabular figures keep columns of numbers aligned.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-formula",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "GuessMates — Guesstimates, with your batch",
  description:
    "Two guesstimate cases a day with an AI interviewer, step-by-step breakdowns, streaks and a batch leaderboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${plexSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>
          <ProgressProvider>
            <Navbar />
            <div className="flex-1">{children}</div>
          </ProgressProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
