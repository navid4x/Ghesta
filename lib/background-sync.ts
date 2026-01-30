import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"

const SYNC_QUEUE_KEY = "sync_queue"
const SYNC_INTERVAL = 2000 // 2 ثانیه (کمی بیشتر برای اطمینان)
const MAX_RETRIES = 3

interface SyncOperation {
  id: string
  type: "create" | "update" | "delete" | "toggle_payment"
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
  if (syncInterval) {
    console.log("[BG Sync] Already running")
    return
  }

  console.log("[BG Sync] Starting background sync...")
  
  // اولین sync بعد از 1 ثانیه
  setTimeout(() => {
    syncNow()
  }, 1000)
  
  // سپس هر 2 ثانیه چک کن
  syncInterval = setInterval(() => {
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
  // اگر آفلاین است یا در حال sync است، skip کن
  if (!navigator.onLine || isSyncing) {
    return
  }

  const queue = getQueue()
  if (queue.length === 0) {
    return
  }

  isSyncing = true
  console.log(`[BG Sync] 🔄 Processing ${queue.length} operations...`)

  const remainingOps: SyncOperation[] = []
  const supabase = createClient()
  let successCount = 0

  for (const operation of queue) {
    try {
      await processOperation(supabase, operation)
      console.log(`[BG Sync] ✅ Success: ${operation.type} - ${operation.data.id || operation.data.installmentId}`)
      successCount++
    } catch (error: any) {
      console.error(`[BG Sync] ❌ Failed: ${operation.type}`, error.message)
      
      // افزایش retry counter
      operation.retries = (operation.retries || 0) + 1
      
      // اگر هنوز retry مونده، دوباره به صف اضافه کن
      if (operation.retries < MAX_RETRIES) {
        console.log(`[BG Sync] 🔁 Retry ${operation.retries}/${MAX_RETRIES} for operation ${operation.id}`)
        remainingOps.push(operation)
      } else {
        console.error(`[BG Sync] ⛔ Max retries reached for operation ${operation.id}`)
      }
    }
  }

  // آپدیت صف
  saveQueue(remainingOps)
  isSyncing = false
  
  if (remainingOps.length === 0 && successCount > 0) {
    console.log(`[BG Sync] ✨ All ${successCount} operations synced successfully!`)
    // اطلاع‌رسانی به UI
    window.dispatchEvent(new CustomEvent('sync-complete'))
  } else if (remainingOps.length > 0) {
    console.log(`[BG Sync] ⏳ ${remainingOps.length} operations remaining in queue`)
  }
}

// ============================================
// 🔧 پردازش یک عملیات
// ============================================
async function processOperation(supabase: any, operation: SyncOperation): Promise<void> {
  switch (operation.type) {
    case "create":
    case "update":
      console.log(`[BG Sync] Processing ${operation.type} for installment ${operation.data.id}`)
      
      // 1️⃣ ذخیره installment
      const { payments, ...installmentData } = operation.data
      
      const { error: installmentError } = await supabase
        .from("installments")
        .upsert({
          ...installmentData,
          user_id: operation.data.user_id,
        })

      if (installmentError) {
        console.error("[BG Sync] Installment error:", installmentError)
        throw installmentError
      }

      // 2️⃣ مدیریت payments
      if (payments && Array.isArray(payments) && payments.length > 0) {
        console.log(`[BG Sync] Syncing ${payments.length} payments for installment ${operation.data.id}`)
        
        // گرفتن payments موجود در دیتابیس
        const { data: existingPayments } = await supabase
          .from("installment_payments")
          .select("id")
          .eq("installment_id", operation.data.id)

        const existingIds = new Set((existingPayments || []).map((p: any) => p.id))
        const newIds = new Set(payments.map((p: any) => p.id))

        // حذف payments که دیگه وجود ندارن
        const toDelete = [...existingIds].filter((id) => !newIds.has(id))
        if (toDelete.length > 0) {
          console.log(`[BG Sync] Deleting ${toDelete.length} removed payments`)
          const { error: deleteError } = await supabase
            .from("installment_payments")
            .delete()
            .in("id", toDelete)

          if (deleteError) {
            console.error("[BG Sync] Delete payments error:", deleteError)
            throw deleteError
          }
        }

        // upsert تمام payments
        const paymentsToUpsert = payments.map((p: any) => ({
          id: p.id,
          installment_id: operation.data.id,
          due_date: p.due_date,
          amount: p.amount,
          is_paid: p.is_paid,
          paid_date: p.paid_date || null,
        }))

        const { error: paymentsError } = await supabase
          .from("installment_payments")
          .upsert(paymentsToUpsert, { onConflict: "id" })

        if (paymentsError) {
          console.error("[BG Sync] Upsert payments error:", paymentsError)
          throw paymentsError
        }
        
        console.log(`[BG Sync] ✅ Synced ${payments.length} payments`)
      }
      break

    case "delete":
      console.log(`[BG Sync] Deleting installment ${operation.data.id}`)
      
      const { error: deleteError } = await supabase
        .from("installments")
        .delete()
        .eq("id", operation.data.id)
      
      if (deleteError) {
        console.error("[BG Sync] Delete error:", deleteError)
        throw deleteError
      }
      break

    case "toggle_payment":
      console.log(`[BG Sync] Toggling payment ${operation.data.paymentId}`)
      
      // آپدیت payment
      const { error: paymentError } = await supabase
        .from("installment_payments")
        .update({
          is_paid: operation.data.isPaid,
          paid_date: operation.data.paidDate || null,
        })
        .eq("id", operation.data.paymentId)
      
      if (paymentError) {
        console.error("[BG Sync] Payment update error:", paymentError)
        throw paymentError
      }
      
      // آپدیت timestamp installment
      const { error: timestampError } = await supabase
        .from("installments")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", operation.data.installmentId)
      
      if (timestampError) {
        console.error("[BG Sync] Timestamp update error:", timestampError)
        throw timestampError
      }
      break

    default:
      console.warn(`[BG Sync] Unknown operation type: ${operation.type}`)
  }
}

// ============================================
// 📝 مدیریت صف
// ============================================
export function addToQueue(operation: Omit<SyncOperation, "id" | "timestamp" | "retries">): void {
  const queue = getQueue()
  
  const newOp: SyncOperation = {
    ...operation,
    id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    retries: 0,
  }
  
  queue.push(newOp)
  saveQueue(queue)
  
  console.log(`[BG Sync] ➕ Added to queue: ${newOp.type} (Queue size: ${queue.length})`)
  
  // اگر آنلاین است و sync در حال اجرا نیست، فوری sync کن
  if (navigator.onLine && !isSyncing) {
    setTimeout(() => {
      syncNow()
    }, 500) // کمی تاخیر برای batch کردن عملیات
  }
}

function getQueue(): SyncOperation[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(SYNC_QUEUE_KEY)
  return stored ? JSON.parse(stored) : []
}

function saveQueue(queue: SyncOperation[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
}

export function getQueueSize(): number {
  return getQueue().length
}

export function clearQueue(): void {
  saveQueue([])
  console.log("[BG Sync] 🗑️ Queue cleared")
}

// ============================================
// 🌐 Event Listeners
// ============================================
if (typeof window !== "undefined") {
  // شروع sync وقتی آنلاین میشه
  window.addEventListener("online", () => {
    console.log("[BG Sync] 🌐 Network online - starting sync")
    setTimeout(() => {
      syncNow()
    }, 1000)
  })
  
  // توقف sync وقتی آفلاین میشه
  window.addEventListener("offline", () => {
    console.log("[BG Sync] 📴 Network offline")
  })
}
