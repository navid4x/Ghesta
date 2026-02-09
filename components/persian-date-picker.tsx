"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { jalaliToGregorian, persianMonths, persianWeekDaysShort, getPersianMonthDays } from "@/lib/persian-calendar"

interface PersianDatePickerProps {
  value: { year: number; month: number; day: number }
  onChange: (date: { year: number; month: number; day: number }) => void
}

export function PersianDatePicker({ value, onChange }: PersianDatePickerProps) {
  const [viewYear, setViewYear] = useState(value.year)
  const [viewMonth, setViewMonth] = useState(value.month)

  const daysInMonth = getPersianMonthDays(viewYear, viewMonth)
  const [firstDayYear, firstDayMonth, firstDayDay] = jalaliToGregorian(viewYear, viewMonth, 1)
  const firstDayOfMonth = new Date(firstDayYear, firstDayMonth - 1, firstDayDay).getDay()
  const adjustedFirstDay = firstDayOfMonth === 6 ? 0 : firstDayOfMonth + 1

  const previousMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }
function toPersianDigits(str: string | number): string {
  if (str === null || str === undefined) return "";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  return String(str).replace(/[0-9]/g, (w) => persianDigits[+w]);
}
  const selectDay = (day: number) => {
    onChange({ year: viewYear, month: viewMonth, day })
  }

  const days = []
  for (let i = 0; i < adjustedFirstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-8 w-8" />)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const isSelected = value.year === viewYear && value.month === viewMonth && value.day === day
    days.push(
      <Button
        key={day}
        variant={isSelected ? "default" : "ghost"}
        size="sm"
        className={cn("h-8 w-8 p-0 font-normal", isSelected && "bg-primary text-primary-foreground")}
        onClick={() => selectDay(day)}
      >
        {toPersianDigits(day)}
      </Button>,
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start text-right font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="ml-2 h-4 w-4" />
          {value
            ? toPersianDigits(`${value.year}/${value.month.toString().padStart(2, "0")}/${value.day.toString().padStart(2, "0")}`)
            : "انتخاب تاریخ"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <Button variant="outline" size="icon" onClick={previousMonth} className="h-7 w-7 bg-transparent">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="font-semibold">
              {persianMonths[viewMonth - 1]} {toPersianDigits(viewYear)}
            </div>
            <Button variant="outline" size="icon" onClick={nextMonth} className="h-7 w-7 bg-transparent">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 text-sidebar-primary-foreground border-0 rounded-full mb-2 gap-0 bg-slate-600">
            {persianWeekDaysShort.map((day) => (
              <div
                key={day}
                className="font-medium opacity-100 text-center py-0.5 px-0 text-xs h-6 mx-0"
              >
                {toPersianDigits(day)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">{days}</div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
