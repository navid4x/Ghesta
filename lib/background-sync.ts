import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"
import { gregorianStringToJalaliString } from "@/lib/persian-calendar"
import { checkRealConnectivity, resetConnectivityCache } from "@/lib/network"

// ========================================
// 🔧 تنظیمات
// ========================================
const SYNC_QUEUE_KEY = "sync_queue"
const SYNC_INTERVAL = 5000 // 5 ثانیه
const MAX_RETRIES = 3
const BROADCAST_CHANNEL_NAME = "ghesta-sync"

// ========================================
// 📊 Types
// ========================================
interface SyncOperation {
  id: string
  type: "create" | "update" | "delete" | "toggle_payment" | "soft_delete" | "hard_delete" | "restore"
  entityType: "installment" | "payment"
  data: any
  timestamp: string
  retries: number
  lastError?: string
}

interface SyncState {
  isSyncing: boolean
  lastSyncTime: number
  queueSize: number
}

// ========================================
// 🌐 State Management
// ========================================
let syncInterval: NodeJS.Timeout | null = null
let isSyncing = false
let broadcastChannel: BroadcastChannel | null = null
let lastServerSync = 0

// ========================================
// 📡 BroadcastChannel برای Multi-tab Sync
// ========================================
function initBroadcastChannel(): void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    console.log("[Sync] BroadcastChannel not supported")
    return
  }

  broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)

  broadcastChannel.addEventListener("message", (event) => {
    const { type, data } = event.data

    switch (type) {
      case "CACHE_UPDATED":
        console.log("[Sync] Cache updated in another tab")
        // Trigger UI refresh
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("data-refreshed", { detail: data }))
        }
        break

      case "QUEUE_UPDATED":
        console.log("[Sync] Queue updated in another tab")
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("queue-updated"))
        }
        break

      case "SYNC_COMPLETE":
        console.log("[Sync] Sync completed in another tab")
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("sync-complete"))
        }
        break
    }
  })
}

function broadcastMessage(type: string, data?: any): void {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type, data, timestamp: Date.now() })
  }
}

// ========================================
// 🚀 شروع Background Sync
// ========================================
export function startBackgroundSync(): void {
  if (typeof window === "undefined") return

  if (syncInterval) {
    console.log("[Sync] Already running")
    return
  }

  console.log("[Sync] 🚀 Starting background sync (5s interval)...")

  // Initialize BroadcastChannel
  initBroadcastChannel()

  // اولین sync فوری
  syncWithServer().catch(console.error)

  // هر 5 ثانیه
  syncInterval = setInterval(() => {
    syncWithServer().catch(console.error)
  }, SYNC_INTERVAL)

  // Event listeners
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
  }
}

// ========================================
// ⏸️ توقف Background Sync
// ========================================
export function stopBackgroundSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log("[Sync] ⏸️ Stopped")
  }

  if (broadcastChannel) {
    broadcastChannel.close()
    broadcastChannel = null
  }

  if (typeof window !== "undefined") {
    window.removeEventListener("online", handleOnline)
    window.removeEventListener("offline", handleOffline)
  }
}

// ========================================
// 🔄 Main Sync Logic
// ========================================
async function syncWithServer(): Promise<void> {
    const isOnline = await checkRealConnectivity()  // ← اینجا تغییر کرد
  if (!isOnline || isSyncing) {
    return
  }

  isSyncing = true

  try {
    // 1️⃣ پردازش صف write operations
    await processWriteQueue()

    // 2️⃣ دریافت تغییرات از سرور
    await fetchServerUpdates()

    lastServerSync = Date.now()
  } catch (error) {
    console.error("[Sync] Error:", error)
  } finally {
    isSyncing = false
  }
}

// ========================================
// ✍️ پردازش صف نوشتن
// ========================================
async function processWriteQueue(): Promise<void> {
  const queue = getQueue()
  if (queue.length === 0) return

  console.log(`[Sync] 📝 Processing ${queue.length} write operations...`)

  const supabase = createClient()
  const remainingOps: SyncOperation[] = []
  let successCount = 0

  for (const operation of queue) {
    try {
      await executeOperation(supabase, operation)
      console.log(`[Sync] ✅ ${operation.type} success`)
      successCount++
    } catch (error: any) {
      console.error(`[Sync] ❌ ${operation.type} failed:`, error.message)

      operation.retries = (operation.retries || 0) + 1
      operation.lastError = error.message

      if (operation.retries < MAX_RETRIES) {
        remainingOps.push(operation)
      } else {
        console.error(`[Sync] ⛔ Max retries reached for ${operation.id}`)
        notifyError(`عملیات ${getOperationLabel(operation.type)} ناموفق بود`)
      }
    }
  }

  saveQueue(remainingOps)
  broadcastMessage("QUEUE_UPDATED")

  if (successCount > 0) {
    console.log(`[Sync] ✨ ${successCount} operations synced!`)

    // Trigger UI refresh after successful sync
    const userId = getUserId()
    if (userId) {
      const cached = getLocalCache(userId)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("data-refreshed", { detail: cached }))
      }
      broadcastMessage("CACHE_UPDATED", cached)
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sync-complete"))
    }
    broadcastMessage("SYNC_COMPLETE")
  }
}

// ========================================
// 📥 دریافت تغییرات از سرور
// ========================================
async function fetchServerUpdates(): Promise<void> {
  const userId = getUserId()
  if (!userId) return

  try {
    const supabase = createClient()

    // ========================================
    // 1️⃣ دریافت Installments فعال
    // ========================================
    const { data: serverData, error } = await supabase
        .from("installments")
        .select(`
        *,
        installment_payments(*)
      `)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })

    if (error) throw error

    // Format data
    const formattedData: Installment[] = (serverData || []).map((inst: any) => ({
      ...inst,
      jalali_start_date: inst.jalali_start_date || (inst.start_date ? gregorianStringToJalaliString(inst.start_date) : ""),
      payments: (inst.installment_payments || [])
          .filter((p: any) => !p.deleted_at)
          .map((p: any) => ({
            ...p,
            jalali_due_date: p.jalali_due_date || (p.due_date ? gregorianStringToJalaliString(p.due_date) : ""),
          })),
    }))

    // Merge با لوکال
    const localData = getLocalCache(userId)
    const merged = mergeWithConflictResolution(localData, formattedData, userId)

    // بروزرسانی کش
    saveLocalCache(userId, merged)

    // Trigger UI refresh
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("data-refreshed", { detail: merged }))
    }
    broadcastMessage("CACHE_UPDATED", merged)

    console.log(`[Sync] 📥 Fetched ${formattedData.length} active items from server`)

    // ========================================
    // 2️⃣ دریافت Deleted Items (برای Trash)
    // ========================================
    const { data: deletedData, error: deletedError } = await supabase
        .from("installments")
        .select(`
        *,
        installment_payments(*)
      `)
        .eq("user_id", userId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(50)

    if (deletedError) {
      console.error("[Sync] Error fetching deleted items:", deletedError)
    } else {
      const formattedDeleted: Installment[] = (deletedData || []).map((inst: any) => ({
        ...inst,
        jalali_start_date: inst.jalali_start_date || (inst.start_date ? gregorianStringToJalaliString(inst.start_date) : ""),
        payments: (inst.installment_payments || []).map((p: any) => ({
          ...p,
          jalali_due_date: p.jalali_due_date || (p.due_date ? gregorianStringToJalaliString(p.due_date) : ""),
        })),
      }))

      saveDeletedCache(userId, formattedDeleted)
      console.log(`[Sync] 📥 Fetched ${formattedDeleted.length} deleted items from server`)
    }
  } catch (error) {
    console.error("[Sync] Error fetching server updates:", error)
  }
}

// ========================================
// 🔀 Merge با Last-Write-Wins
// ========================================
function mergeWithConflictResolution(
    local: Installment[],
    server: Installment[],
    userId: string
): Installment[] {
  const merged = new Map<string, Installment>()
  const queue = getQueue()

  // Server items (پایه)
  server.forEach((item) => merged.set(item.id, item))

  // Local items (با conflict resolution)
  local.forEach((localItem) => {
    const serverItem = merged.get(localItem.id)

    // اگه در صف هست، Local را اولویت بده (user در حال کار است)
    if (isInQueue(localItem.id, queue)) {
      console.log(`[Merge] 🔄 ${localItem.id} in queue - keeping local`)
      merged.set(localItem.id, localItem)
      return
    }

    // اگه سرور نداره، چک کن آیا جدید است یا پاک شده
    if (!serverItem) {
        console.log(`[Merge] 🗑️ ${localItem.id} deleted on server - removing`)
         return
    }

    // Last-Write-Wins
    const localTime = new Date(localItem.updated_at).getTime()
    const serverTime = new Date(serverItem.updated_at).getTime()

    if (localTime > serverTime) {
      console.log(`[Merge] 📝 ${localItem.id} local is newer - keeping local`)
      merged.set(localItem.id, localItem)

      // اضافه به صف برای sync
      addToQueue({
        type: "update",
        entityType: "installment",
        data: { ...localItem, user_id: userId },
      })
    } else {
      console.log(`[Merge] 📥 ${localItem.id} server is newer - using server`)
      merged.set(localItem.id, serverItem)
    }
  })

  return Array.from(merged.values())
}

// ========================================
// 🔧 Helper: اجرای عملیات
// ========================================
async function executeOperation(supabase: any, operation: SyncOperation): Promise<void> {
  switch (operation.type) {
    case "create":
    case "update":
      await upsertInstallment(supabase, operation.data)
      break

    case "soft_delete":
      await softDeleteInstallment(supabase, operation.data.id, operation.data.deleted_at)
      break

    case "restore":
      await restoreInstallment(supabase, operation.data.id)
      break

    case "hard_delete":
      await hardDeleteInstallment(supabase, operation.data.id)
      break

    case "toggle_payment":
      await togglePayment(supabase, operation.data)
      break
  }
}

async function upsertInstallment(supabase: any, data: any): Promise<void> {
  const { error: instError } = await supabase.from("installments").upsert({
    id: data.id,
    user_id: data.user_id,
    creditor_name: data.creditor_name,
    item_description: data.item_description,
    total_amount: data.total_amount,
    installment_amount: data.installment_amount,
    start_date: data.start_date,
    jalali_start_date: data.jalali_start_date,
    installment_count: data.installment_count,
    recurrence: data.recurrence,
    reminder_days: data.reminder_days,
    notes: data.notes,
    payment_time: data.payment_time,
    created_at: data.created_at,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  })

  if (instError) throw instError

  if (data.payments?.length > 0) {
    const paymentIds = data.payments.map((p: any) => p.id)

    await supabase
        .from("installment_payments")
        .delete()
        .eq("installment_id", data.id)
        .not("id", "in", `(${paymentIds.join(",")})`)

    const paymentsToUpsert = data.payments.map((p: any) => ({
      id: p.id,
      installment_id: data.id,
      due_date: p.due_date,
      jalali_due_date: p.jalali_due_date,
      amount: p.amount,
      is_paid: p.is_paid,
      paid_date: p.paid_date || null,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }))

    const { error: payError } = await supabase
        .from("installment_payments")
        .upsert(paymentsToUpsert, { onConflict: "id" })

    if (payError) throw payError
  }
}

async function softDeleteInstallment(supabase: any, id: string, deletedAt: string): Promise<void> {
  await supabase
      .from("installment_payments")
      .update({ deleted_at: deletedAt, updated_at: new Date().toISOString() })
      .eq("installment_id", id)

  const { error } = await supabase
      .from("installments")
      .update({ deleted_at: deletedAt, updated_at: new Date().toISOString() })
      .eq("id", id)

  if (error) throw error
}

async function restoreInstallment(supabase: any, id: string): Promise<void> {
  await supabase
      .from("installment_payments")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("installment_id", id)

  const { error } = await supabase
      .from("installments")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)

  if (error) throw error
}

async function hardDeleteInstallment(supabase: any, id: string): Promise<void> {
  await supabase.from("installment_payments").delete().eq("installment_id", id)

  const { error } = await supabase.from("installments").delete().eq("id", id)

  if (error) throw error
}

async function togglePayment(supabase: any, data: any): Promise<void> {
  const { error } = await supabase
      .from("installment_payments")
      .update({
        is_paid: data.isPaid,
        paid_date: data.paidDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.paymentId)

  if (error) throw error

  await supabase
      .from("installments")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.installmentId)
}

// ========================================
// 📝 صف عملیات
// ========================================
export function addToQueue(operation: Omit<SyncOperation, "id" | "timestamp" | "retries">): void {
  const queue = getQueue()

  const newOp: SyncOperation = {
    ...operation,
    id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`,
    timestamp: new Date().toISOString(),
    retries: 0,
  }

  queue.push(newOp)
  saveQueue(queue)

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("queue-updated"))
  }
  broadcastMessage("QUEUE_UPDATED")

  console.log(`[Queue] ➕ Added ${newOp.type} (Queue: ${queue.length})`)

  // فوری sync اگه آنلاین است
 if (!isSyncing) {
    checkRealConnectivity().then(isOnline => {
      if (isOnline) syncWithServer().catch(console.error)
    })
  }
}
export function getQueue(): SyncOperation[] {
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

// ========================================
// 💾 کش لوکال
// ========================================
function getLocalCache(userId: string): Installment[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(`installments-${userId}`)
  const installments = stored ? JSON.parse(stored) : []
  return installments.filter((i: Installment) => !i.deleted_at)
}

function saveLocalCache(userId: string, data: Installment[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(`installments-${userId}`, JSON.stringify(data))
}

function saveDeletedCache(userId: string, data: Installment[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(`deleted-installments-${userId}`, JSON.stringify(data))
}

export function getDeletedCache(userId: string): Installment[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(`deleted-installments-${userId}`)
  return stored ? JSON.parse(stored) : []
}

// ========================================
// 🔧 Helper Functions
// ========================================
function getUserId(): string | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem("auth_user")
  if (!stored) return null
  const user = JSON.parse(stored)
  return user?.id || null
}

function isInQueue(itemId: string, queue: SyncOperation[]): boolean {
  return queue.some((op) => op.data?.id === itemId || op.data?.installmentId === itemId)
}

function isRecentItem(item: Installment): boolean {
  const itemTime = new Date(item.created_at).getTime()
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000
  return now - itemTime < fiveMinutes
}

function getOperationLabel(type: string): string {
  const labels: Record<string, string> = {
    create: "ایجاد",
    update: "ویرایش",
    delete: "حذف",
    soft_delete: "حذف موقت",
    hard_delete: "حذف دائم",
    restore: "بازیابی",
    toggle_payment: "تغییر وضعیت پرداخت",
  }
  return labels[type] || type
}

function notifyError(message: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
        new CustomEvent("sync-error", {
          detail: { message },
        })
    )
  }
}

// ========================================
// 🌐 Event Handlers
// ========================================
function handleOnline(): void {
  console.log("[Sync] 🌐 مرورگر آنلاین شد - چک واقعی...")
  resetConnectivityCache()
  checkRealConnectivity().then(isOnline => {  // ← اینجا تغییر کرد
    if (isOnline) {
      console.log("[Sync] ✅ اینترنت واقعی تأیید شد")
      syncWithServer().catch(console.error)
    } else {
      console.log("[Sync] ⚠️ مرورگر آنلاین ولی Supabase در دسترس نیست")
    }
  })
}

function handleOffline(): void {
  console.log("[Sync] 📴 Network offline")
}

// ========================================
// 📊 وضعیت Sync
// ========================================
export function getSyncState(): SyncState {
  return {
    isSyncing,
    lastSyncTime: lastServerSync,
    queueSize: getQueueSize(),
  }
}
