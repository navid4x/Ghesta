import { createClient } from "@/lib/supabase/client"
import { getConnectionStatus } from "@/lib/connection-state"

const AUTH_USER_KEY = "authenticated_user"

interface AuthUser {
  id: string
  email: string
  created_at: string
}

// ============================================
// 💾 ذخیره اطلاعات کاربر بعد از لاگین
// ============================================
function saveAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

// ============================================
// 📖 خواندن اطلاعات کاربر (برای حالت آفلاین)
// ============================================
function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(AUTH_USER_KEY)
  return stored ? JSON.parse(stored) : null
}

// ============================================
// 👤 دریافت کاربر فعلی (آنلاین و آفلاین)
// ============================================
export async function getCurrentUser(): Promise<AuthUser | null> {
  // اگر آنلاین است، از سرور بگیر
  if (getConnectionStatus()) {
    try {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error || !user) {
        console.log("[Auth] No online user found")
        return getAuthUser() // fallback به داده محلی
      }
      
      // ذخیره برای استفاده آفلاین
      const authUser: AuthUser = {
        id: user.id,
        email: user.email!,
        created_at: user.created_at,
      }
      saveAuthUser(authUser)
      
      return authUser
    } catch (error) {
      console.error("[Auth] Error getting user:", error)
      return getAuthUser()
    }
  }
  
  // اگر آفلاین است، از localStorage بخوان
  const cachedUser = getAuthUser()
  console.log("[Auth] Offline mode - using cached user:", cachedUser?.email)
  return cachedUser
}

// ============================================
// 🔄 ورود یا ثبت‌نام خودکار
// ============================================
export async function signInOrSignUp(email: string, password: string): Promise<{ 
  success: boolean
  error?: string
  isNewUser?: boolean
}> {
  if (!getConnectionStatus()) {
    return {
      success: false,
      error: "برای ورود یا ثبت‌نام باید به اینترنت متصل باشید",
    }
  }

  try {
    const supabase = createClient()
    
    // اول سعی می‌کنیم login کنیم
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    // اگر login موفق بود
    if (!signInError && signInData.user) {
      saveAuthUser({
        id: signInData.user.id,
        email: signInData.user.email!,
        created_at: signInData.user.created_at,
      })
      return { success: true, isNewUser: false }
    }

    // اگر خطا "Invalid login credentials" بود، یعنی یوزر وجود نداره - signup کن
    if (signInError?.message?.includes("Invalid login credentials") || 
        signInError?.message?.includes("Invalid email or password")) {
      
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

    // اگر خطای دیگه‌ای بود
    return { success: false, error: signInError?.message || "خطای ناشناخته" }
    
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
