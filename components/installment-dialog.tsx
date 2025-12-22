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
import { Trash2 } from "lucide-react"
import { gregorianToJalali, jalaliToGregorian } from "@/lib/persian-calendar"
import { PersianDatePicker } from "@/components/persian-date-picker"
import { saveInstallment, deleteInstallment } from "@/lib/data-sync"

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
  const [installmentAmount, setInstallmentAmount] = useState("")
  const [startDatePersian, setStartDatePersian] = useState({ year: 1403, month: 1, day: 1 })
  const [installmentCount, setInstallmentCount] = useState("12")
  const [recurrence, setRecurrence] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly")
  const [paymentTime, setPaymentTime] = useState("09:00")
  const [reminderDays, setReminderDays] = useState("0")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (installment) {
      setCreditorName(installment.creditor_name)
      setItemDescription(installment.item_description)
      setTotalAmount(installment.total_amount.toString())
      setInstallmentAmount(installment.installment_amount.toString())

      // Convert Gregorian to Persian
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
      setInstallmentAmount("")

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
    recurr: "daily" | "weekly" | "monthly" | "yearly",
    amount: number,
  ): InstallmentPayment[] {
    const payments: InstallmentPayment[] = []
    const currentDate = new Date(start)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      // Convert Persian date to Gregorian
      const [gy, gm, gd] = jalaliToGregorian(startDatePersian.year, startDatePersian.month, startDatePersian.day)
      const startDate = `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`

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

      await saveInstallment(userId, installmentData)

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

  async function handleDelete() {
    if (!installment) return
    if (!confirm("آیا از حذف این قسط اطمینان دارید؟")) return

    setLoading(true)

    try {
      await deleteInstallment(userId, installment.id)

      toast({
        title: "قسط حذف شد",
        description: navigator.onLine ? "قسط حذف و همگام‌سازی شد" : "قسط محلی حذف شد",
      })

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-3xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
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

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <div>
              <Label htmlFor="total" className="text-sm">
                مبلغ کل (تومان)
              </Label>
              <Input
                id="total"
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="50,000,000"
                className="text-right mt-2"
              />
            </div>

            <div>
              <Label htmlFor="installment" className="text-sm">
                مبلغ هر قسط (تومان) *
              </Label>
              <Input
                id="installment"
                type="number"
                value={installmentAmount}
                onChange={(e) => setInstallmentAmount(e.target.value)}
                placeholder="5,000,000"
                required
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
                <Label htmlFor="count" className="text-sm">
                  تعداد اقساط *
                </Label>
                <Input
                  id="count"
                  type="number"
                  min="1"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                  placeholder="12"
                  required
                  className="text-right mt-2"
                />
              </div>

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
                  </SelectContent>
                </Select>
              </div>
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
            {installment && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="gap-2 w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            )}
            <Button type="submit" disabled={loading} className="rounded-full px-8 w-full sm:w-auto">
              {loading ? "در حال ذخیره..." : installment ? "ذخیره تغییرات" : "ایجاد قسط"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
