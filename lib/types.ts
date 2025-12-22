export interface Installment {
  id: string
  user_id: string
  creditor_name: string
  item_description: string
  total_amount: number
  start_date: string // تاریخ شروع (gregorian)
  installment_count: number // تعداد اقساط
  recurrence: "daily" | "weekly" | "monthly" | "yearly" // دوره تکرار
  payment_time?: string // ساعت و دقیقه پرداخت (HH:MM)
  installment_amount: number
  payments: InstallmentPayment[]
  reminder_days: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface InstallmentPayment {
  id: string
  due_date: string // تاریخ سررسید این قسط
  amount: number
  is_paid: boolean
  paid_date?: string
}

export interface PaymentHistory {
  id: string
  installment_id: string
  amount: number
  paid_date: string
  created_at: string
}
