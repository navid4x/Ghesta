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
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co")) {  // یا دقیق‌تر: url.hostname.endsWith(".supabase.co")

  event.respondWith(
    fetch(request)
      .then((response) => {
        // فقط پاسخ‌های موفق GET رو کش کن (POST و بقیه کش نشن)
        if (request.method === "GET" && response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
            console.log("[SW] Cached API response:", request.url);
          });
        }
        return response;
      })
      .catch(async () => {
        // آفلاین یا خطای شبکه
        console.log("[SW] Offline/Network failed → fallback to cache:", request.url);

        // اول سعی کن از کش بگیر (فقط اگر قبلاً کش شده باشه، حتی برای GET)
        const cached = await caches.match(request);
        if (cached) {
          console.log("[SW] Served from cache:", request.url);
          return cached;
        }

        // اگر در کش نبود: یک Response معتبر برگردون (بدون کرش!)
        // برای APIها معمولاً JSON برمی‌گردونیم
        return new Response(
          JSON.stringify({ 
            error: "اتصال اینترنت برقرار نیست.", 
            message: "لطفاً اتصال خود را چک کنید و دوباره تلاش کنید." 
          }),
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: { 
              "Content-Type": "application/json; charset=utf-8" 
            },
          }
        );
      })
  );

  return;  // مهم: جلوگیری از اجرای بقیه کدهای fetch listener برای این درخواست‌ها
}

event.respondWith(
  (async () => {
    const isOnline = navigator.onLine;

    // فقط GETها رو با استراتژی Network First + Cache Fallback مدیریت کن
    if (request.method === 'GET') {
      // اگر آنلاین هستیم: اول شبکه
      if (isOnline) {
        try {
          const response = await fetch(request);

          // اگر پاسخ معتبر بود، کش کن
          if (response && request.method === "GET"  response.status === 200) {
            const responseClone = response.clone();
            const cache = await caches.open(DYNAMIC_CACHE);
            await cache.put(request, responseClone);
            console.log("[SW] Cached:", request.url);
          }

          return response;
        } catch (err) {
          // شبکه شکست → آفلاین محسوب شو و به کش برو
          console.log("[SW] Network failed → fallback to cache:", request.url);
        }
      }

      // اینجا یا آفلاین هستیم یا شبکه شکست خورده
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log("[SW] Served from cache:", request.url);
        return cachedResponse;
      }

      // اگر در کش هم نبود → یک Response ساده و بی‌خطر برگردون (بدون خطا!)
      if (request.headers.get("accept")?.includes("text/html")) {
        // برای صفحات HTML، صفحه اصلی رو برگردون اگر کش شده باشه
        const fallback = await caches.match("/");
        if (fallback) return fallback;
      }

      // آخرین راه: پاسخ خالی اما معتبر (هیچ خطایی در کنسول نمی‌ده)
      return new Response("", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain" }
      });
    }

    // برای همه درخواست‌های غیر GET (POST, PUT, DELETE و ...)
    else {
      if (isOnline) {
        try {
          return await fetch(request);
        } catch (err) {
          // شبکه شکست → آفلاین
        }
      }

      // آفلاین + غیر GET → پاسخ معتبر (برای جلوگیری از کرش)
      return new Response(
        JSON.stringify({ error: "اتصال اینترنت برقرار نیست." }),
        {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  })()
);
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
