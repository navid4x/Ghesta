import { createClient } from "@/lib/supabase/client"
import { getConnectionStatus } from "@/lib/connection-state"

const SYNC_QUEUE_KEY = "sync_queue"
const SYNC_INTERVAL = 30000 // 30 ثانیه
const MAX_RETRIES = 3

interface SyncOperation {
  id: string
  type: "create" | "update" | "delete" | "toggle_payment" | "soft_delete"| "hard_delete" | "restore"
  entityType: "installment" | "payment"
  data: any
  timestamp: string
  retries: number
}

let syncInterval: NodeJS.Timeout | null = null
let isSyncing = false

// ============================================
// 🚀 شروع Background Sync
// ============================================
export function startBackgroundSync(): void {
  if (typeof window === "undefined") return

  if (syncInterval) {
    console.log("[BG Sync] Already running")
    return
  }

  console.log("[BG Sync] Starting background sync...")

  // اولین sync فوری
  // noinspection JSIgnoredPromiseFromCall
  syncNow()

  // سپس هر 1 ثانیه چک کن
  syncInterval = setInterval(() => {
    // noinspection JSIgnoredPromiseFromCall
    syncNow()
  }, SYNC_INTERVAL)
}

// ============================================
// ⏸️ توقف Background Sync
// ============================================
export function stopBackgroundSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log("[BG Sync] Stopped")
  }
}

// ============================================
// 🔄 اجرای Sync
// ============================================
async function syncNow(): Promise<void> {
  if (typeof window === "undefined") return

  // اگر آفلاین است یا در حال sync است، skip کن
  if (!getConnectionStatus() || isSyncing) {
    return
  }

  const queue = getQueue()
  if (queue.length === 0) {
    return
  }

  isSyncing = true
  console.log(`[BG Sync] Processing ${queue.length} operations...`)

  const remainingOps: SyncOperation[] = []
  const supabase = createClient()

  for (const operation of queue) {
    try {
      await processOperation(supabase, operation)
      console.log(`[BG Sync] ✅ Success: ${operation.type}`)
    } catch (error: any) {
      console.error(`[BG Sync] ❌ Failed: ${operation.type}`, error.message)

      // افزایش retry counter
      operation.retries = (operation.retries || 0) + 1

      // اگر هنوز retry مونده، دوباره به صف اضافه کن
      if (operation.retries < MAX_RETRIES) {
        remainingOps.push(operation)
      } else {
        console.error(`[BG Sync] ⛔ Max retries reached for operation ${operation.id}`)
      }
    }
  }

  // آپدیت صف
  saveQueue(remainingOps)
  isSyncing = false

  if (remainingOps.length === 0 && queue.length > 0) {
    console.log("[BG Sync] ✨ All operations synced!")
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sync-complete"))
    }
  }
}

// ============================================
// 🔧 پردازش یک عملیات
// ============================================
// ... کدهای قبلی بدون تغییر تا قسمت processOperation ...

// ============================================
// 🔧 پردازش یک عملیات
// ============================================
async function processOperation(supabase: any, operation: SyncOperation): Promise<void> {
  switch (operation.type) {
    // ========================================
    // 📝 CREATE & UPDATE
    // ========================================
    case "create":
    case "update":
      const { error: instError } = await supabase.from("installments").upsert({
        id: operation.data.id,
        user_id: operation.data.user_id,
        creditor_name: operation.data.creditor_name,
        item_description: operation.data.item_description,
        total_amount: operation.data.total_amount,
        installment_amount: operation.data.installment_amount,
        start_date: operation.data.start_date,
        jalali_start_date: operation.data.jalali_start_date, // 🆕
        installment_count: operation.data.installment_count,
        recurrence: operation.data.recurrence,
        reminder_days: operation.data.reminder_days,
        notes: operation.data.notes,
        payment_time: operation.data.payment_time,
        created_at: operation.data.created_at,
        updated_at: new Date().toISOString(),
        deleted_at: operation.data.deleted_at || null, // 🆕
      })

      if (instError) throw instError

      if (operation.data.payments?.length > 0) {
        const paymentIds = operation.data.payments.map((p: any) => p.id)
        await supabase
          .from("installment_payments")
          .delete()
          .eq("installment_id", operation.data.id)
          .not("id", "in", `(${paymentIds.join(",")})`)

        const paymentsToUpsert = operation.data.payments.map((p: any) => ({
          id: p.id,
          installment_id: operation.data.id,
          due_date: p.due_date,
          jalali_due_date: p.jalali_due_date, // 🆕
          amount: p.amount,
          is_paid: p.is_paid,
          paid_date: p.paid_date || null,
          deleted_at: p.deleted_at || null, // 🆕
          updated_at: new Date().toISOString(),
        }))

        const { error: payError } = await supabase
          .from("installment_payments")
          .upsert(paymentsToUpsert, { onConflict: "id" })

        if (payError) throw payError
      }
      break

    // ========================================
    // 🗑️ SOFT DELETE
    // ========================================
    case "soft_delete":
      await supabase
        .from("installment_payments")
        .update({ 
          deleted_at: operation.data.deleted_at,
          updated_at: new Date().toISOString()
        })
        .eq("installment_id", operation.data.id)

      const { error: softDelError } = await supabase
        .from("installments")
        .update({ 
          deleted_at: operation.data.deleted_at,
          updated_at: operation.data.updated_at
        })
        .eq("id", operation.data.id)

      if (softDelError) throw softDelError
      
      console.log("[Sync] ✅ Soft deleted on server:", operation.data.id)
      break

    // ========================================
    // 🔄 RESTORE
    // ========================================
    case "restore":
      await supabase
        .from("installment_payments")
        .update({ 
          deleted_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("installment_id", operation.data.id)

      const { error: restoreError } = await supabase
        .from("installments")
        .update({ 
          deleted_at: null,
          updated_at: operation.data.updated_at
        })
        .eq("id", operation.data.id)

      if (restoreError) throw restoreError
      
      console.log("[Sync] ✅ Restored on server:", operation.data.id)
      break

    // ========================================
    // 💀 HARD DELETE (کامل)
    // ========================================
    case "hard_delete":
      await supabase
        .from("installment_payments")
        .delete()
        .eq("installment_id", operation.data.id)

      const { error: delError } = await supabase
        .from("installments")
        .delete()
        .eq("id", operation.data.id)

      if (delError) throw delError
      
      console.log("[Sync] ✅ Hard deleted on server:", operation.data.id)
      break

    // ========================================
    // ✅ TOGGLE PAYMENT
    // ========================================
    case "toggle_payment":
      const { error: toggleError } = await supabase
        .from("installment_payments")
        .update({
          is_paid: operation.data.isPaid,
          paid_date: operation.data.paidDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", operation.data.paymentId)

      if (toggleError) throw toggleError

      await supabase
        .from("installments")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", operation.data.installmentId)
      break
  }
}

// ... بقیه کد بدون تغییر ...

// 🆕 Export کردن getQueue برای استفاده در data-sync
export function getQueue(): SyncOperation[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(SYNC_QUEUE_KEY)
  return stored ? JSON.parse(stored) : []
}

// ============================================
// 📝 مدیریت صف
// ============================================
export function addToQueue(operation: Omit<SyncOperation, "id" | "timestamp" | "retries">): void {
  const queue = getQueue()

  const newOp: SyncOperation = {
    ...operation,
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2,12)}`,
    timestamp: new Date().toISOString(),
    retries: 0,
  }

  queue.push(newOp)
  saveQueue(queue)

  console.log(`[BG Sync] Added to queue: ${newOp.type} (Queue size: ${queue.length})`)

  // اگر آنلاین است، فوری sync کن
  if (getConnectionStatus() && !isSyncing) {
    // noinspection JSIgnoredPromiseFromCall
    syncNow()
  }
}

function saveQueue(queue: SyncOperation[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
}

export function getQueueSize(): number {
  return getQueue().length
}

// export function clearQueue(): void {
//   saveQueue([])
// }

// ============================================
// 🌐 Event Listeners
// ============================================
if (typeof window !== "undefined") {
  // شروع sync وقتی آنلاین میشه
  window.addEventListener("online", () => {
    console.log("[BG Sync] Network online - starting sync")
    // noinspection JSIgnoredPromiseFromCall
    syncNow()
  })

  // توقف sync وقتی آفلاین میشه
  window.addEventListener("offline", () => {
    console.log("[BG Sync] Network offline")
  })
}
