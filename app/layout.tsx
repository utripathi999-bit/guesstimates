import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "GuesstimateDaily — Interview Guesstimate Practice",
  description:
    "Two daily guesstimate interview questions with visual step-by-step breakdowns, streaks, and swipeable fact flashcards.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Navbar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
