import { createClient } from "@/lib/supabase/client"

const AUTH_USER_KEY = "authenticated_user"

interface AuthUser {
  id: string
  email: string
  created_at: string
}

// ============================================
// 💾 ذخیره اطلاعات کاربر بعد از لاگین
// ============================================
export function saveAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

// ============================================
// 📖 خواندن اطلاعات کاربر (برای حالت آفلاین)
// ============================================
export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(AUTH_USER_KEY)
  return stored ? JSON.parse(stored) : null
}

// ============================================
// 🗑️ پاک کردن اطلاعات کاربر (logout)
// ============================================
export function clearAuthUser(): void {
  localStorage.removeItem(AUTH_USER_KEY)
}

// ============================================
// 👤 دریافت کاربر فعلی (آنلاین و آفلاین)
// ============================================
export async function getCurrentUser(): Promise<AuthUser | null> {
  // اگر آنلاین است، از سرور بگیر
  if (navigator.onLine) {
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
// 🔐 بررسی احراز هویت
// ============================================
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

// ============================================
// 📝 لاگین
// ============================================
export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!navigator.onLine) {
    return {
      success: false,
      error: "برای ورود به سیستم باید به اینترنت متصل باشید",
    }
  }

  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data.user) {
      saveAuthUser({
        id: data.user.id,
        email: data.user.email!,
        created_at: data.user.created_at,
      })
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ============================================
// 📝 ثبت‌نام
// ============================================
export async function signUp(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!navigator.onLine) {
    return {
      success: false,
      error: "برای ثبت‌نام باید به اینترنت متصل باشید",
    }
  }

  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data.user) {
      saveAuthUser({
        id: data.user.id,
        email: data.user.email!,
        created_at: data.user.created_at,
      })
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ============================================
// 🔄 ورود یا ثبت‌نام خودکار
// ============================================
export async function signInOrSignUp(email: string, password: string): Promise<{ 
  success: boolean
  error?: string
  isNewUser?: boolean
}> {
  if (!navigator.onLine) {
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
