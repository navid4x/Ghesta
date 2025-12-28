import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"
import { getCurrentUser } from "@/lib/auth-handler"

const SYNC_QUEUE_KEY = "sync_queue"
const LAST_SYNC_KEY = "last_sync_time"

interface SyncOperation {
  id: string
  type: "create" | "update" | "delete" | "toggle_payment"
  entityType: "installment" | "payment"
  data: any
  timestamp: string
}

export function queueSyncOperation(operation: Omit<SyncOperation, "id" | "timestamp">): void {
  if (typeof window === "undefined") return

  const queue = getSyncQueue()
  const newOperation: SyncOperation = {
    ...operation,
    id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  }

  queue.push(newOperation)
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
}

function getSyncQueue(): SyncOperation[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(SYNC_QUEUE_KEY)
  return stored ? JSON.parse(stored) : []
}

function clearSyncQueue(): void {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify([]))
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())
}

// ============================================
// 📥 LOAD INSTALLMENTS
// ============================================
export async function loadInstallments(): Promise<Installment[]> {
  console.log("[v0] Loading installments...")
  console.log("[v0] Online status:", navigator.onLine)
  
  // دریافت کاربر فعلی (از سرور یا cache)
  const user = await getCurrentUser()
  
  if (!user) {
    console.log("[v0] No authenticated user found")
    return []
  }
  
  const userId = user.id
  console.log("[v0] Current user:", user.email, `(${userId})`)
  
  // ابتدا داده محلی را بخوان
  const localData = getLocalInstallments(userId)
  console.log("[v0] Local data count:", localData.length)
  
  // چک کردن صف سینک
  const queue = getSyncQueue()
  console.log("[v0] Pending operations in queue:", queue.length)
  
  // اگر آفلاین است، فقط داده محلی را برگردان
  if (!navigator.onLine) {
    console.log("[v0] Offline mode - returning local data only")
    return localData
  }

  try {
    // سینک کردن تغییرات pending
    console.log("[v0] Starting sync process...")
    await processSyncQueue(userId)
    
    // دریافت داده از سرور
    console.log("[v0] Fetching from server...")
    const serverData = await fetchFromServer(userId)
    console.log("[v0] Server data count:", serverData.length)
    
    // ادغام داده محلی و سرور
    const merged = mergeInstallments(localData, serverData, userId)
    console.log("[v0] Merged data count:", merged.length)
    
    // ذخیره نهایی
    saveLocalInstallments(userId, merged)

    return merged
  } catch (error) {
    console.error("[v0] Error loading installments:", error)
    return localData
  }
}

// ============================================
// 💾 SAVE INSTALLMENT
// ============================================
export async function saveInstallment(installment: Installment): Promise<void> {
  const user = await getCurrentUser()
  if (!user) {
    console.error("[v0] Cannot save: No authenticated user")
    return
  }

  const userId = user.id
  const installments = getLocalInstallments(userId)
  const existingIndex = installments.findIndex((i) => i.id === installment.id)

  if (existingIndex >= 0) {
    installments[existingIndex] = installment
  } else {
    installments.push(installment)
  }

  saveLocalInstallments(userId, installments)

  if (navigator.onLine) {
    try {
      await saveToServer(userId, { ...installment, user_id: userId })
      return
    } catch (error) {
      console.error("[v0] Error saving to server:", error)
    }
  }

  queueSyncOperation({
    type: existingIndex >= 0 ? "update" : "create",
    entityType: "installment",
    data: installment,
  })
}

// ============================================
// 🗑️ DELETE INSTALLMENT
// ============================================
export async function deleteInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) {
    console.error("[v0] Cannot delete: No authenticated user")
    return
  }

  const userId = user.id
  const installments = getLocalInstallments(userId)
  const filtered = installments.filter((i) => i.id !== installmentId)
  saveLocalInstallments(userId, filtered)

  if (navigator.onLine) {
    try {
      await deleteFromServer(installmentId)
      return
    } catch (error) {
      console.error("[v0] Error deleting from server:", error)
    }
  }

  queueSyncOperation({
    type: "delete",
    entityType: "installment",
    data: { id: installmentId },
  })
}

// ============================================
// ✅ TOGGLE PAYMENT
// ============================================
export async function togglePayment(installmentId: string, paymentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) {
    console.error("[v0] Cannot toggle payment: No authenticated user")
    return
  }

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

  if (navigator.onLine) {
    try {
      await updatePaymentOnServer(paymentId, payment.is_paid, payment.paid_date)
      await updateInstallmentTimestamp(installmentId)
      return
    } catch (error) {
      console.error("[v0] Error updating payment on server:", error)
    }
  }

  queueSyncOperation({
    type: "toggle_payment",
    entityType: "payment",
    data: { installmentId, paymentId, isPaid: payment.is_paid, paidDate: payment.paid_date },
  })
}

// ============================================
// 🔄 PROCESS SYNC QUEUE
// ============================================
async function processSyncQueue(realUserId: string): Promise<void> {
  const queue = getSyncQueue()
  if (queue.length === 0) return

  console.log(`[v0] Processing ${queue.length} pending operations...`)

  const failedOps: SyncOperation[] = []

  for (const operation of queue) {
    try {
      switch (operation.type) {
        case "create":
        case "update":
          const installmentData = {
            ...operation.data,
            user_id: realUserId,
          }
          await saveToServer(realUserId, installmentData)
          break
        case "delete":
          await deleteFromServer(operation.data.id)
          break
        case "toggle_payment":
          await updatePaymentOnServer(operation.data.paymentId, operation.data.isPaid, operation.data.paidDate)
          await updateInstallmentTimestamp(operation.data.installmentId)
          break
      }
    } catch (error: any) {
      console.error("[v0] Sync operation failed:", error)
      if (!error.message?.includes("row-level security")) {
        failedOps.push(operation)
      }
    }
  }

  if (failedOps.length > 0) {
    console.log(`[v0] ${failedOps.length} operations failed, will retry later`)
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failedOps))
  } else {
    console.log("[v0] All operations synced successfully!")
    clearSyncQueue()
  }
}

// ============================================
// 🌐 SERVER OPERATIONS
// ============================================

async function fetchFromServer(userId: string): Promise<Installment[]> {
  const supabase = createClient()

  const { data: installmentsData, error: installmentsError } = await supabase
    .from("installments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (installmentsError) throw installmentsError

  const installments: Installment[] = []

  for (const inst of installmentsData || []) {
    const { data: paymentsData } = await supabase
      .from("installment_payments")
      .select("*")
      .eq("installment_id", inst.id)
      .order("due_date", { ascending: true })

    installments.push({
      ...inst,
      payments: paymentsData || [],
    })
  }

  return installments
}

async function saveToServer(userId: string, installment: Installment): Promise<void> {
  const supabase = createClient()

  const { payments, ...installmentData } = installment

  const { error: installmentError } = await supabase.from("installments").upsert({
    ...installmentData,
    user_id: userId,
  })

  if (installmentError) throw installmentError

  if (payments && payments.length > 0) {
    const { data: existingPayments } = await supabase
      .from("installment_payments")
      .select("id")
      .eq("installment_id", installment.id)

    const existingIds = new Set((existingPayments || []).map((p) => p.id))
    const newIds = new Set(payments.map((p) => p.id))

    const toDelete = [...existingIds].filter((id) => !newIds.has(id))

    const paymentsToUpsert = payments.map((p) => ({
      id: p.id,
      installment_id: installment.id,
      due_date: p.due_date,
      amount: p.amount,
      is_paid: p.is_paid,
      paid_date: p.paid_date || null,
      updated_at: new Date().toISOString(),
    }))

    if (toDelete.length > 0) {
      console.log("[v0] Deleting removed payments:", toDelete)
      const { error: deleteError } = await supabase.from("installment_payments").delete().in("id", toDelete)

      if (deleteError) {
        console.error("[v0] Error deleting payments:", deleteError)
        throw deleteError
      }
    }

    console.log("[v0] Upserting payments:", paymentsToUpsert.length)
    const { error: paymentsError } = await supabase
      .from("installment_payments")
      .upsert(paymentsToUpsert, { onConflict: "id" })

    if (paymentsError) {
      console.error("[v0] Error upserting payments:", paymentsError)
      throw paymentsError
    }
  }
}

async function deleteFromServer(installmentId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("installments").delete().eq("id", installmentId)
  if (error) throw error
}

async function updatePaymentOnServer(paymentId: string, isPaid: boolean, paidDate?: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from("installment_payments")
    .update({
      is_paid: isPaid,
      paid_date: paidDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)

  if (error) throw error
}

async function updateInstallmentTimestamp(installmentId: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from("installments")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", installmentId)

  if (error) throw error
}

// ============================================
// 💾 LOCAL STORAGE HELPERS
// ============================================

function getLocalInstallments(userId: string): Installment[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(`installments-${userId}`)
  return stored ? JSON.parse(stored) : []
}

function saveLocalInstallments(userId: string, installments: Installment[]): void {
  localStorage.setItem(`installments-${userId}`, JSON.stringify(installments))
}

function mergeInstallments(local: Installment[], server: Installment[], realUserId?: string): Installment[] {
  const merged: Installment[] = []
  const seen = new Set<string>()

  for (const serverItem of server) {
    merged.push(serverItem)
    seen.add(serverItem.id)
  }

  for (const localItem of local) {
    if (!seen.has(localItem.id)) {
      merged.push(localItem)
    }
  }

  return merged
}

// ============================================
// 🔔 SYNC STATUS
// ============================================

export function getSyncStatus(): { hasPending: boolean; lastSync: string | null } {
  const queue = getSyncQueue()
  const lastSync = localStorage.getItem(LAST_SYNC_KEY)

  return {
    hasPending: queue.length > 0,
    lastSync,
  }
}

export function getPendingOperationsCount(): number {
  return getSyncQueue().length
}

// ============================================
// 🔄 MANUAL SYNC (برای وقتی که آنلاین میشه)
// ============================================
export async function manualSync(): Promise<boolean> {
  if (!navigator.onLine) {
    console.log("[v0] Cannot sync: offline")
    return false
  }

  try {
    const user = await getCurrentUser()
    
    if (!user) {
      console.log("[v0] Cannot sync: not authenticated")
      return false
    }

    await processSyncQueue(user.id)
    const serverData = await fetchFromServer(user.id)
    const localData = getLocalInstallments(user.id)
    const merged = mergeInstallments(localData, serverData, user.id)
    saveLocalInstallments(user.id, merged)

    console.log("[v0] Manual sync completed successfully")
    return true
  } catch (error) {
    console.error("[v0] Manual sync failed:", error)
    return false
  }
}
