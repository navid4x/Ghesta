import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"

// ============================================
// 🔄 DATA SYNC MANAGER - مدیریت همگام‌سازی دیتا
// ============================================

const SYNC_QUEUE_KEY = "sync_queue"
const LAST_SYNC_KEY = "last_sync_time"

interface SyncOperation {
  id: string
  type: "create" | "update" | "delete" | "toggle_payment"
  entityType: "installment" | "payment"
  data: any
  timestamp: string
}

// ذخیره عملیات در صف همگام‌سازی
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

  console.log("[v0] Queued sync operation:", operation.type, operation.entityType)
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
// 📥 LOAD INSTALLMENTS - بارگذاری اقساط
// ============================================
export async function loadInstallments(userId: string): Promise<Installment[]> {
  // 1. بارگذاری از localStorage
  const localData = getLocalInstallments(userId)

  // 2. اگر آنلاین بود، سینک کن
  if (navigator.onLine) {
    try {
      console.log("[v0] Online: Syncing with server...")

      // ابتدا صف عملیات را پردازش کن
      await processSyncQueue(userId)

      // سپس دیتا را از سرور بگیر
      const serverData = await fetchFromServer(userId)

      // Merge و ذخیره
      const merged = mergeInstallments(localData, serverData)
      saveLocalInstallments(userId, merged)

      console.log("[v0] ✅ Sync complete")
      return merged
    } catch (error) {
      console.error("[v0] Sync error, using local data:", error)
      return localData
    }
  }

  console.log("[v0] Offline: Using local data")
  return localData
}

// ============================================
// 💾 SAVE INSTALLMENT - ذخیره قسط
// ============================================
export async function saveInstallment(userId: string, installment: Installment): Promise<void> {
  // 1. ذخیره محلی
  const installments = getLocalInstallments(userId)
  const existingIndex = installments.findIndex((i) => i.id === installment.id)

  if (existingIndex >= 0) {
    installments[existingIndex] = installment
  } else {
    installments.push(installment)
  }

  saveLocalInstallments(userId, installments)

  // 2. اگر آنلاین بود، بلافاصله سرور را آپدیت کن
  if (navigator.onLine) {
    try {
      await saveToServer(userId, installment)
      console.log("[v0] ✅ Saved to server")
    } catch (error) {
      console.error("[v0] Failed to save to server, queuing:", error)
      queueSyncOperation({
        type: existingIndex >= 0 ? "update" : "create",
        entityType: "installment",
        data: installment,
      })
    }
  } else {
    // 3. آفلاین بود، در صف قرار بده
    queueSyncOperation({
      type: existingIndex >= 0 ? "update" : "create",
      entityType: "installment",
      data: installment,
    })
  }
}

// ============================================
// 🗑️ DELETE INSTALLMENT - حذف قسط
// ============================================
export async function deleteInstallment(userId: string, installmentId: string): Promise<void> {
  // 1. حذف محلی
  const installments = getLocalInstallments(userId)
  const filtered = installments.filter((i) => i.id !== installmentId)
  saveLocalInstallments(userId, filtered)

  // 2. سرور یا صف
  if (navigator.onLine) {
    try {
      await deleteFromServer(installmentId)
      console.log("[v0] ✅ Deleted from server")
    } catch (error) {
      console.error("[v0] Failed to delete from server, queuing:", error)
      queueSyncOperation({
        type: "delete",
        entityType: "installment",
        data: { id: installmentId },
      })
    }
  } else {
    queueSyncOperation({
      type: "delete",
      entityType: "installment",
      data: { id: installmentId },
    })
  }
}

// ============================================
// ✅ TOGGLE PAYMENT - تغییر وضعیت پرداخت
// ============================================
export async function togglePayment(userId: string, installmentId: string, paymentId: string): Promise<void> {
  // 1. تغییر محلی
  const installments = getLocalInstallments(userId)
  const installment = installments.find((i) => i.id === installmentId)

  if (!installment) return

  const payment = installment.payments.find((p) => p.id === paymentId)
  if (!payment) return

  payment.is_paid = !payment.is_paid
  payment.paid_date = payment.is_paid ? new Date().toISOString().split("T")[0] : undefined
  installment.updated_at = new Date().toISOString()

  saveLocalInstallments(userId, installments)

  // 2. سرور یا صف
  if (navigator.onLine) {
    try {
      await updatePaymentOnServer(paymentId, payment.is_paid, payment.paid_date)
      await updateInstallmentTimestamp(installmentId)
      console.log("[v0] ✅ Payment status updated on server")
    } catch (error) {
      console.error("[v0] Failed to update payment on server, queuing:", error)
      queueSyncOperation({
        type: "toggle_payment",
        entityType: "payment",
        data: { installmentId, paymentId, isPaid: payment.is_paid, paidDate: payment.paid_date },
      })
    }
  } else {
    queueSyncOperation({
      type: "toggle_payment",
      entityType: "payment",
      data: { installmentId, paymentId, isPaid: payment.is_paid, paidDate: payment.paid_date },
    })
  }
}

// ============================================
// 🔄 PROCESS SYNC QUEUE - پردازش صف همگام‌سازی
// ============================================
async function processSyncQueue(userId: string): Promise<void> {
  const queue = getSyncQueue()
  if (queue.length === 0) return

  console.log("[v0] Processing sync queue:", queue.length, "operations")

  for (const operation of queue) {
    try {
      switch (operation.type) {
        case "create":
        case "update":
          await saveToServer(userId, operation.data)
          break
        case "delete":
          await deleteFromServer(operation.data.id)
          break
        case "toggle_payment":
          await updatePaymentOnServer(operation.data.paymentId, operation.data.isPaid, operation.data.paidDate)
          await updateInstallmentTimestamp(operation.data.installmentId)
          break
      }
    } catch (error) {
      console.error("[v0] Failed to process sync operation:", operation, error)
      // در صورت خطا، عملیات در صف باقی می‌ماند
      throw error
    }
  }

  clearSyncQueue()
}

// ============================================
// 🌐 SERVER OPERATIONS - عملیات سرور
// ============================================

async function fetchFromServer(userId: string): Promise<Installment[]> {
  const supabase = createClient()

  // دریافت اقساط
  const { data: installmentsData, error: installmentsError } = await supabase
    .from("installments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (installmentsError) throw installmentsError

  // دریافت پرداخت‌ها برای هر قسط
  const installments: Installment[] = []

  for (const inst of installmentsData || []) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("installment_payments")
      .select("*")
      .eq("installment_id", inst.id)
      .order("due_date", { ascending: true })

    if (paymentsError) {
      console.error("[v0] Error fetching payments:", paymentsError)
      continue
    }

    installments.push({
      ...inst,
      payments: paymentsData || [],
    })
  }

  return installments
}

async function saveToServer(userId: string, installment: Installment): Promise<void> {
  const supabase = createClient()

  // جدا کردن payments از installment
  const { payments, ...installmentData } = installment

  // ذخیره installment
  const { error: installmentError } = await supabase.from("installments").upsert({
    ...installmentData,
    user_id: userId,
  })

  if (installmentError) throw installmentError

  // ذخیره payments
  if (payments && payments.length > 0) {
    const paymentsToInsert = payments.map((p) => ({
      ...p,
      installment_id: installment.id,
    }))

    const { error: paymentsError } = await supabase.from("installment_payments").upsert(paymentsToInsert)

    if (paymentsError) throw paymentsError
  }
}

async function deleteFromServer(installmentId: string): Promise<void> {
  const supabase = createClient()

  // با ON DELETE CASCADE، payments خودکار حذف می‌شوند
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

function mergeInstallments(local: Installment[], server: Installment[]): Installment[] {
  const merged: Installment[] = []
  const seen = new Set<string>()

  // اضافه کردن تمام آیتم‌های سرور (اولویت با سرور)
  for (const serverItem of server) {
    merged.push(serverItem)
    seen.add(serverItem.id)
  }

  // اضافه کردن آیتم‌های محلی که در سرور نیستند
  for (const localItem of local) {
    if (!seen.has(localItem.id)) {
      // اگر ID آفلاین است، در صف قرار بده
      if (localItem.id.startsWith("offline_")) {
        queueSyncOperation({
          type: "create",
          entityType: "installment",
          data: localItem,
        })
      } else {
        merged.push(localItem)
      }
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
