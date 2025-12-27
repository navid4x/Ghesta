import type React from "react"
import type { Metadata, Viewport } from "next"
import { Vazirmatn } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster"
import Script from 'next/script';
import { ServiceWorkerRegistration } from "@/components/service-worker-registration"
import "./globals.css"

<Script
  src="https://cdn.kavenegar.com/sdk/page.js?appId=a3e32e7f-51d0-49ce-9ca2-adb60dc0a1a3"
  strategy="beforeInteractive"  // این باعث می‌شه اسکریپت زود لود بشه، مناسب برای سرویس ورکر
  defer
  charSet="utf-8"
/>
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
