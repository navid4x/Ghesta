// ========================================
// 🌐 بررسی واقعی اتصال اینترنت از طریق Supabase
// ========================================

let _isOnline: boolean | null = null
let _lastCheck = 0
const CHECK_INTERVAL = 5000 // هر 10 ثانیه یه‌بار چک میکنه

/**
 * چک کردن واقعی اینترنت از طریق ping به Supabase
 * navigator.onLine قابل اعتماد نیست (مخصوصاً در ایران با اینترنت ملی)
 */
export async function checkRealConnectivity(): Promise<boolean> {
  const now = Date.now()

  // اگه تازه چک کردیم، از cache استفاده کن
  if (_isOnline !== null && now - _lastCheck < CHECK_INTERVAL) {
    return _isOnline
  }

  // اول navigator.onLine رو چک کن - اگه false بود، قطعاً آفلاینیم
  if (!navigator.onLine) {
    _isOnline = false
    _lastCheck = now
    return false
  }

  // حالا واقعاً به Supabase ping بزن
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      _isOnline = false
      _lastCheck = now
      return false
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5 ثانیه timeout

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      },
      cache: "no-store",
    })

    clearTimeout(timeout)

    _isOnline = response.ok || response.status === 404 // 404 هم یعنی سرور جواب داد
    _lastCheck = now

    return _isOnline
  } catch {
    _isOnline = false
    _lastCheck = now
    return false
  }
}

/**
 * ریست کردن cache تا چک بعدی حتماً از سرور بگیره
 */
export function resetConnectivityCache(): void {
  _isOnline = null
  _lastCheck = 0
}

/**
 * مقدار cache شده (بدون fetch جدید)
 */
export function getCachedOnlineStatus(): boolean | null {
  return _isOnline
}
