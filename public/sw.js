const CACHE_NAME = "ghestyar-v3"
const STATIC_CACHE = "ghestyar-static-v3"
const DYNAMIC_CACHE = "ghestyar-dynamic-v3"

// فایل‌های استاتیک که باید در نصب کش شوند
const STATIC_ASSETS = ["/", "/auth", "/manifest.json", "/icon-192.jpg", "/icon-512.jpg"]

// نصب Service Worker و کش کردن فایل‌های استاتیک
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...")
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Caching static assets")
      return cache.addAll(STATIC_ASSETS)
    }),
  )
  self.skipWaiting()
})

// فعال‌سازی و پاکسازی کش‌های قدیمی
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...")
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log("[SW] Deleting old cache:", cacheName)
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
  return self.clients.claim()
})

// مدیریت درخواست‌ها
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // نادیده گرفتن درخواست‌های خارجی (غیر از Supabase)
  if (!url.origin.includes(self.location.origin) && !url.origin.includes("supabase.co")) {
    return
  }

  // استراتژی Network First برای API و Supabase
  if (url.pathname.startsWith("/api/") || url.origin.includes("supabase.co")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // کش کردن پاسخ موفق
          if (response && response.status === 200) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // اگر آفلاین بود، از کش استفاده کن
          return caches.match(request).then((cached) => {
            if (cached) {
              console.log("[SW] Serving from cache (offline):", request.url)
              return cached
            }
            // اگر در کش نبود، یک پاسخ خطا برگردان
            return new Response(JSON.stringify({ error: "Offline - No cached data" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          })
        }),
    )
    return
  }

  // استراتژی Cache First برای فایل‌های استاتیک
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        console.log("[SW] Serving from cache:", request.url)
        return cached
      }

      return fetch(request)
        .then((response) => {
          // کش کردن فایل‌های جدید
          if (response && response.status === 200) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // برای صفحات HTML، صفحه اصلی را برگردان
          if (request.headers.get("accept").includes("text/html")) {
            return caches.match("/")
          }
        })
    }),
  )
})

// مدیریت Push Notifications
self.addEventListener("push", (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || "یک اقساط سررسید شده است",
    icon: "/icon-192.jpg",
    badge: "/icon-192.jpg",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
    tag: "installment-reminder",
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(data.title || "یادآوری قسط", options))
})

// مدیریت کلیک روی نوتیفیکیشن
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // اگر تب باز بود، فوکوس کن
      for (const client of clientList) {
        if (client.url === event.notification.data.url && "focus" in client) {
          return client.focus()
        }
      }
      // اگر تب باز نبود، تب جدید باز کن
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url)
      }
    }),
  )
})

// همگام‌سازی در پس‌زمینه
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-installments") {
    event.waitUntil(syncInstallments())
  }
})

async function syncInstallments() {
  try {
    console.log("[SW] Background sync: Syncing installments...")
    // این تابع توسط کد اصلی فراخوانی می‌شود
    return true
  } catch (error) {
    console.error("[SW] Background sync failed:", error)
    throw error
  }
}
