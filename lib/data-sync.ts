import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"
import { getCurrentUser } from "@/lib/auth-handler"
import { addToQueue } from "@/lib/background-sync"

const CACHE_KEY = "installments_cache"
const CACHE_DURATION = 30000 // 30 ثانیه

function invalidateCache(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(CACHE_KEY)
}

function getCache(userId: string): { data: Installment[], timestamp: number } | null {
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
  localStorage.setItem(`${CACHE_KEY}-${userId}`, JSON.stringify({
    data,
    timestamp: Date.now()
  }))
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
    // در پس‌زمینه refresh کن
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
    
    // اطلاع‌رسانی به UI
    window.dispatchEvent(new CustomEvent('data-refreshed', { detail: merged }))
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
  
  // ✅ 1. فوری روی localStorage بنویس (بدون تاخیر!)
  const installments = getLocalInstallments(userId)
  const existingIndex = installments.findIndex((i) => i.id === installment.id)

  if (existingIndex >= 0) {
    installments[existingIndex] = installment
  } else {
    installments.push(installment)
  }

  saveLocalInstallments(userId, installments)
  invalidateCache()
  
  console.log("[Sync] ⚡ Saved locally (instant!)")
  
  // ✅ 2. اضافه کردن به صف برای sync در پس‌زمینه
  addToQueue({
    type: existingIndex >= 0 ? "update" : "create",
    entityType: "installment",
    data: { ...installment, user_id: userId },
  })
}

// ============================================
// 🗑️ DELETE INSTALLMENT - فوری!
// ============================================
export async function deleteInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id
  
  // ✅ فوری از localStorage حذف کن
  const installments = getLocalInstallments(userId)
  const filtered = installments.filter((i) => i.id !== installmentId)
  saveLocalInstallments(userId, filtered)
  invalidateCache()
  
  console.log("[Sync] ⚡ Deleted locally (instant!)")
  
  // ✅ اضافه به صف
  addToQueue({
    type: "delete",
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
  
  // ✅ فوری تغییر بده
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
  
  // ✅ اضافه به صف
  addToQueue({
    type: "toggle_payment",
    entityType: "payment",
    data: { 
      installmentId, 
      paymentId, 
      isPaid: payment.is_paid, 
      paidDate: payment.paid_date 
    },
  })
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
    .order("created_at", { ascending: false })

  if (error) throw error

  return (installmentsData || []).map((inst: any) => ({
    ...inst,
    payments: inst.installment_payments || [],
  }))
}

// ============================================
// 💾 LOCAL STORAGE
// ============================================
function getLocalInstallments(userId: string): Installment[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(`installments-${userId}`)
  return stored ? JSON.parse(stored) : []
}

function saveLocalInstallments(userId: string, installments: Installment[]): void {
  localStorage.setItem(`installments-${userId}`, JSON.stringify(installments))
}

function mergeInstallments(local: Installment[], server: Installment[], userId: string): Installment[] {
  const merged = new Map<string, Installment>()
  
  // Server data first (source of truth)
  server.forEach(item => merged.set(item.id, item))
  
  // Local data for items not yet synced
  local.forEach(item => {
    if (!merged.has(item.id)) {
      merged.set(item.id, item)
    }
  })
  
  return Array.from(merged.values())
}

export function getPendingOperationsCount(): number {
  const { getQueueSize } = require("@/lib/background-sync")
  return getQueueSize()
}
