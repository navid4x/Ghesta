import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"

const SYNC_QUEUE_KEY = "sync_queue"
const SYNC_INTERVAL = 1000 // 1 ثانیه
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
  
  // اولین sync فوری
  syncNow()
  
  // سپس هر 1 ثانیه چک کن
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
  
  if (remainingOps.length === 0) {
    console.log("[BG Sync] ✨ All operations synced!")
    // اطلاع‌رسانی به UI
    window.dispatchEvent(new CustomEvent('sync-complete'))
  }
}

// ============================================
// 🔧 پردازش یک عملیات
// ============================================
async function processOperation(supabase: any, operation: SyncOperation): Promise<void> {
  switch (operation.type) {
    case "create":
    case "update":
      await supabase.from("installments").upsert({
        ...operation.data,
        user_id: operation.data.user_id,
      })
      
      // Sync payments
      if (operation.data.payments?.length > 0) {
        const paymentsToUpsert = operation.data.payments.map((p: any) => ({
          id: p.id,
          installment_id: operation.data.id,
          due_date: p.due_date,
          amount: p.amount,
          is_paid: p.is_paid,
          paid_date: p.paid_date || null,
          updated_at: new Date().toISOString(),
        }))

        await supabase
          .from("installment_payments")
          .upsert(paymentsToUpsert, { onConflict: "id" })
      }
      break

    case "delete":
      await supabase
        .from("installments")
        .delete()
        .eq("id", operation.data.id)
      break

    case "toggle_payment":
      await supabase
        .from("installment_payments")
        .update({
          is_paid: operation.data.isPaid,
          paid_date: operation.data.paidDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", operation.data.paymentId)
      
      await supabase
        .from("installments")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", operation.data.installmentId)
      break
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
  
  console.log(`[BG Sync] Added to queue: ${newOp.type} (Queue size: ${queue.length})`)
  
  // اگر آنلاین است، فوری sync کن
  if (navigator.onLine && !isSyncing) {
    syncNow()
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
}

// ============================================
// 🌐 Event Listeners
// ============================================
if (typeof window !== "undefined") {
  // شروع sync وقتی آنلاین میشه
  window.addEventListener("online", () => {
    console.log("[BG Sync] Network online - starting sync")
    syncNow()
  })
  
  // توقف sync وقتی آفلاین میشه
  window.addEventListener("offline", () => {
    console.log("[BG Sync] Network offline")
  })
}
