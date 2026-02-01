import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"
import { getCurrentUser } from "@/lib/auth-handler"
import { addToQueue, getQueue } from "@/lib/background-sync"
import { gregorianStringToJalaliString } from "@/lib/persian-calendar"

const CACHE_KEY = "installments_cache"
const CACHE_DURATION = 30000 // 30 ثانیه

function invalidateCache(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(CACHE_KEY)
}

function getCache(userId: string): { data: Installment[]; timestamp: number } | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(`${CACHE_KEY}-${userId}`)
  if (!stored) return null

  const cache = JSON.parse(stored)
  const now = Date.now()

  if (now - cache.timestamp > CACHE_DURATION) {
    return null
  }

  return cache
}

function setCache(userId: string, data: Installment[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(
    `${CACHE_KEY}-${userId}`,
    JSON.stringify({
      data,
      timestamp: Date.now(),
    }),
  )
}

// ============================================
// 🆕 Helper: بررسی اینکه آیا item در صف sync هست
// ============================================
function isInSyncQueue(itemId: string): boolean {
  const queue = getQueue()
  return queue.some(op => 
    op.data?.id === itemId || 
    op.data?.installmentId === itemId
  )
}

// ============================================
// 🆕 Helper: بررسی جدید بودن item
// ============================================
function isRecentItem(item: Installment): boolean {
  const itemTime = new Date(item.created_at).getTime()
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000
  
  return (now - itemTime) < fiveMinutes
}

// ============================================
// 📥 LOAD INSTALLMENTS - فوق سریع
// ============================================
export async function loadInstallments(): Promise<Installment[]> {
  const user = await getCurrentUser()

  if (!user) {
    console.log("[Sync] No authenticated user found")
    return []
  }

  const userId = user.id

  // ✅ 1. چک کردن کش (فوری!)
  const cache = getCache(userId)
  if (cache) {
    console.log("[Sync] ⚡ Using cached data")
    refreshDataInBackground(userId)
    return cache.data
  }

  // ✅ 2. داده محلی (فوری!)
  const localData = getLocalInstallments(userId)
  console.log("[Sync] 📂 Local data count:", localData.length)

  // ✅ 3. اگر آفلاین است، همین الان برگردون
  if (!navigator.onLine) {
    console.log("[Sync] 📴 Offline mode")
    return localData
  }

  // ✅ 4. اگر داده محلی داره، اونو برگردون و در پس‌زمینه از سرور بگیر
  if (localData.length > 0) {
    console.log("[Sync] ⚡ Returning local data, refreshing in background...")
    refreshDataInBackground(userId)
    return localData
  }

  // ✅ 5. فقط اگر هیچ داده‌ای نداشت، صبر کن تا از سرور بگیره
  console.log("[Sync] 🌐 First load - fetching from server...")
  try {
    const serverData = await fetchFromServer(userId)
    saveLocalInstallments(userId, serverData)
    setCache(userId, serverData)
    return serverData
  } catch (error) {
    console.error("[Sync] Error fetching from server:", error)
    return localData
  }
}

// ============================================
// 🔄 Refresh در پس‌زمینه
// ============================================
async function refreshDataInBackground(userId: string): Promise<void> {
  try {
    const serverData = await fetchFromServer(userId)
    const localData = getLocalInstallments(userId)
    const merged = mergeInstallments(localData, serverData, userId)
    saveLocalInstallments(userId, merged)
    setCache(userId, merged)

    window.dispatchEvent(new CustomEvent("data-refreshed", { detail: merged }))
    console.log("[Sync] ✨ Background refresh complete")
  } catch (error) {
    console.error("[Sync] Background refresh failed:", error)
  }
}

// ============================================
// 💾 SAVE INSTALLMENT - فوری!
// ============================================
export async function saveInstallment(installment: Installment): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  const installments = getLocalInstallments(userId)
  const existingIndex = installments.findIndex((i) => i.id === installment.id)

  installment.updated_at = new Date().toISOString()

  if (existingIndex >= 0) {
    installments[existingIndex] = installment
  } else {
    installments.push(installment)
  }

  saveLocalInstallments(userId, installments)
  invalidateCache()

  console.log("[Sync] ⚡ Saved locally (instant!)")

  addToQueue({
    type: existingIndex >= 0 ? "update" : "create",
    entityType: "installment",
    data: { ...installment, user_id: userId },
  })
}

// ============================================
// 🗑️ SOFT DELETE INSTALLMENT - آپدیت شده
// ============================================
export async function deleteInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  // 🔧 گرفتن همه installments (شامل deleted)
  const stored = localStorage.getItem(`installments-${userId}`)
  const installments = stored ? JSON.parse(stored) : []
  
  const installment = installments.find((i: Installment) => i.id === installmentId)
  
  if (installment) {
    installment.deleted_at = new Date().toISOString()
    installment.updated_at = new Date().toISOString()
    
    // علامت‌گذاری payments
    installment.payments.forEach((payment: any) => {
      payment.deleted_at = installment.deleted_at
    })
    
    // 🔧 ذخیره با deleted items (موقتی تا sync بشه)
    localStorage.setItem(`installments-${userId}`, JSON.stringify(installments))
    invalidateCache()

    console.log("[Sync] ⚡ Soft deleted locally (instant!)")

    addToQueue({
      type: "soft_delete",
      entityType: "installment",
      data: { 
        id: installmentId,
        deleted_at: installment.deleted_at,
        updated_at: installment.updated_at
      },
    })
    
    // 🔧 بعد از اضافه به صف، فوراً پاک کن از localStorage
    // (چون دیگه نیازی نیست توی لیست اصلی باشه)
    setTimeout(() => {
      const updated = installments.filter((i: Installment) => i.id !== installmentId)
      localStorage.setItem(`installments-${userId}`, JSON.stringify(updated))
      
      // Trigger data refresh event
      window.dispatchEvent(new CustomEvent("data-refreshed", { 
        detail: updated.filter((i: Installment) => !i.deleted_at) 
      }))
    }, 100)
  }
}

// ============================================
// 🔄 RESTORE INSTALLMENT - آپدیت شده
// ============================================
export async function restoreInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  // 🔧 اول چک کن در deleted items باشه
  const deletedItems = await getDeletedInstallments()
  const installment = deletedItems.find((i) => i.id === installmentId)
  
  if (installment && installment.deleted_at) {
    // پاک کردن deleted_at
    delete installment.deleted_at
    installment.updated_at = new Date().toISOString()
    
    // بازیابی payments
    installment.payments.forEach(payment => {
      delete payment.deleted_at
    })
    
    // 🔧 اضافه کردن به لیست اصلی
    const installments = getLocalInstallments(userId)
    installments.push(installment)
    
    saveLocalInstallments(userId, installments)
    invalidateCache()

    console.log("[Sync] ⚡ Restored locally (instant!)")

    addToQueue({
      type: "restore",
      entityType: "installment",
      data: { 
        id: installmentId,
        updated_at: installment.updated_at
      },
    })
    
    // Trigger refresh
    window.dispatchEvent(new CustomEvent("data-refreshed", { detail: installments }))
  }
}

// ============================================
// 💀 HARD DELETE - آپدیت شده
// ============================================
export async function hardDeleteInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  // 🔧 حذف از همه جا (حتی deleted items)
  const stored = localStorage.getItem(`installments-${userId}`)
  const installments = stored ? JSON.parse(stored) : []
  const filtered = installments.filter((i: Installment) => i.id !== installmentId)
  
  localStorage.setItem(`installments-${userId}`, JSON.stringify(filtered))
  invalidateCache()

  console.log("[Sync] ⚡ Hard deleted locally (instant!)")

  addToQueue({
    type: "hard_delete",
    entityType: "installment",
    data: { id: installmentId },
  })
}
// ============================================
// ✅ TOGGLE PAYMENT - فوری!
// ============================================
export async function togglePayment(installmentId: string, paymentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  const installments = getLocalInstallments(userId)
  const installment = installments.find((i) => i.id === installmentId)
  if (!installment) return

  const payment = installment.payments.find((p) => p.id === paymentId)
  if (!payment) return

  payment.is_paid = !payment.is_paid
  payment.paid_date = payment.is_paid ? new Date().toISOString().split("T")[0] : undefined
  installment.updated_at = new Date().toISOString()

  saveLocalInstallments(userId, installments)
  invalidateCache()

  console.log("[Sync] ⚡ Payment toggled locally (instant!)")

  addToQueue({
    type: "toggle_payment",
    entityType: "payment",
    data: {
      installmentId,
      paymentId,
      isPaid: payment.is_paid,
      paidDate: payment.paid_date,
    },
  })
}

// ============================================
// ↩️ UNDO LAST PAYMENT
// ============================================
export async function undoLastPayment(installmentId: string): Promise<{ success: boolean; payment?: any }> {
  const user = await getCurrentUser()
  if (!user) return { success: false }

  const userId = user.id

  const installments = getLocalInstallments(userId)
  const installment = installments.find((i) => i.id === installmentId)
  if (!installment) return { success: false }

  const paidPayments = installment.payments
    .filter((p) => p.is_paid && !p.deleted_at)
    .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

  if (paidPayments.length === 0) {
    return { success: false }
  }

  const lastPaidPayment = paidPayments[0]

  const payment = installment.payments.find((p) => p.id === lastPaidPayment.id)
  if (!payment) return { success: false }

  payment.is_paid = false
  payment.paid_date = undefined
  installment.updated_at = new Date().toISOString()

  saveLocalInstallments(userId, installments)
  invalidateCache()

  console.log("[Sync] ⚡ Undo payment locally (instant!)")

  addToQueue({
    type: "toggle_payment",
    entityType: "payment",
    data: {
      installmentId,
      paymentId: lastPaidPayment.id,
      isPaid: false,
      paidDate: null,
    },
  })

  return { success: true, payment: lastPaidPayment }
}

// ============================================
// 📊 GET LAST PAID PAYMENT
// ============================================
export function getLastPaidPayment(installment: Installment): any | null {
  if (!installment.payments || !Array.isArray(installment.payments)) {
    return null
  }

  const paidPayments = installment.payments
    .filter((p) => p.is_paid && !p.deleted_at)
    .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

  return paidPayments.length > 0 ? paidPayments[0] : null
}

// ============================================
// 🌐 SERVER OPERATIONS
// ============================================
async function fetchFromServer(userId: string): Promise<Installment[]> {
  const supabase = createClient()

  const { data: installmentsData, error } = await supabase
    .from("installments")
    .select(`
      *,
      installment_payments(*)
    `)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) throw error

  return (installmentsData || []).map((inst: any) => {
    // 🆕 اگر jalali_start_date نداره، از gregorian محاسبه کن
    if (!inst.jalali_start_date && inst.start_date) {
      inst.jalali_start_date = gregorianStringToJalaliString(inst.start_date)
    }

    return {
      ...inst,
      payments: (inst.installment_payments || [])
        .filter((p: any) => !p.deleted_at)
        .map((p: any) => {
          // 🆕 اگر jalali_due_date نداره، از gregorian محاسبه کن
          if (!p.jalali_due_date && p.due_date) {
            p.jalali_due_date = gregorianStringToJalaliString(p.due_date)
          }
          return p
        }),
    }
  })
}

// ============================================
// 💾 LOCAL STORAGE
// ============================================
function getLocalInstallments(userId: string): Installment[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(`installments-${userId}`)
  const installments = stored ? JSON.parse(stored) : []
  
  // 🔧 فیلتر deleted items از localStorage
  return installments.filter((i: Installment) => !i.deleted_at)
}

function saveLocalInstallments(userId: string, installments: Installment[]): void {
  // 🔧 فیلتر deleted items قبل از ذخیره (بجز موارد جدید که در صف هستن)
  const toSave = installments.filter(i => {
    // اگر deleted نیست، ذخیره کن
    if (!i.deleted_at) return true
    
    // اگر deleted هست، فقط در صورتی ذخیره کن که در صف sync باشه
    return isInSyncQueue(i.id)
  })
  
  localStorage.setItem(`installments-${userId}`, JSON.stringify(toSave))
}
// ============================================
// 🔀 MERGE LOGIC با Soft Delete
// ============================================
function mergeInstallments(local: Installment[], server: Installment[], userId: string): Installment[] {
  const merged = new Map<string, Installment>()

  console.log("[Sync] Merging:", { localCount: local.length, serverCount: server.length })

  // 1️⃣ Server data = Source of Truth
  server.forEach((item) => {
    // 🔧 فقط active items رو اضافه کن
    if (!item.deleted_at) {
      merged.set(item.id, item)
    }
  })

  // 2️⃣ Local data که در server نیست
  local.forEach((item) => {
    const serverItem = merged.get(item.id)
    
    // 🔧 اگر deleted هست، skip کن (نباید در لیست اصلی باشه)
    if (item.deleted_at) {
      console.log("[Sync] Skipping deleted item:", item.id)
      return
    }

    if (!serverItem) {
      if (isInSyncQueue(item.id) || isRecentItem(item)) {
        merged.set(item.id, item)
        console.log("[Sync] Keeping local item (in sync queue):", item.id)
      } else {
        console.log("[Sync] Discarding local item (not in server and not pending):", item.id)
      }
      return
    }

    const localTime = new Date(item.updated_at).getTime()
    const serverTime = new Date(serverItem.updated_at).getTime()

    if (localTime > serverTime) {
      merged.set(item.id, item)
      console.log("[Sync] Local is newer:", item.id)
    }
  })

  const result = Array.from(merged.values())
  
  // 🔧 فیلتر نهایی: اطمینان از اینکه هیچ deleted item در نتیجه نباشه
  const filtered = result.filter(item => !item.deleted_at)
  
  console.log("[Sync] Merge complete:", { resultCount: filtered.length })
  
  return filtered
}
// ============================================
// 📊 GET DELETED ITEMS (برای نمایش در UI)
// ============================================
export async function getDeletedInstallments(): Promise<Installment[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const userId = user.id

  if (!navigator.onLine) {
    // 🔧 در حالت آفلاین، از localStorage بخون (بدون فیلتر)
    const stored = localStorage.getItem(`installments-${userId}`)
    const installments = stored ? JSON.parse(stored) : []
    // فقط deleted items رو برگردون
    return installments.filter((i: Installment) => i.deleted_at)
  }

  // در حالت آنلاین، از server بگیر
  const supabase = createClient()
  const { data, error } = await supabase
    .from("installments")
    .select(`
      *,
      installment_payments(*)
    `)
    .eq("user_id", userId)
    .not("deleted_at", "is", null) // 🔧 فقط deleted items
    .order("deleted_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("[Sync] Error fetching deleted items:", error)
    return []
  }

  return (data || []).map((inst: any) => {
    if (!inst.jalali_start_date && inst.start_date) {
      inst.jalali_start_date = gregorianStringToJalaliString(inst.start_date)
    }

    return {
      ...inst,
      payments: (inst.installment_payments || []).map((p: any) => {
        if (!p.jalali_due_date && p.due_date) {
          p.jalali_due_date = gregorianStringToJalaliString(p.due_date)
        }
        return p
      }),
    }
  })
}
export function getPendingOperationsCount(): number {
  const { getQueueSize } = require("@/lib/background-sync")
  return getQueueSize()
}
