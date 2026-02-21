import { createClient } from "@/lib/supabase/client"
import { checkRealConnectivity, resetConnectivityCache } from "@/lib/network"

const AUTH_USER_KEY = "authenticated_user"

interface AuthUser {
  id: string
  email: string
  created_at: string
}

export function saveAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(AUTH_USER_KEY)
  return stored ? JSON.parse(stored) : null
}

export function clearAuthUser(): void {
  localStorage.removeItem(AUTH_USER_KEY)
}

// ============================================
// 👤 دریافت کاربر فعلی
// ============================================
export async function getCurrentUser(): Promise<AuthUser | null> {
  // از cache نتیجه قبلی استفاده میکنه
  const isOnline = await checkRealConnectivity()

  if (isOnline) {
    try {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return getAuthUser()
      }

      const authUser: AuthUser = {
        id: user.id,
        email: user.email!,
        created_at: user.created_at,
      }
      saveAuthUser(authUser)
      return authUser
    } catch {
      return getAuthUser()
    }
  }

  console.log("[Auth] Offline mode - using cached user")
  return getAuthUser()
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

// ============================================
// 🔄 ورود یا ثبت‌نام خودکار
// ============================================
export async function signInOrSignUp(email: string, password: string): Promise<{
  success: boolean
  error?: string
  isNewUser?: boolean
}> {
  const isOnline = await checkRealConnectivity()

  if (!isOnline) {
    return {
      success: false,
      error: "برای ورود یا ثبت‌نام باید به سرور دسترسی داشته باشید",
    }
  }

  try {
    const supabase = createClient()

    // اول سعی میکنیم login کنیم
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!signInError && signInData.user) {
      saveAuthUser({
        id: signInData.user.id,
        email: signInData.user.email!,
        created_at: signInData.user.created_at,
      })
      return { success: true, isNewUser: false }
    }

    // اگه یوزر وجود نداشت → signup
    if (
      signInError?.message?.includes("Invalid login credentials") ||
      signInError?.message?.includes("Invalid email or password")
    ) {
      console.log("[Auth] User not found, trying signup...")

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) {
        return { success: false, error: signUpError.message }
      }

      if (signUpData.user) {
        saveAuthUser({
          id: signUpData.user.id,
          email: signUpData.user.email!,
          created_at: signUpData.user.created_at,
        })
        return { success: true, isNewUser: true }
      }
    }

    return { success: false, error: signInError?.message || "خطای ناشناخته" }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
