import { createClient } from "@/lib/supabase/client"
import { getConnectionStatus } from "@/lib/connection-state"

export interface AuthUser {
  id: string
  email: string
  created_at: string
}

// ============================================
// 🔐 LOGIN OR SIGNUP - ورود یا ثبت‌نام خودکار
// ============================================
export async function loginOrSignup(
  email: string,
  password: string,
): Promise<{
  user: AuthUser | null
  error: string | null
  isOnline: boolean
  action: "login" | "signup" | "offline"
}> {
  // 1️⃣ اگر آنلاین بود → سعی کن Login کنه
  if (getConnectionStatus()) {
    try {
      const supabase = createClient()

      // اول سعی می‌کنیم Login کنیم
      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      // اگه یوزر وجود نداشت (خطای Invalid credentials) → SignUp می‌کنیم
      if (error && error.message.includes("Invalid")) {
        console.log("[Auth] کاربر وجود نداره → ثبت‌نام می‌کنیم")

        const signupResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              email_confirm: false, // بدون تایید ایمیل
            },
          },
        })

        // @ts-ignore
        data = signupResult.data
        error = signupResult.error

        if (!error && data.user) {
          const user: AuthUser = {
            id: data.user.id,
            email: data.user.email!,
            created_at: data.user.created_at,
          }

          // ذخیره Session
          if (data.session) {
            await saveSession(data.session.access_token, data.session.refresh_token)
          }

          saveUserToLocal(user)
          clearPendingSync()

          console.log("[Auth] ✅ ثبت‌نام آنلاین موفق")
          return { user, error: null, isOnline: true, action: "signup" }
        }
      }

      // اگه Login موفق بود
      if (!error && data.user) {
        const user: AuthUser = {
          id: data.user.id,
          email: data.user.email!,
          created_at: data.user.created_at,
        }

        // ذخیره Session
        if (data.session) {
          await saveSession(data.session.access_token, data.session.refresh_token)
        }

        saveUserToLocal(user)

        // سینک دیتای آفلاین
        await syncOfflineData(user.id)
        clearPendingSync()

        console.log("[Auth] ✅ ورود آنلاین موفق")
        return { user, error: null, isOnline: true, action: "login" }
      }

      // اگه خطای دیگه‌ای بود
      if (error) {
        throw error
      }
    } catch (error: any) {
      console.error("[Auth] خطا در آنلاین:", error.message)

      // اگه خطای اینترنت بود → برو حالت آفلاین
      if (error.message.includes("fetch") || error.message.includes("network")) {
        // ادامه به حالت آفلاین
      } else {
        return {
          user: null,
          error: error.message || "خطا در ورود",
          isOnline: true,
          action: "login",
        }
      }
    }
  }

  // 2️⃣ حالت آفلاین
  console.log("[Auth] حالت آفلاین")

  const storedUser = getStoredUser()

  // اگه قبلاً این یوزر رو داشتیم → Login آفلاین
  if (storedUser && storedUser.email === email && (await verifyOfflinePassword(password))) {
    console.log("[Auth] 📱 ورود آفلاین موفق")
    return { user: storedUser, error: null, isOnline: false, action: "login" }
  }

  // اگه یوزر جدیده → SignUp آفلاین
  const newUser = await createOfflineUser(email, password)
  saveUserToLocal(newUser)
  markForSync({ email, password })

  console.log("[Auth] 📱 ثبت‌نام آفلاین موفق")
  return { user: newUser, error: null, isOnline: false, action: "signup" }
}

// ============================================
// 🚪 LOGOUT
// ============================================
export async function logout(): Promise<void> {
  if (getConnectionStatus()) {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error("[Auth] خطا در خروج:", error)
    }
  }

  // پاک کردن همه چیز
 // localStorage.removeItem("auth_user")
 // localStorage.removeItem("password_hash")
 // localStorage.removeItem("session_token")
 // localStorage.removeItem("refresh_token")
  localStorage.clear();
  console.log("[Auth] 🚪 خروج موفق")
}

// ============================================
// 👤 GET CURRENT USER
// ============================================
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (getConnectionStatus()) {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const authUser: AuthUser = {
          id: user.id,
          email: user.email!,
          created_at: user.created_at,
        }

        saveUserToLocal(authUser)
        return authUser
      }
    } catch (error) {
      console.error("[Auth] خطا در دریافت کاربر:", error)
    }
  }

  return getStoredUser()
}



// ============================================
// 🔄 SYNC OFFLINE DATA
// ============================================
async function syncOfflineData(onlineUserId: string): Promise<void> {
  try {
    const storedUser = getStoredUser()
    if (!storedUser) return

    const offlineKey = `installments-${storedUser.id}`
    const offlineData = localStorage.getItem(offlineKey)

    if (offlineData && storedUser.id !== onlineUserId) {
      const installments = JSON.parse(offlineData)

      // آپدیت user_id همه اقساط
      const updatedInstallments = installments.map((inst: any) => ({
        ...inst,
        user_id: onlineUserId,
        id: inst.id.startsWith("offline_")
          ? `${onlineUserId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          : inst.id,
      }))

      const onlineKey = `installments-${onlineUserId}`
      localStorage.setItem(onlineKey, JSON.stringify(updatedInstallments))
      localStorage.removeItem(offlineKey)

      if (typeof window !== "undefined") {
        const syncQueue = localStorage.getItem("sync_queue")
        const queue = syncQueue ? JSON.parse(syncQueue) : []

        updatedInstallments.forEach((inst: any) => {
          queue.push({
            id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: "create",
            entityType: "installment",
            data: inst,
            timestamp: new Date().toISOString(),
          })
        })

        localStorage.setItem("sync_queue", JSON.stringify(queue))
      }

      console.log("[Sync] ✅ اقساط با user_id جدید همگام‌سازی شدند")
    }
  } catch (error) {
    console.error("[Sync] خطا در همگام‌سازی اقساط:", error)
  }
}

// ============================================
// 🔧 HELPER FUNCTIONS
// ============================================

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function createOfflineUser(email: string, password: string): Promise<AuthUser> {
  const user: AuthUser = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email,
    created_at: new Date().toISOString(),
  }

  // ذخیره hash پسورد
  const hash = await hashPassword(password)
  localStorage.setItem("password_hash", hash)

  return user
}

function saveUserToLocal(user: AuthUser): void {
  localStorage.setItem("auth_user", JSON.stringify(user))
}

function getStoredUser(): AuthUser | null {
  const stored = localStorage.getItem("auth_user")
  return stored ? JSON.parse(stored) : null
}

async function verifyOfflinePassword(password: string): Promise<boolean> {
  const storedHash = localStorage.getItem("password_hash")
  if (!storedHash) return false

  const inputHash = await hashPassword(password)
  return inputHash === storedHash
}

async function saveSession(accessToken: string, refreshToken: string): Promise<void> {
  localStorage.setItem("session_token", accessToken)
  localStorage.setItem("refresh_token", refreshToken)
}

function markForSync(credentials: { email: string; password: string }): void {
  localStorage.setItem("pending_auth", JSON.stringify(credentials))
}

function clearPendingSync(): void {
  localStorage.removeItem("pending_auth")
}


