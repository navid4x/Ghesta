"use client"

import { useEffect } from "react"

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[v0] Service Worker registered:", registration.scope)
        })
        .catch((error) => {
          console.log("[v0] Service Worker not available")
        })

      // فقط خطاهای SW رو نمایش بده - toast آنلاین/آفلاین در page.tsx مدیریت میشه
      navigator.serviceWorker.addEventListener("message", (event) => {
        const { type } = event.data
        if (type === "OFFLINE_ERROR" || type === "CACHE_MISS") {
          // silent - در page.tsx هندل میشه
        }
      })
    }
  }, [])

  return null
}
