"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Calendar, Banknote, TrendingDown, Clock, AlertCircle, CalendarDays, List } from "lucide-react"
import type { Installment } from "@/lib/types"
import { InstallmentDialog } from "./installment-dialog"
import { CalendarGrid } from "./calendar-grid"
import { gregorianToJalali, persianMonths } from "@/lib/persian-calendar"
import { loadInstallments, togglePayment } from "@/lib/data-sync"

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

  useEffect(() => {
    loadData()
  }, [userId])

  async function loadData() {
    setLoading(true)
    try {
      const data = await loadInstallments(userId)
      setInstallments(data)
    } catch (error) {
      console.error("[v0] Error loading installments:", error)
    } finally {
      setLoading(false)
    }
  }

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
    await togglePayment(userId, installmentId, paymentId)
    await loadData()
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("fa-IR").format(amount)
  }

  function toPersianDigits(str: string | number): string {
    if (str === null || str === undefined) return ""
    const persianDigits = "۰۱۲۳۴۵۶۷۸۹"
    return String(str).replace(/[0-9]/g, (w) => persianDigits[+w])
  }

  function getDaysUntilDue(dueDate: string): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    const diffTime = due.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  function getPersianDate(gregorianDate: string): string {
    const [year, month, day] = gregorianDate.split("-").map(Number)
    const [jy, jd, jm] = gregorianToJalali(year, month, day)
    return `${jy} ${persianMonths[jd - 1]} ${jm.toString()}`
  }

  function getRecurrenceLabel(recurrence: string): string {
    const labels = {
      daily: "روزانه",
      weekly: "هفتگی",
      monthly: "ماهانه",
      yearly: "سالانه",
    }
    return labels[recurrence as keyof typeof labels] || recurrence
  }

  const totalDebt = installments.reduce((sum, inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return sum
    const unpaidAmount = inst.payments.filter((p) => !p.is_paid).reduce((s, p) => s + p.amount, 0)
    return sum + unpaidAmount
  }, 0)

  const upcomingThisWeek = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    return inst.payments
      .filter((p) => !p.is_paid && getDaysUntilDue(p.due_date) <= 7 && getDaysUntilDue(p.due_date) >= 0)
      .map((p) => ({ ...inst, payment: p }))
  })

  const currentMonthInstallments = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    return inst.payments
      .filter((p) => {
        if (p.is_paid) return false
        const dueDate = new Date(p.due_date)
        return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear
      })
      .map((p) => ({ ...inst, payment: p }))
  })

  const overdueInstallments = installments.flatMap((inst) => {
    if (!inst.payments || !Array.isArray(inst.payments)) return []
    return inst.payments
      .filter((p) => !p.is_paid && getDaysUntilDue(p.due_date) < 0)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="fixed bottom-1 left-3 z-50">
        <Button
          onClick={() => handleAddInstallment()}
          size="icon"
          className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-rose-500/10 to-orange-500/5 border-rose-500/20">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">کل بدهی</p>
              <p className="mt-1 text-sm md:text-lg font-bold text-balance break-words">
                {formatCurrency(totalDebt)} تومان
              </p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-rose-500/10 shrink-0">
              <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-rose-500" />
            </div>
          </div>
        </Card>

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
              <Calendar className="h-4 w-4 md:h-5 md:w-5 text-amber-500" />
            </div>
          </div>
        </Card>

        <Card
          className="p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setSelectedCard(selectedCard === "currentMonth" ? null : "currentMonth")}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">اقساط ماه جاری</p>
              <p className="mt-1 text-lg md:text-xl font-bold">{toPersianDigits(currentMonthInstallments.length)}</p>
            </div>
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-blue-500/10 shrink-0">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
            </div>
          </div>
        </Card>

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
                  <p className="text-xs text-muted-foreground">{getPersianDate(item.payment.due_date)}</p>
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
        </Card>
      )}

      <Tabs defaultValue="list" className="w-full" onValueChange={setActiveView}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="calendar" className="gap-2">
            تقویم
            <CalendarDays className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            لیست اقساط
            <List className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <CalendarGrid onDateSelect={(date) => handleAddInstallment(date)} installmentDates={installmentDates} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <div className="grid gap-4 text-right">
            {installments.length > 0 ? (
              installments.map((installment) => {
                if (!installment.payments || !Array.isArray(installment.payments)) {
                  return null
                }

                const paidCount = installment.payments.filter((p) => p.is_paid).length
                const progress = (paidCount / installment.installment_count) * 100
                const nextPayment = installment.payments.find((p) => !p.is_paid)

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
                            <Badge variant="outline" className="font-medium text-xs md:text-sm shrink-0">
                              {getRecurrenceLabel(installment.recurrence)}
                            </Badge>
                            <h3 className="text-lg md:text-xl font-bold break-words">{installment.creditor_name}</h3>
                          </div>
                          <p className="text-xs md:text-sm text-muted-foreground break-words">
                            {installment.item_description}
                          </p>
                          {installment.payment_time && (
                            <p className="text-xs text-muted-foreground mt-1">
                              ساعت پرداخت: {toPersianDigits(installment.payment_time)}
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
                                  <span className="font-bold text-primary text-base md:text-lg break-words">
                                    {formatCurrency(nextPayment.amount)} تومان
                                  </span>
                                  <Banknote className="h-4 w-4 text-primary shrink-0" />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  <span className="text-muted-foreground whitespace-nowrap">
                                    ({getDaysUntilDue(nextPayment.due_date)} روز مانده)
                                  </span>
                                  <span className="break-words">
                                    {toPersianDigits(getPersianDate(nextPayment.due_date))}
                                  </span>
                                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
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
                    <Calendar className="h-10 w-10 text-muted-foreground" />
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
    </div>
  )
}
