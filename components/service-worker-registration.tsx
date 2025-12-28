"use client"

import { useEffect } from "react"
import { toast } from "@/hooks/use-toast"

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // وقتی اپ deploy شد روی production، این را فعال کنید
    const isProduction =
      typeof window !== "undefined" &&
      !window.location.hostname.includes("vusercontent.net") &&
      !window.location.hostname.includes("localhost")

    if (!isProduction) {
      console.log("[v0] Service Worker skipped in preview/development")
      return
    }

    if ("serviceWorker" in navigator) {
      // ثبت Service Worker
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[v0] Service Worker registered:", registration.scope)
        })
        .catch((error) => {
          // Silent fail - اپ بدون SW هم کار می‌کند
          console.log("[v0] Service Worker not available")
        })

      // گوش دادن به پیام‌های خطا از Service Worker
      navigator.serviceWorker.addEventListener("message", (event) => {
        const { type, message } = event.data

        // فقط خطاها را نمایش بده
        if (type === "OFFLINE_ERROR" || type === "CACHE_MISS") {
          toast({
            variant: "destructive",
            title: "خطا",
            description: message,
          })
        }
      })
    }

    // بررسی وضعیت آنلاین/آفلاین
    const handleOnline = () => {
      toast({
        title: "✅ اتصال برقرار شد",
        description: "اتصال اینترنت برقرار شد",
      })
    }

    const handleOffline = () => {
      toast({
        variant: "destructive",
        title: "⚠️ آفلاین",
        description: "اتصال اینترنت قطع شد. حالت آفلاین فعال است.",
      })
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Cleanup
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      // navigator.serviceWorker.removeEventListener برای message اختیاریه
      // چون component unmount شدنش معمولاً یعنی کل اپ بسته شده
    }
  }, [])

  return null
}
