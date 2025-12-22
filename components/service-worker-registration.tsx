"use client"

import { useEffect } from "react"

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[v0] Service Worker registered:", registration.scope)

          // بررسی آپدیت
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[v0] New service worker available, reload to update")
                }
              })
            }
          })
        })
        .catch((error) => {
          console.error("[v0] Service Worker registration failed:", error)
        })
    }
  }, [])

  return null
}
