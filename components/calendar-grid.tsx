"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  getTodayPersian,
  getPersianMonthDays,
  jalaliToGregorian,
  persianMonths,
  persianWeekDaysShort,
  formatPersianDate,
  toPersianDigits,
} from "@/lib/persian-calendar"
import type { Installment } from "@/lib/types"
import { DayInstallmentsPopup } from "@/components/day-installments-popup"

interface CalendarGridProps {
  onDateSelect: (date: string) => void
  installmentDates?: string[] // تاریخ‌های میلادی که قسط دارند
  allInstallments?: Installment[] // تمام اقساط برای نمایش جزئیات
}

export function CalendarGrid({ onDateSelect, installmentDates = [], allInstallments = [] }: CalendarGridProps) {
  const today = getTodayPersian()
  const [currentYear, setCurrentYear] = useState(today[0])
  const [currentMonth, setCurrentMonth] = useState(today[1])
  
  // برای popup
  const [showPopup, setShowPopup] = useState(false)
  const [selectedDayInstallments, setSelectedDayInstallments] = useState<Array<{
    installment: Installment
    payment: any
  }>>([])
  const [selectedPersianDate, setSelectedPersianDate] = useState("")

  function handlePrevMonth() {
    if (currentMonth === 1) {
      setCurrentMonth(12)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  function handleNextMonth() {
    if (currentMonth === 12) {
      setCurrentMonth(1)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  function handleDateClick(day: number) {
    const [gy, gm, gd] = jalaliToGregorian(currentYear, currentMonth, day)
    const gregorianDate = `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`
    const persianDateStr = formatPersianDate(currentYear, currentMonth, day)
    
    // پیدا کردن اقساط این روز
    const dayInstallments = allInstallments.flatMap((inst) => {
      if (!inst.payments || !Array.isArray(inst.payments)) return []
      
      return inst.payments
        .filter((p) => !p.is_paid && p.due_date === gregorianDate)
        .map((p) => ({ installment: inst, payment: p }))
    })

    if (dayInstallments.length > 0) {
      // اگر قسط داشت، popup نشون بده
      setSelectedDayInstallments(dayInstallments)
      setSelectedPersianDate(persianDateStr)
      setShowPopup(true)
    } else {
      // اگر قسط نداشت، dialog افزودن قسط باز بشه
      onDateSelect(gregorianDate)
    }
  }

  // محاسبه روزهای ماه
  const daysInMonth = getPersianMonthDays(currentYear, currentMonth)
  const [firstDayGy, firstDayGm, firstDayGd] = jalaliToGregorian(currentYear, currentMonth, 1)
  const firstDayOfWeek = new Date(firstDayGy, firstDayGm - 1, firstDayGd).getDay()
  const startDayIndex = firstDayOfWeek === 6 ? 0 : firstDayOfWeek + 1

  // ساختن آرایه روزها
  const calendarDays = []
  for (let i = 0; i < startDayIndex; i++) {
    calendarDays.push(null)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  const isToday = (day: number | null) => {
    if (!day) return false
    return day === today[2] && currentMonth === today[1] && currentYear === today[0]
  }

  const hasInstallment = (day: number | null) => {
    if (!day) return false
    const [gy, gm, gd] = jalaliToGregorian(currentYear, currentMonth, day)
    const gregorianDate = `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`
    return installmentDates.includes(gregorianDate)
  }
  
  return (
    <>
      <Card className="p-4 dir-rtl text-right">
        <div className="flex items-center justify-between mb-1">
          <Button variant="ghost" size="icon" onClick={handleNextMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-lg font-bold">
            {persianMonths[currentMonth - 1]} {toPersianDigits(currentYear)}
          </div>
          <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 text-sidebar-primary-foreground border-0 rounded-full mb-0 gap-1 bg-slate-600">
          {[...persianWeekDaysShort].reverse().map((day) => (
            <div key={day} className="text-sm font-medium opacity-100 text-center px-0 mx-0 py-1.5">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 [direction:rtl] gap-1 my-0">
          {calendarDays.map((day, index) => (
            <button
              key={index}
              onClick={() => day && handleDateClick(day)}
              disabled={!day}
              className={`
                aspect-square p-2 text-sm rounded-lg transition-all
                ${!day ? "invisible" : ""}
                ${isToday(day) ? "bg-primary text-primary-foreground font-bold" : ""}
                ${hasInstallment(day) && !isToday(day) ? "bg-rose-500/20 font-semibold" : ""}
                ${hasInstallment(day) && isToday(day) ? "bg-purple-700 text-white font-bold":""}
                ${day && !isToday(day) && !hasInstallment(day) ? "hover:bg-muted" : ""}
                ${day ? "cursor-pointer" : ""}
              `}
            >
              {day ? toPersianDigits(day) : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-end gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>امروز</span>
            <div className="w-3 h-3 rounded-full bg-primary" />
          </div>
          <div className="flex items-center gap-2">
            <span>دارای قسط</span>
            <div className="w-3 h-3 rounded-full bg-rose-500/20" />
          </div>
        </div>
      </Card>

      {/* Popup برای نمایش اقساط روز */}
      <DayInstallmentsPopup
        open={showPopup}
        onOpenChange={setShowPopup}
        installments={selectedDayInstallments}
        persianDate={selectedPersianDate}
      />
    </>
  )
}
