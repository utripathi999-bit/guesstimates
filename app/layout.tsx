import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Navbar } from "@/components/Navbar";
import { ProgressProvider } from "@/components/ProgressProvider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "GuessMates — Guesstimates, with your batch",
  description:
    "Two guesstimate cases a day with an AI interviewer, step-by-step breakdowns, streaks and a batch leaderboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
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
