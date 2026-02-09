import { createClient } from "@/lib/supabase/client"
import type { Installment } from "@/lib/types"
import { getCurrentUser } from "@/lib/auth-handler"
import { addToQueue, getQueue } from "@/lib/background-sync"
import { gregorianStringToJalaliString } from "@/lib/persian-calendar"

// ========================================
// 📥 LOAD INSTALLMENTS - از کش
// ========================================
export async function loadInstallments(): Promise<Installment[]> {
  const user = await getCurrentUser()

  if (!user) {
    console.log("[Data] No authenticated user")
    return []
  }

  const userId = user.id

  // ✅ خواندن از کش (سریع!)
  const cached = getLocalCache(userId)
  console.log("[Data] 📂 Loaded from cache:", cached.length)

  return cached
}

// ========================================
// 💾 SAVE INSTALLMENT
// ========================================
export async function saveInstallment(installment: Installment): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  // 1️⃣ بروزرسانی کش فوری
  const installments = getLocalCache(userId)
  const existingIndex = installments.findIndex((i) => i.id === installment.id)

  installment.updated_at = new Date().toISOString()

  if (existingIndex >= 0) {
    installments[existingIndex] = installment
  } else {
    installments.push(installment)
  }

  saveLocalCache(userId, installments)

  console.log("[Data] ⚡ Saved to cache (instant!)")

  // 2️⃣ اضافه به صف
  addToQueue({
    type: existingIndex >= 0 ? "update" : "create",
    entityType: "installment",
    data: { ...installment, user_id: userId },
  })

  // 3️⃣ Broadcast به تب‌های دیگر
  window.dispatchEvent(new CustomEvent("data-refreshed", { detail: installments }))
}

// ========================================
// 🗑️ SOFT DELETE
// ========================================
export async function deleteInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id
  const now = new Date().toISOString()

  console.log("[Delete] Soft deleting:", installmentId)

  // 1️⃣ حذف از کش فوری
  const installments = getLocalCache(userId)
  const filtered = installments.filter((i) => i.id !== installmentId)

  saveLocalCache(userId, filtered)

  console.log("[Delete] ⚡ Removed from cache (instant!)")

  // 2️⃣ اضافه به صف
  addToQueue({
    type: "soft_delete",
    entityType: "installment",
    data: {
      id: installmentId,
      deleted_at: now,
      updated_at: now,
    },
  })

  // 3️⃣ Broadcast
  window.dispatchEvent(new CustomEvent("data-refreshed", { detail: filtered }))
}

// ========================================
// 🔄 RESTORE
// ========================================
export async function restoreInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  // 1️⃣ گرفتن از deleted items
  const deletedItems = await getDeletedInstallments()
  const installment = deletedItems.find((i) => i.id === installmentId)

  if (!installment) return

  // 2️⃣ پاک کردن deleted_at
  delete installment.deleted_at
  installment.updated_at = new Date().toISOString()

  installment.payments.forEach((payment) => {
    delete payment.deleted_at
  })

  // 3️⃣ اضافه به کش
  const installments = getLocalCache(userId)
  installments.push(installment)

  saveLocalCache(userId, installments)

  const stored2 = localStorage.getItem(`deleted-installments-${userId}`)
  const deletedInstallments = stored2 ? JSON.parse(stored2) : []
  const filteredDeleted = deletedInstallments.filter((i: Installment) => i.id !== installmentId)

  localStorage.setItem(`deleted-installments-${userId}`, JSON.stringify(filteredDeleted))

  console.log("[Data] ⚡ Restored to cache (instant!)")

  // 4️⃣ اضافه به صف
  addToQueue({
    type: "restore",
    entityType: "installment",
    data: {
      id: installmentId,
      updated_at: installment.updated_at,
    },
  })

  // 5️⃣ Broadcast
  window.dispatchEvent(new CustomEvent("data-refreshed", { detail: installments }))
}

// ========================================
// 💀 HARD DELETE
// ========================================
export async function hardDeleteInstallment(installmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  const stored2 = localStorage.getItem(`deleted-installments-${userId}`)
  const deletedInstallments = stored2 ? JSON.parse(stored2) : []
  const filteredDeleted = deletedInstallments.filter((i: Installment) => i.id !== installmentId)

  localStorage.setItem(`deleted-installments-${userId}`, JSON.stringify(filteredDeleted))

  // // 1️⃣ حذف از همه جا (cache + deleted items)
  // const stored = localStorage.getItem(`installments-${userId}`)
  // const installments = stored ? JSON.parse(stored) : []
  // const filtered = installments.filter((i: Installment) => i.id !== installmentId)
  //
  // localStorage.setItem(`installments-${userId}`, JSON.stringify(filtered))

  console.log("[Data] ⚡ Hard deleted from cache (instant!)")

  // 2️⃣ اضافه به صف
  addToQueue({
    type: "hard_delete",
    entityType: "installment",
    data: { id: installmentId },
  })
}

// ========================================
// ✅ TOGGLE PAYMENT
// ========================================
export async function togglePayment(installmentId: string, paymentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const userId = user.id

  // 1️⃣ بروزرسانی کش
  const installments = getLocalCache(userId)
  const installment = installments.find((i) => i.id === installmentId)
  if (!installment) return

  const payment = installment.payments.find((p) => p.id === paymentId)
  if (!payment) return

  payment.is_paid = !payment.is_paid
  payment.paid_date = payment.is_paid ? new Date().toISOString().split("T")[0] : undefined
  installment.updated_at = new Date().toISOString()

  saveLocalCache(userId, installments)

  console.log("[Data] ⚡ Payment toggled in cache (instant!)")

  // 2️⃣ اضافه به صف
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

  // 3️⃣ Broadcast
  window.dispatchEvent(new CustomEvent("data-refreshed", { detail: installments }))
}

// ========================================
// ↩️ UNDO LAST PAYMENT
// ========================================
export async function undoLastPayment(installmentId: string): Promise<{ success: boolean; payment?: any }> {
  const user = await getCurrentUser()
  if (!user) return { success: false }

  const userId = user.id

  const installments = getLocalCache(userId)
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

  saveLocalCache(userId, installments)

  console.log("[Data] ⚡ Undo payment in cache (instant!)")

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

  window.dispatchEvent(new CustomEvent("data-refreshed", { detail: installments }))

  return { success: true, payment: lastPaidPayment }
}

// ========================================
// 📊 GET LAST PAID PAYMENT
// ========================================
export function getLastPaidPayment(installment: Installment): any | null {
  if (!installment.payments || !Array.isArray(installment.payments)) {
    return null
  }

  const paidPayments = installment.payments
      .filter((p) => p.is_paid && !p.deleted_at)
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

  return paidPayments.length > 0 ? paidPayments[0] : null
}

// ========================================
// 📊 GET DELETED ITEMS
// ========================================
export async function getDeletedInstallments(): Promise<Installment[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const userId = user.id

  // ✅ خواندن از کش (فوری!)
  const { getDeletedCache } = await import("@/lib/background-sync")
  const cached = getDeletedCache(userId)

  console.log("[Data] 📂 Loaded deleted items from cache:", cached.length)

  return cached
}
// ========================================
// 💾 کش لوکال (Helpers)
// ========================================
function getLocalCache(userId: string): Installment[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(`installments-${userId}`)
  const installments = stored ? JSON.parse(stored) : []
  return installments.filter((i: Installment) => !i.deleted_at)
}

function saveLocalCache(userId: string, installments: Installment[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(`installments-${userId}`, JSON.stringify(installments))
}

// ========================================
// 📊 وضعیت صف
// ========================================
export function getPendingOperationsCount(): number {
  return getQueue().length
}