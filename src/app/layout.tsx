import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./floor.css";
export const metadata: Metadata = { title: "POS 2 joy · A little more joy in every service", description: "Restaurant floor planning, thoughtful queues, and effortless QR ordering." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
