// lib/connection-state.ts
// Singleton module for tracking Supabase connection status
// Used by both React hook (useSupabaseConnection) and non-React library files

let _isReachable: boolean =
  typeof navigator !== "undefined" ? navigator.onLine : true

type ConnectionListener = (isReachable: boolean) => void
const _listeners: Set<ConnectionListener> = new Set()

/**
 * Get current connection status (synchronous)
 * Use this instead of navigator.onLine everywhere
 */
export function getConnectionStatus(): boolean {
  return _isReachable
}

/**
 * Update connection status and notify listeners
 */
export function setConnectionStatus(value: boolean): void {
  if (_isReachable !== value) {
    _isReachable = value
    _listeners.forEach((listener) => listener(value))
  }
}

/**
 * Subscribe to connection status changes
 */
export function onConnectionChange(listener: ConnectionListener): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

/**
 * Async check: ping Supabase to verify real connectivity
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    console.warn("Supabase URL is not defined")
    setConnectionStatus(false)
    return false
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const reachable = response.status >= 200 && response.status < 500
    setConnectionStatus(reachable)
    return reachable
  } catch {
    clearTimeout(timeoutId)
    setConnectionStatus(false)
    return false
  }
}

// Auto-initialize in browser: listen to online/offline events and run periodic checks
if (typeof window !== "undefined") {
  // Initial check
  checkSupabaseConnection()

  // Periodic check every 30 seconds
  setInterval(checkSupabaseConnection, 30000)

  // Browser online/offline events
  window.addEventListener("online", () => {
    checkSupabaseConnection()
  })

  window.addEventListener("offline", () => {
    setConnectionStatus(false)
  })
}
