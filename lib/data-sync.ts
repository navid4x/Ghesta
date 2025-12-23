import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"

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
export async function loadInstallments(userId: string): Promise<Installment[]> {
  const localData = getLocalInstallments(userId)
  console.log("[v0] Loading installments for user:", userId)
  console.log("[v0] Local installments count:", localData.length)

  if (!navigator.onLine) {
    console.log("[v0] Offline - using local data only")
    return localData
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.log("[v0] No authenticated user - using local data")
      return localData
    }

    const realUserId = user.id
    console.log("[v0] Authenticated user ID:", realUserId)

    // اگر userId متفاوت است، migrate کن
    if (userId !== realUserId && localData.length > 0) {
      console.log("[v0] Migrating data from", userId, "to", realUserId)
      const migratedData = localData.map((inst) => ({
        ...inst,
        user_id: realUserId,
        id: inst.id.startsWith("offline_")
          ? `${realUserId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          : inst.id,
      }))

      saveLocalInstallments(realUserId, migratedData)
      localStorage.removeItem(`installments-${userId}`)

      migratedData.forEach((inst) => {
        queueSyncOperation({
          type: "create",
          entityType: "installment",
          data: inst,
        })
      })
    }

    await processSyncQueue(realUserId)

    console.log("[v0] Fetching from server...")
    const serverData = await fetchFromServer(realUserId)
    console.log("[v0] Server installments count:", serverData.length)
    console.log(
      "[v0] Server installments:",
      serverData.map((i) => ({ id: i.id, name: i.creditor_name })),
    )

    const merged = mergeInstallments(getLocalInstallments(realUserId), serverData, realUserId)
    console.log("[v0] Merged installments count:", merged.length)

    saveLocalInstallments(realUserId, merged)

    return merged
  } catch (error) {
    console.error("[v0] Error loading installments:", error)
    return localData
  }
}

// ============================================
// 💾 SAVE INSTALLMENT
// ============================================
export async function saveInstallment(userId: string, installment: Installment): Promise<void> {
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
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await saveToServer(user.id, { ...installment, user_id: user.id })
        return
      }
    } catch (error) {
      // Silent - queue for later
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
export async function deleteInstallment(userId: string, installmentId: string): Promise<void> {
  console.log("[v0] Deleting installment:", { userId, installmentId })

  const installments = getLocalInstallments(userId)
  const filtered = installments.filter((i) => i.id !== installmentId)

  console.log("[v0] Before delete count:", installments.length, "After:", filtered.length)

  saveLocalInstallments(userId, filtered)

  if (navigator.onLine) {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        console.log("[v0] Deleting from server with user ID:", user.id)
        await deleteFromServer(installmentId)
        console.log("[v0] Deleted from server successfully")
        return
      }
    } catch (error) {
      console.error("[v0] Failed to delete from server:", error)
    }
  }

  console.log("[v0] Queuing delete operation for later sync")
  queueSyncOperation({
    type: "delete",
    entityType: "installment",
    data: { id: installmentId },
  })
}

// ============================================
// ✅ TOGGLE PAYMENT
// ============================================
export async function togglePayment(userId: string, installmentId: string, paymentId: string): Promise<void> {
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
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await updatePaymentOnServer(paymentId, payment.is_paid, payment.paid_date)
        await updateInstallmentTimestamp(installmentId)
        return
      }
    } catch (error) {
      // Silent
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

  const failedOps: SyncOperation[] = []

  for (const operation of queue) {
    try {
      switch (operation.type) {
        case "create":
        case "update":
          const installmentData = {
            ...operation.data,
            user_id: realUserId,
            id: operation.data.id.startsWith("offline_")
              ? `${realUserId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              : operation.data.id,
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
      if (!error.message?.includes("row-level security")) {
        failedOps.push(operation)
      }
    }
  }

  if (failedOps.length > 0) {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failedOps))
  } else {
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
      if (localItem.id.startsWith("offline_") && realUserId) {
        queueSyncOperation({
          type: "create",
          entityType: "installment",
          data: {
            ...localItem,
            user_id: realUserId,
            id: `${realUserId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          },
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
