import type React from "react"
import type { Metadata, Viewport } from "next"
import { Vazirmatn } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster"
import { ServiceWorkerRegistration } from "@/components/service-worker-registration"
import "./globals.css"

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "تقویم شمسی - مدیریت رویدادها",
  description: "تقویم شمسی با امکان ثبت رویداد، یادآوری و نمایش تعطیلات رسمی ایران",
  generator: "v0.app",
  manifest: "/manifest.json",
  icons: {
    icon: [
      {
        url: "/icon-192.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        url: "/icon-512.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
    apple: "/icon-192.jpg",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#2563eb",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className={`${vazirmatn.className} font-sans antialiased`}>
        <ServiceWorkerRegistration />
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
