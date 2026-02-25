const CACHE_VERSION = "v15"
const STATIC_CACHE = `ghesta-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `ghesta-dynamic-${CACHE_VERSION}`

// فایل‌های استاتیک
const STATIC_ASSETS = ["/", "/auth", "/manifest.json", "/icon-192.png", "/icon-512.png"]

// ========================================
// 📥 نصب Service Worker
// ========================================
self.addEventListener("install", (event) => {
  console.log("[SW] Installing version", CACHE_VERSION)

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Caching static assets")
      return cache.addAll(STATIC_ASSETS)
    }),
  )

  self.skipWaiting()
})

// ========================================
// 🔄 فعال‌سازی و پاکسازی کش‌های قدیمی
// ========================================
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating version", CACHE_VERSION)

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("[SW] Deleting old cache:", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "SW_UPDATED",
              version: CACHE_VERSION,
            })
          })
        })
      }),
  )

  return self.clients.claim()
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("[SW] Skip waiting requested")
    self.skipWaiting()
  }

  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_VERSION })
  }

  if (event.data && event.data.type === "CLEAR_ALL_CACHES") {
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      })
      .then(() => {
        event.ports[0].postMessage({ cleared: true })
      })
  }
})

// ========================================
// 🌐 مدیریت درخواست‌ها
// ========================================
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // نادیده گرفتن درخواست‌های خارجی
  if (!url.origin.includes(self.location.origin) && !url.origin.includes("supabase.co")) {
    return
  }

  // نادیده گرفتن auth requests
  if (url.pathname.includes("/auth/v1/")) {
    return
  }

  // درخواست‌های API و Supabase
  if (url.pathname.startsWith("/api/") || url.origin.includes("supabase.co")) {
    if (request.method !== "GET") {
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(JSON.stringify({ error: "Offline - Write operation failed" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        }),
      )
      return
    }

    // Network First برای GET
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) {
              return cached
            }
            return new Response(JSON.stringify({ error: "Offline - No cached data" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          })
        }),
    )
    return
  }

  // Cache First برای فایل‌های استاتیک
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && request.method === "GET") {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          if (request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/")
          }
          return new Response("Network error", { status: 408 })
        })
    }),
  )
})

// ========================================
// 🔔 دریافت Push Notification
// ========================================
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received")

  if (!event.data) {
    console.log("[SW] No data in push event")
    return
  }

  try {
    const data = event.data.json()
    console.log("[SW] Push data:", data)

    const options = {
      body: data.body || "یک قسط سررسید شده است",
      icon: "/icon-192.jpg",
      badge: "/icon-192.jpg",
      data: { url: data.url || "/" },
      vibrate: [200, 100, 200],
      tag: "installment-reminder",
      requireInteraction: true, // نوتیف تا کلیک نشود بسته نمیشه
      actions: [{ action: "open", title: "مشاهده" }],
    }

    event.waitUntil(self.registration.showNotification(data.title || "یادآوری قسط", options))
  } catch (error) {
    console.error("[SW] Error processing push:", error)
  }
})

// ========================================
// 👆 کلیک روی نوتیفیکیشن
// ========================================
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action)

  event.notification.close()

  if (event.action === "close") {
    return
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data?.url || "/"

      // اگر تب باز بود، فوکوس کن
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus()
        }
      }

      // اگر تب باز نبود، تب جدید باز کن
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    }),
  )
})

// ========================================
// 🔄 همگام‌سازی پس‌زمینه
// ========================================
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync:", event.tag)

  if (event.tag === "sync-installments") {
    event.waitUntil(syncInstallments())
  }
})

async function syncInstallments() {
  try {
    console.log("[SW] Syncing installments in background...")
    // این توسط کد اصلی مدیریت میشه
    return true
  } catch (error) {
    console.error("[SW] Sync failed:", error)
    throw error
  }
}
