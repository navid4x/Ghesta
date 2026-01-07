"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Installment, InstallmentPayment } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Trash2, SaveIcon, Calculator } from "lucide-react"
import {
  gregorianToJalali,
  jalaliToGregorian,
  toPersianDigits,
  formatCurrencyPersian,
  parseCurrencyInput,
} from "@/lib/persian-calendar"
import { PersianDatePicker } from "@/components/persian-date-picker"
import { saveInstallment, deleteInstallment } from "@/lib/data-sync"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"

interface InstallmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  installment: Installment | null
  initialDate?: string
  onSuccess: () => void
  userId: string
}

export function InstallmentDialog({
  open,
  onOpenChange,
  installment,
  initialDate,
  onSuccess,
  userId,
}: InstallmentDialogProps) {
  const { toast } = useToast()
  const [creditorName, setCreditorName] = useState("")
  const [itemDescription, setItemDescription] = useState("")
  const [totalAmount, setTotalAmount] = useState("")
  const [totalAmountDisplay, setTotalAmountDisplay] = useState("")
  const [installmentAmount, setInstallmentAmount] = useState("0")
  const [startDatePersian, setStartDatePersian] = useState({ year: 1403, month: 1, day: 1 })
  const [installmentCount, setInstallmentCount] = useState("12")
  const [recurrence, setRecurrence] = useState<"daily" | "weekly" | "monthly" | "yearly" | "never">("monthly")
  const [paymentTime, setPaymentTime] = useState("09:00")
  const [reminderDays, setReminderDays] = useState("0")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const total = Number(totalAmount) || 0
    const count = recurrence === "never" ? 1 : Number(installmentCount) || 1

    if (total > 0 && count > 0) {
      const perInstallment = Math.ceil(total / count)
      setInstallmentAmount(perInstallment.toString())
    } else {
      setInstallmentAmount("0")
    }
  }, [totalAmount, installmentCount, recurrence])

  useEffect(() => {
    if (recurrence === "never") {
      setInstallmentCount("1")
    }
  }, [recurrence])

  useEffect(() => {
    if (installment) {
      setCreditorName(installment.creditor_name)
      setItemDescription(installment.item_description)
      setTotalAmount(installment.total_amount.toString())
      setTotalAmountDisplay(formatCurrencyPersian(installment.total_amount))

      const [year, month, day] = installment.start_date.split("-").map(Number)
      const [jy, jm, jd] = gregorianToJalali(year, month, day)
      setStartDatePersian({ year: jy, month: jm, day: jd })

      setInstallmentCount(installment.installment_count.toString())
      setRecurrence(installment.recurrence)
      setPaymentTime(installment.payment_time || "09:00")
      setReminderDays(installment.reminder_days.toString())
      setNotes(installment.notes || "")
    } else {
      setCreditorName("")
      setItemDescription("")
      setTotalAmount("")
      setTotalAmountDisplay("")

      if (initialDate) {
        const [year, month, day] = initialDate.split("-").map(Number)
        const [jy, jm, jd] = gregorianToJalali(year, month, day)
        setStartDatePersian({ year: jy, month: jm, day: jd })
      } else {
        const today = new Date()
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate())
        setStartDatePersian({ year: jy, month: jm, day: jd })
      }

      setInstallmentCount("12")
      setRecurrence("monthly")
      setPaymentTime("09:00")
      setReminderDays("0")
      setNotes("")
    }
  }, [installment, initialDate])

  function generatePayments(
    start: string,
    count: number,
    recurr: "daily" | "weekly" | "monthly" | "yearly" | "never",
    amount: number,
  ): InstallmentPayment[] {
    const payments: InstallmentPayment[] = []
    const currentDate = new Date(start)

    if (recurr === "never") {
      payments.push({
        id: crypto.randomUUID(),
        due_date: currentDate.toISOString().split("T")[0],
        amount: amount,
        is_paid: false,
        paid_date: null,
      })
      return payments
    }

    for (let i = 0; i < count; i++) {
      payments.push({
        id: crypto.randomUUID(),
        due_date: currentDate.toISOString().split("T")[0],
        amount: amount,
        is_paid: false,
      })

      switch (recurr) {
        case "daily":
          currentDate.setDate(currentDate.getDate() + 1)
          break
        case "weekly":
          currentDate.setDate(currentDate.getDate() + 7)
          break
        case "monthly":
          currentDate.setMonth(currentDate.getMonth() + 1)
          break
        case "yearly":
          currentDate.setFullYear(currentDate.getFullYear() + 1)
          break
      }
    }

    return payments
  }

  function updateExistingPayments(
    existingPayments: InstallmentPayment[],
    newStartDate: string,
    newCount: number,
    newRecurrence: "daily" | "weekly" | "monthly" | "yearly" | "never",
    newAmount: number,
  ): InstallmentPayment[] {
    const sortedExisting = [...existingPayments].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    )

    const newDates: string[] = []
    const currentDate = new Date(newStartDate)

    if (newRecurrence === "never") {
      newDates.push(currentDate.toISOString().split("T")[0])
    } else {
      for (let i = 0; i < newCount; i++) {
        newDates.push(currentDate.toISOString().split("T")[0])
        switch (newRecurrence) {
          case "daily":
            currentDate.setDate(currentDate.getDate() + 1)
            break
          case "weekly":
            currentDate.setDate(currentDate.getDate() + 7)
            break
          case "monthly":
            currentDate.setMonth(currentDate.getMonth() + 1)
            break
          case "yearly":
            currentDate.setFullYear(currentDate.getFullYear() + 1)
            break
        }
      }
    }

    const newPayments: InstallmentPayment[] = []
    const effectiveCount = newRecurrence === "never" ? 1 : newCount

    for (let i = 0; i < effectiveCount; i++) {
      if (i < sortedExisting.length) {
        newPayments.push({
          id: sortedExisting[i].id,
          due_date: newDates[i],
          amount: newAmount,
          is_paid: sortedExisting[i].is_paid,
          paid_date: sortedExisting[i].paid_date,
        })
      } else {
        newPayments.push({
          id: crypto.randomUUID(),
          due_date: newDates[i],
          amount: newAmount,
          is_paid: false,
        })
      }
    }

    return newPayments
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const [gy, gm, gd] = jalaliToGregorian(startDatePersian.year, startDatePersian.month, startDatePersian.day)
      const startDate = `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`

      if (recurrence === "never" && Number(installmentCount) !== 1) {
        setInstallmentCount("1")
      }

      const installmentData: Installment = installment
        ? {
            ...installment,
            creditor_name: creditorName,
            item_description: itemDescription,
            total_amount: Number(totalAmount),
            installment_amount: Number(installmentAmount),
            start_date: startDate,
            installment_count: Number(installmentCount),
            recurrence: recurrence,
            payment_time: paymentTime,
            reminder_days: Number(reminderDays),
            notes,
            updated_at: new Date().toISOString(),
            payments: updateExistingPayments(
              installment.payments,
              startDate,
              Number(installmentCount),
              recurrence,
              Number(installmentAmount),
            ),
          }
        : {
            id: crypto.randomUUID(),
            user_id: userId,
            creditor_name: creditorName,
            item_description: itemDescription,
            total_amount: Number(totalAmount),
            installment_amount: Number(installmentAmount),
            start_date: startDate,
            installment_count: Number(installmentCount),
            recurrence: recurrence,
            payments: generatePayments(startDate, Number(installmentCount), recurrence, Number(installmentAmount)),
            reminder_days: Number(reminderDays),
            notes,
            payment_time: paymentTime,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

      await saveInstallment(installmentData)

      toast({
        title: installment ? "قسط ویرایش شد" : "قسط ایجاد شد",
        description: navigator.onLine ? "تغییرات ذخیره و همگام‌سازی شد" : "تغییرات محلی ذخیره شد",
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Error saving installment:", error)
      toast({
        title: "خطا",
        description: "مشکلی در ذخیره‌سازی پیش آمد",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!installment) return

    setLoading(true)

    try {
      await deleteInstallment(installment.id)

      toast({
        title: "قسط حذف شد",
        description: navigator.onLine ? "قسط حذف و همگام‌سازی شد" : "قسط محلی حذف شد",
      })

      setShowDeleteConfirm(false)
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Error deleting installment:", error)
      toast({
        title: "خطا",
        description: "مشکلی در حذف پیش آمد",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  function handleTotalAmountChange(value: string) {
    const numeric = parseCurrencyInput(value)
    setTotalAmount(numeric.toString())
    setTotalAmountDisplay(numeric > 0 ? formatCurrencyPersian(numeric) : "")
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby={undefined}
          className="max-w-[95vw] md:max-w-3xl max-h-[90vh] overflow-y-auto p-4 md:p-6"
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl md:text-2xl text-right flex-1">
                {installment ? "ویرایش قسط" : "افزودن قسط جدید"}
              </DialogTitle>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <div>
                <Label htmlFor="creditor" className="text-sm">
                  نام طلبکار *
                </Label>
                <Input
                  id="creditor"
                  value={creditorName}
                  onChange={(e) => setCreditorName(e.target.value)}
                  placeholder="مثال: بانک ملی"
                  required
                  className="text-right mt-2"
                />
              </div>

              <div>
                <Label htmlFor="item" className="text-sm">
                  شرح خرید/وام
                </Label>
                <Input
                  id="item"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="مثال: وام خودرو"
                  className="text-right mt-2"
                />
              </div>
            </div>

            <div className="space-y-4 p-3 md:p-4 rounded-lg bg-muted/30 border-2 border-dashed">
              <h3 className="font-semibold text-base md:text-lg">برنامه پرداخت</h3>

              <div>
                <Label htmlFor="startDate" className="text-sm">
                  تاریخ شروع *
                </Label>
                <div className="mt-2">
                  <PersianDatePicker value={startDatePersian} onChange={setStartDatePersian} />
                </div>
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div>
                  <Label htmlFor="recurrence" className="text-sm">
                    دوره تکرار *
                  </Label>
                  <Select value={recurrence} onValueChange={(v) => setRecurrence(v as any)}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">روزانه</SelectItem>
                      <SelectItem value="weekly">هفتگی</SelectItem>
                      <SelectItem value="monthly">ماهانه</SelectItem>
                      <SelectItem value="yearly">سالانه</SelectItem>
                      <SelectItem value="never">هرگز</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recurrence !== "never" && (
                  <div>
                    <Label htmlFor="count" className="text-sm">
                      تعداد اقساط *
                    </Label>
                    <Input
                      id="count"
                      type="text"
                      min="1"
                      value={toPersianDigits(installmentCount)}
                      onChange={(e) => setInstallmentCount(parseCurrencyInput(e.target.value).toString())}
                      placeholder="۱۲"
                      required
                      className="text-right mt-2"
                      dir="rtl"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div>
                  <Label htmlFor="time" className="text-sm">
                    ساعت پرداخت
                  </Label>
                  <Input
                    className="mt-2"
                    id="time"
                    type="time"
                    value={paymentTime}
                    onChange={(e) => setPaymentTime(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="reminder" className="text-sm">
                    یادآوری
                  </Label>
                  <Select value={reminderDays} onValueChange={setReminderDays}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">هرگز</SelectItem>
                      <SelectItem value="1">1 روز قبل</SelectItem>
                      <SelectItem value="2">2 روز قبل</SelectItem>
                      <SelectItem value="3">3 روز قبل</SelectItem>
                      <SelectItem value="5">5 روز قبل</SelectItem>
                      <SelectItem value="7">یک هفته قبل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-3 md:p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-base md:text-lg text-blue-900 dark:text-blue-100">
                  محاسبه خودکار مبلغ
                </h3>
              </div>

              <div>
                <Label htmlFor="total" className="text-sm">
                  مبلغ کل (تومان) *
                </Label>
                <Input
                  id="total"
                  type="text"
                  value={totalAmountDisplay}
                  onChange={(e) => handleTotalAmountChange(e.target.value)}
                  placeholder="۵۰,۰۰۰,۰۰۰"
                  required
                  className="text-right mt-2"
                  dir="rtl"
                />
              </div>

              {Number(installmentAmount) > 0 && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-muted-foreground mb-1">مبلغ هر قسط:</p>
                  <p className="text-lg md:text-xl font-bold text-green-700 dark:text-green-400" dir="rtl">
                    {formatCurrencyPersian(Number(installmentAmount))} تومان
                  </p>
                  <p dir="rtl" className="text-xs text-muted-foreground mt-1">
                    (محاسبه : {toPersianDigits(recurrence === "never" ? 1 : installmentCount)} ÷{" "}
                    {formatCurrencyPersian(Number(totalAmount))})
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="notes" className="text-sm">
                یادداشت
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="یادداشت‌های اضافی..."
                className="text-right mt-2"
                rows={3}
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="submit" disabled={loading} className="rounded-full px-8 w-full sm:w-auto">
                <SaveIcon className="h-4 w-4" />
                {loading ? "در حال ذخیره..." : installment ? "ذخیره تغییرات" : "ایجاد قسط"}
              </Button>
              {installment && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDeleteConfirmed}
        title="حذف قسط"
        description={`آیا از حذف قسط "${installment?.creditor_name || ""}" اطمینان دارید؟ این عملیات قابل بازگشت نیست و تمام ${installment?.installment_count || 0} دوره پرداخت حذف خواهد شد.`}
        loading={loading}
      />
    </>
  )
}
