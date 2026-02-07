export interface Installment {
  id: string
  user_id: string
  creditor_name: string
  item_description: string
  total_amount: number
  start_date: string // تاریخ میلادی (برای compatibility)
  jalali_start_date: string // تاریخ شمسی (YYYY/MM/DD)
  installment_count: number
  recurrence: "daily" | "weekly" | "monthly" | "yearly" | "never"
  payment_time?: string
  installment_amount: number
  payments: InstallmentPayment[]
  reminder_days: number
  notes?: string
  created_at: string
  updated_at: string
  deleted_at?: string // برای Soft Delete
}

export interface InstallmentPayment {
  id: string
  due_date: string // تاریخ میلادی (برای compatibility)
  jalali_due_date: string // تاریخ شمسی (YYYY/MM/DD)
  amount: number
  is_paid: boolean
  paid_date?: string
  deleted_at?: string // برای Soft Delete
}

export interface PaymentHistory {
  id: string
  installment_id: string
  amount: number
  paid_date: string
  created_at: string
}

export type SyncOperationType = 
  | "create" 
  | "update" 
  | "toggle_payment"
  | "soft_delete"
  | "hard_delete"
  | "restore"
