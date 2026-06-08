"use client"

import type React from "react"
import {useCallback, useEffect, useState} from "react"
import {Card} from "@/components/ui/card"
import {Button} from "@/components/ui/button"
import {Badge} from "@/components/ui/badge"
import {Progress} from "@/components/ui/progress"
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {
  AlertCircle,
  Banknote,
  Calculator,
  CalendarDays,
  CircleDollarSign,
  List,
  Plus,
  Trash2,
  Undo2,
  TrendingDown,
  Clock,
} from "lucide-react"
import type {Installment} from "@/lib/types"
import {InstallmentDialog} from "./installment-dialog"
import {CalendarGrid} from "./calendar-grid"
import {TrashDialog} from "./trash-dialog"
import {LoanCalculator} from "./loan-calculator"
import {formatCurrencyPersian, gregorianToJalali, persianMonths, toPersianDigits} from "@/lib/persian-calendar"
import {getLastPaidPayment, loadInstallments, togglePayment, undoLastPayment} from "@/lib/data-sync"
import {startBackgroundSync, stopBackgroundSync} from "@/lib/background-sync"
import {ConfirmUndoDialog} from "./confirm-undo-dialog"

interface InstallmentDashboardProps {
  userId: string
}

export function InstallmentDashboard({ userId }: InstallmentDashboardProps) {
  const [installments, setInstallments] = useState<Installment[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined)
  const [activeView, setActiveView] = useState("list")
  const [loading, setLoading] = useState(true)
  const [undoDialogOpen, setUndoDialogOpen] = useState(false)
  const [undoInstallment, setUndoInstallment] = useState<Installment | null>(null)
  const [trashDialogOpen, setTrashDialogOpen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const data = await loadInstallments()
      setInstallments(data)
    } catch (error) {
      console.error("[v0] Error loading installments:", error)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))

    startBackgroundSync()

    const handleDataRefreshed = (event: CustomEvent<Installment[]>) => {
      console.log("[Dashboard] Data refreshed")
      setInstallments(event.detail)
    }

    const handleSyncComplete = () => {
      console.log("[Dashboard] Sync complete - reloading data")
      loadData()
    }

    window.addEventListener("data-refreshed", handleDataRefreshed as EventListener)
    window.addEventListener("sync-complete", handleSyncComplete)

    return () => {
      stopBackgroundSync()
      window.removeEventListener("data-refreshed", handleDataRefreshed as EventListener)
      window.removeEventListener("sync-complete", handleSyncComplete)
    }
  }, [userId, loadData])

  function handleAddInstallment(startDate?: string) {
    setSelectedInstallment(null)
    setInitialDate(startDate)
    setIsDialogOpen(true)
  }

  function handleEditInstallment(installment: Installment) {
    setSelectedInstallment(installment)
    setInitialDate(undefined)
    setIsDialogOpen(true)
  }

  async function handleTogglePayment(installmentId: string, paymentId: string) {
    await togglePayment(installmentId, paymentId)
    await loadData()
  }

  function formatCurrency(amount: number): string {
    return formatCurrencyPersian(amount)
  }

  function getDaysUntilDue(dueDate: string): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    const diffTime = due.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  function getPersianDate(gregorianDate: string, jalaliDate?: string): string {
    if (jalaliDate) {
      const [year, month, day] = jalaliDate.split("/").map(Number)
      return `${toPersianDigits(day)} ${persianMonths[month - 1]} ${toPersianDigits(year)}`
    }
    const [year, month, day] = gregorianDate.split("-").map(Number)
    const [jy, jm, jd] = gregorianToJalali(year, month, day)
    return `${toPersianDigits(jd)} ${persianMonths[jm - 1]} ${toPersianDigits(jy)}`
  }

  const todayGregorian = new Date()
  todayGregorian.setHours(0, 0, 0, 0)

  const [todayJalaliYear, todayJalaliMonth] = gregorianToJalali(
    todayGregorian.getFullYear(),
    todayGregorian.getMonth() + 1,
    todayGregorian.getDate(),
  )

  function getRecurrenceLabel(recurrence: string): string {
    const labels = {
      daily: "روزانه",
      weekly: "هفتگی",
      monthly: "ماهانه",
      yearly: "سالانه",
      never: "هرگز",
    }
    return labels[recurrence as keyof typeof labels] || recurrence
  }

  // ─── کل بدهی ───────────────────────────────────────────────
  const totalDebt = installments.reduce((sum, inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return sum
    const unpaidAmount = inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const dueDate = new Date(p.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate >= todayGregorian
      })
      .reduce((s, p) => s + (p.amount || 0), 0)
    return sum + unpaidAmount
  }, 0)

  // ─── بدهی ماه جاری ─────────────────────────────────────────
  const currentMonthDebt = installments.reduce((sum, inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return sum
    const unpaidAmount = inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const dueDate = new Date(p.due_date)
        dueDate.setHours(0, 0, 0, 0)
        if (dueDate < todayGregorian) return false
        const [dueJY, dueJM] = gregorianToJalali(
          dueDate.getFullYear(),
          dueDate.getMonth() + 1,
          dueDate.getDate(),
        )
        return dueJY === todayJalaliYear && dueJM === todayJalaliMonth
      })
      .reduce((s, p) => s + (p.amount || 0), 0)
    return sum + unpaidAmount
  }, 0)

  // ─── مانده بدهی ماه جاری (از امروز تا آخر ماه) ────────────
  const currentMonthRemaining = installments.reduce((sum, inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return sum
    const unpaidAmount = inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const dueDate = new Date(p.due_date)
        dueDate.setHours(0, 0, 0, 0)
        if (dueDate < todayGregorian) return false
        const [dueJY, dueJM] = gregorianToJalali(
          dueDate.getFullYear(),
          dueDate.getMonth() + 1,
          dueDate.getDate(),
        )
        return dueJY === todayJalaliYear && dueJM === todayJalaliMonth
      })
      .reduce((s, p) => s + (p.amount || 0), 0)
    return sum + unpaidAmount
  }, 0)

  // ─── مانده بدهی ۳ ماه آینده ────────────────────────────────
  const nextThreeMonthsDebt = installments.reduce((sum, inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return sum
    const unpaidAmount = inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const dueDate = new Date(p.due_date)
        dueDate.setHours(0, 0, 0, 0)
        if (dueDate < todayGregorian) return false
        const [dueJY, dueJM] = gregorianToJalali(
          dueDate.getFullYear(),
          dueDate.getMonth() + 1,
          dueDate.getDate(),
        )
        for (let i = 1; i <= 3; i++) {
          let targetMonth = todayJalaliMonth + i
          let targetYear = todayJalaliYear
          if (targetMonth > 12) {
            targetMonth -= 12
            targetYear += 1
          }
          if (dueJY === targetYear && dueJM === targetMonth) return true
        }
        return false
      })
      .reduce((s, p) => s + (p.amount || 0), 0)
    return sum + unpaidAmount
  }, 0)

  // ─── سررسید این هفته ───────────────────────────────────────
  const upcomingThisWeek = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    return inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const daysUntil = getDaysUntilDue(p.due_date)
        return daysUntil >= 0 && daysUntil <= 7
      })
      .map((p) => ({ ...inst, payment: p }))
  })

  const currentMonthInstallments = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    return inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const dueDate = new Date(p.due_date)
        dueDate.setHours(0, 0, 0, 0)
        if (dueDate < todayGregorian) return false
        const [dueJY, dueJM] = gregorianToJalali(
          dueDate.getFullYear(),
          dueDate.getMonth() + 1,
          dueDate.getDate(),
        )
        return dueJY === todayJalaliYear && dueJM === todayJalaliMonth
      })
      .map((p) => ({ ...inst, payment: p }))
  })

  // ─── اقساط معوقه ───────────────────────────────────────────
  const overdueInstallments = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    return inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const daysUntil = getDaysUntilDue(p.due_date)
        return daysUntil < 0
      })
      .map((p) => ({ ...inst, payment: p }))
  })

  const installmentDates = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    return inst.payments.filter((p) => !p.is_paid).map((p) => p.due_date)
  })

  const getSelectedCardData = () => {
    switch (selectedCard) {
      case "thisWeek":
        return upcomingThisWeek
      case "currentMonth":
        return currentMonthInstallments
      case "overdue":
        return overdueInstallments
      default:
        return null
    }
  }

  const selectedCardData = getSelectedCardData()

  function handleUndoClick(e: React.MouseEvent, installment: Installment) {
    e.stopPropagation()
    setUndoInstallment(installment)
    setUndoDialogOpen(true)
  }

  async function handleConfirmUndo() {
    if (!undoInstallment) return
    await undoLastPayment(undoInstallment.id)
    await loadData()
    setUndoDialogOpen(false)
    setUndoInstallment(null)
  }

  function getUndoPaymentInfo(installment: Installment) {
    const lastPaid = getLastPaidPayment(installment)
    if (!lastPaid) return null
    return {
      date: getPersianDate(lastPaid.due_date, lastPaid.jalali_due_date),
      amount: formatCurrency(lastPaid.amount),
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* دکمه‌های شناور */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 mb-0">
        <Button
          onClick={() => handleAddInstallment()}
          size="icon"
          className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
        >
          <Plus className="h-6 w-6" />
        </Button>
        <Button
          onClick={() => setTrashDialogOpen(true)}
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      {/* کارت‌های آمار — ۲ ستون موبایل، ۳ ستون دسکتاپ */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">

        {/* ۱ — کل بدهی */}
        <Card className="p-4 bg-gradient-to-br from-rose-500/10 to-orange-500/5 border-rose-500/20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">کل بدهی</p>
              <p className="mt-1 text-sm md:text-lg font-bold text-balance break-words">
                {formatCurrency(totalDebt)} تومان
              </p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-rose-500/10 shrink-0">
              <CircleDollarSign className="h-4 w-4 md:h-5 md:w-5 text-rose-500" />
            </div>
          </div>
        </Card>

        {/* ۲ — بدهی ماه جاری */}
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">بدهی ماه جاری</p>
              <p className="mt-1 text-sm md:text-lg font-bold text-balance break-words">
                {formatCurrency(currentMonthDebt)} تومان
              </p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-green-500/10 shrink-0">
              <Banknote className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
            </div>
          </div>
        </Card>

        {/* ۳ — مانده بدهی ماه جاری */}
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">مانده ماه جاری</p>
              <p className="mt-1 text-sm md:text-lg font-bold text-balance break-words">
                {formatCurrency(currentMonthRemaining)} تومان
              </p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-blue-500/10 shrink-0">
              <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
            </div>
          </div>
        </Card>

          {/* ۶ — مانده بدهی ۳ ماه آینده */}
        <Card className="p-4 bg-gradient-to-br from-violet-500/10 to-purple-500/5 border-violet-500/20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">مانده ۳ ماه آینده</p>
              <p className="mt-1 text-sm md:text-lg font-bold text-balance break-words">
                {formatCurrency(nextThreeMonthsDebt)} تومان
              </p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-violet-500/10 shrink-0">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-violet-500" />
            </div>
          </div>
        </Card>
        
        {/* ۴ — سررسید این هفته */}
        <Card
          className="p-4 bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-500/20 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setSelectedCard(selectedCard === "thisWeek" ? null : "thisWeek")}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">سررسید این هفته</p>
              <p className="mt-1 text-lg md:text-xl font-bold">{toPersianDigits(upcomingThisWeek.length)}</p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-amber-500/10 shrink-0">
              <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-amber-500" />
            </div>
          </div>
        </Card>

        {/* ۵ — اقساط معوقه */}
        <Card
          className="p-4 bg-gradient-to-br from-red-500/10 to-pink-500/5 border-red-500/20 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setSelectedCard(selectedCard === "overdue" ? null : "overdue")}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">اقساط معوقه</p>
              <p className="mt-1 text-lg md:text-xl font-bold">{toPersianDigits(overdueInstallments.length)}</p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-red-500/10 shrink-0">
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
            </div>
          </div>
        </Card>

      

      </div>

      {/* نمایش اقساط انتخاب شده */}
      {selectedCardData && selectedCardData.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold text-lg mb-4">
            {selectedCard === "thisWeek" && "اقساط سررسید این هفته"}
            {selectedCard === "currentMonth" && "اقساط ماه جاری"}
            {selectedCard === "overdue" && "اقساط معوقه"}
          </h3>
          <div className="space-y-2">
            {selectedCardData.map((item) => (
              <div
                key={item.payment.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.creditor_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {getPersianDate(item.payment.due_date, item.payment.jalali_due_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-sm">{formatCurrency(item.payment.amount)} تومان</p>
                  <Button size="sm" variant="outline" onClick={() => handleTogglePayment(item.id, item.payment.id)}>
                    پرداخت ✓
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* ردیف جمع کل */}
          <div className="mt-3 pt-3 border-t-2 border-dashed flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-sm">
              <p className="font-medium text-sm">جمع کل</p>
            </div>
            <p className="font-bold text-base text-primary">
              {formatCurrency(
                selectedCardData.reduce((sum, item) => sum + (item.payment.amount || 0), 0)
              )}{" "}
              تومان
            </p>
          </div>
        </Card>
      )}

      {/* تب‌ها */}
      <Tabs defaultValue="calendar" className="w-full" onValueChange={setActiveView}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calculator" className="gap-2">
            محاسبه‌گر
            <Calculator className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            لیست اقساط
            <List className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            تقویم
            <CalendarDays className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <CalendarGrid
            onDateSelect={(date) => handleAddInstallment(date)}
            installmentDates={installmentDates}
            allInstallments={installments}
          />
        </TabsContent>

        <TabsContent value="calculator" className="mt-4">
          <LoanCalculator />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <div className="grid gap-4 text-right">
            {installments.length > 0 ? (
              installments.map((installment) => {
                if (!installment.payments || !Array.isArray(installment.payments)) return null

                const paidCount = installment.payments.filter((p) => p.is_paid).length
                const progress = (paidCount / installment.installment_count) * 100
                const nextPayment = installment.payments.find((p) => !p.is_paid)
                const hasUndoablePayment = paidCount > 0

                return (
                  <Card
                    key={installment.id}
                    className="p-4 md:p-6 hover:shadow-xl transition-all duration-300 cursor-pointer group border-2 hover:border-primary/50"
                    onClick={() => handleEditInstallment(installment)}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-2 dir:rtl">
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap justify-end">
                            {hasUndoablePayment && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                onClick={(e) => handleUndoClick(e, installment)}
                                title="بازگردانی آخرین پرداخت"
                              >
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Badge variant="outline" className="font-medium text-xs md:text-sm shrink-0">
                              {getRecurrenceLabel(installment.recurrence)}
                            </Badge>
                            <h3 className="text-lg md:text-xl font-bold break-words">{installment.creditor_name}</h3>
                          </div>
                          <p className="text-xs md:text-sm text-muted-foreground break-words">
                            {installment.item_description}
                          </p>
                          {installment.payment_time && (
                            <p className="text-sm text-muted-foreground mt-1">
                              ساعت پرداخت: {toPersianDigits(installment.payment_time.slice(0, 5))}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 dir:rtl text-right">
                        <div className="text-xs md:text-sm">
                          <span className="font-medium">
                            پیشرفت پرداخت: {toPersianDigits(paidCount)} از{" "}
                            {toPersianDigits(installment.installment_count)} قسط (
                            {toPersianDigits(Math.round(progress))}%)
                          </span>
                        </div>
                        <Progress value={progress} className="h-2 md:h-3" />
                      </div>

                      {nextPayment && (
                        <div className="p-3 md:p-4 rounded-lg bg-muted/50 border-2 border-dashed">
                          <div className="flex flex-col gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs md:text-sm font-medium text-muted-foreground mb-2">قسط بعدی</p>
                              <div className="flex flex-col gap-2 text-xs md:text-sm dir:rtl">
                                <div className="flex items-center gap-2 justify-end">
                                  <span className="text-xs md:text-sm font-medium text-muted-foreground break-words">
                                    تومان
                                  </span>
                                  <span className="font-bold text-primary text-right text-base md:text-lg break-words">
                                    {formatCurrency(nextPayment.amount)}
                                  </span>
                                  <CircleDollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  <span dir="rtl" className="text-muted-foreground whitespace-nowrap">
                                    ({toPersianDigits(getDaysUntilDue(nextPayment.due_date))} روز مانده)
                                  </span>
                                  <span dir="rtl" className="break-words">
                                    {getPersianDate(nextPayment.due_date, nextPayment.jalali_due_date)}
                                  </span>
                                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {installment.notes && (
                        <p className="text-xs md:text-sm text-muted-foreground border-r-2 border-primary/50 pr-3 italic break-words">
                          {installment.notes}
                        </p>
                      )}
                    </div>
                  </Card>
                )
              })
            ) : (
              <Card className="p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">هیچ قسطی یافت نشد</h3>
                    <p className="text-muted-foreground">برای شروع، یک قسط جدید اضافه کنید</p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* دیالوگ‌ها */}
      <InstallmentDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        installment={selectedInstallment}
        initialDate={initialDate}
        userId={userId}
        onSuccess={() => {
          loadData()
          setSelectedInstallment(null)
          setInitialDate(undefined)
        }}
      />

      <ConfirmUndoDialog
        open={undoDialogOpen}
        onOpenChange={setUndoDialogOpen}
        onConfirm={handleConfirmUndo}
        paymentDate={undoInstallment ? getUndoPaymentInfo(undoInstallment)?.date : undefined}
        amount={undoInstallment ? getUndoPaymentInfo(undoInstallment)?.amount : undefined}
      />

      <TrashDialog
        open={trashDialogOpen}
        onOpenChange={setTrashDialogOpen}
        onRestore={loadData}
      />
    </div>
  )
}
