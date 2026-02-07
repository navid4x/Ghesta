"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  getTodayPersian,
  persianMonths,
  persianWeekDaysShort,
  getPersianMonthDays,
  jalaliToGregorian,
  iranianHolidays,
  formatPersianDate,
} from "@/lib/persian-calendar"
import { cn } from "@/lib/utils"
interface CalendarViewProps {
  initialEvents?: Event[]
}

export function CalendarView({ initialEvents = [] }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState<[number, number, number]>(getTodayPersian())
  const [selectedDate, setSelectedDate] = useState<[number, number, number] | null>(getTodayPersian())

  const [year, month] = currentDate
  const today = getTodayPersian()

  function goToNextMonth() {
    if (month === 12) {
      setCurrentDate([year + 1, 1, 1])
    } else {
      setCurrentDate([year, month + 1, 1])
    }
  }

  function goToPrevMonth() {
    if (month === 1) {
      setCurrentDate([year - 1, 12, 1])
    } else {
      setCurrentDate([year, month - 1, 1])
    }
  }

  function goToToday() {
    const today = getTodayPersian()
    setCurrentDate(today)
    setSelectedDate(today)
  }
function toPersianDigits(str: string | number): string {
  if (str === null || str === undefined) return "";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  return String(str).replace(/[0-9]/g, (w) => persianDigits[+w]);
}
  function getCalendarDays() {
    const daysInMonth = getPersianMonthDays(year, month)
    const [gy, gm, gd] = jalaliToGregorian(year, month, 1)
    const firstDayOfMonth = new Date(gy, gm - 1, gd).getDay()
    const startDay = firstDayOfMonth === 6 ? 0 : firstDayOfMonth + 1

    const days: Array<{
      day: number
      isCurrentMonth: boolean
      isToday: boolean
      isSelected: boolean
      isHoliday: boolean
      //hasEvents: boolean
      date: [number, number, number]
    }> = []

    // Previous month days
    if (startDay > 0) {
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const prevMonthDays = getPersianMonthDays(prevYear, prevMonth)

      for (let i = startDay - 1; i >= 0; i--) {
        const day = prevMonthDays - i
        days.push({
          day,
          isCurrentMonth: false,
          isToday: false,
          isSelected: false,
          isHoliday: false,
          // hasEvents: false,
          date: [prevYear, prevMonth, day],
        })
      }
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateKey = formatPersianDate(year, month, i)
      const isHoliday = dateKey in iranianHolidays
      // const hasEvents = events.some((event) => {
      //   const [gy, gm, gd] = jalaliToGregorian(year, month, i)
      //   const eventDate = `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`
      // })

      days.push({
        day: i,
        isCurrentMonth: true,
        isToday: year === today[0] && month === today[1] && i === today[2],
        isSelected:
          selectedDate !== null && year === selectedDate[0] && month === selectedDate[1] && i === selectedDate[2],
        isHoliday,
        //hasEvents,
        date: [year, month, i],
      })
    }

    // Next month days
    const remainingDays = 42 - days.length
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year

    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isHoliday: false,
        //hasEvents: false,
        date: [nextYear, nextMonth, i],
      })
    }

    return days
  }

  function handleDateClick(date: [number, number, number]) {
    setSelectedDate(date)
  }

  // function handleAddEvent() {
  //   setSelectedEvent(null)
  //   setIsEventDialogOpen(true)
  // }

  // function handleEventClick(event: Event) {
  //   setSelectedEvent(event)
  //   setIsEventDialogOpen(true)
  // }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <Card className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">
              {persianMonths[month - 1]} {toPersianDigits(year)}
            </h2>
            <Button variant="outline" size="sm" onClick={goToToday}>
              امروز
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPrevMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week days */}
        <div className="mb-2 grid grid-cols-7 gap-2">
          {persianWeekDaysShort.map((day, index) => (
            <div
              key={index}
              className={cn(
                "py-2 text-center text-sm font-semibold",
                index === 6 ? "text-red-600" : "text-muted-foreground",
              )}
            >
              {toPersianDigits(day)}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2">
          {getCalendarDays().map((dayInfo, index) => {
            const isFriday = index % 7 === 6
            return (
              <button
                key={index}
                onClick={() => handleDateClick(dayInfo.date)}
                className={cn(
                  "relative aspect-square rounded-lg p-2 text-sm transition-all hover:bg-accent",
                  !dayInfo.isCurrentMonth && "text-muted-foreground/40",
                  dayInfo.isToday && "bg-primary font-bold text-primary-foreground hover:bg-primary/90",
                  dayInfo.isSelected && !dayInfo.isToday && "bg-accent ring-2 ring-primary",
                  (dayInfo.isHoliday || isFriday) && dayInfo.isCurrentMonth && !dayInfo.isToday && "text-red-600",
                  // dayInfo.hasEvents && "font-semibold",
                )}
              >
                {dayInfo.day}
                {/*{dayInfo.hasEvents && (*/}
                {/*  <div className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />*/}
                {/*)}*/}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Side panel */}
      {/*<div className="space-y-4">*/}
      {/*  <Card className="p-6">*/}
      {/*    <div className="mb-4 flex items-center justify-between">*/}
      {/*      <h3 className="text-lg font-semibold">*/}
      {/*        {selectedDate ? `${selectedDate[2]} ${persianMonths[selectedDate[1] - 1]}` : "رویدادها"}*/}
      {/*      </h3>*/}
      {/*      <Button size="icon" onClick={handleAddEvent}>*/}
      {/*        <Plus className="h-4 w-4" />*/}
      {/*      </Button>*/}
      {/*    </div>*/}

      {/*    <div className="space-y-3">*/}
      {/*      {selectedDateHoliday && (*/}
      {/*        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">*/}
      {/*          <div className="flex items-center gap-2">*/}
      {/*            <CalendarIcon className="h-4 w-4" />*/}
      {/*            <span className="font-semibold">{selectedDateHoliday}</span>*/}
      {/*          </div>*/}
      {/*        </div>*/}
      {/*      )}*/}

      {/*    </div>*/}
      {/*  </Card>*/}
      {/*</div>*/}
    </div>
  )
}
