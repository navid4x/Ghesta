"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Calculator, TrendingUp, Calendar, DollarSign, Percent } from "lucide-react"
import { formatCurrencyPersian, parseCurrencyInput, toPersianDigits } from "@/lib/persian-calendar"

export function LoanCalculator() {
  // ورودی‌ها
  const [principalAmount, setPrincipalAmount] = useState("") // مبلغ کل
  const [principalDisplay, setPrincipalDisplay] = useState("") // نمایش فرمت شده
  const [monthCount, setMonthCount] = useState("") // تعداد ماه
  const [totalPayback, setTotalPayback] = useState("") // کل بازپرداخت
  const [totalPaybackDisplay, setTotalPaybackDisplay] = useState("") // نمایش فرمت شده
  const [monthlyPayment, setMonthlyPayment] = useState("") // پرداخت ماهیانه
  const [monthlyPaymentDisplay, setMonthlyPaymentDisplay] = useState("") // نمایش فرمت شده

  // خروجی‌های محاسبه شده
  const [results, setResults] = useState({
    totalProfit: 0, // کل سود
    profitPercent: 0, // درصد سود کل
    annualProfitPercent: 0, // درصد سود سالانه
    monthlyProfitPercent: 0, // درصد سود ماهیانه
    monthlyPaymentCalc: 0, // پرداخت ماهیانه محاسبه شده
  })

  // محاسبه خودکار کل بازپرداخت از روی پرداخت ماهیانه
  useEffect(() => {
    const monthly = Number(monthlyPayment)
    const months = Number(monthCount)

    if (monthly > 0 && months > 0) {
      const total = monthly * months
      setTotalPayback(total.toString())
      setTotalPaybackDisplay(formatCurrencyPersian(total))
    }
  }, [monthlyPayment, monthCount])

  // محاسبات اصلی
  useEffect(() => {
    const principal = Number(principalAmount)
    const months = Number(monthCount)
    const payback = Number(totalPayback)

    if (principal > 0 && months > 0 && payback > 0) {
      // کل سود
      const totalProfit = payback - principal

      // درصد سود کل
      const profitPercent = (totalProfit / principal) * 100

      // درصد سود سالانه
      const years = months / 12
      const annualProfitPercent = profitPercent / years

      // درصد سود ماهیانه
      const monthlyProfitPercent = profitPercent / months

      // پرداخت ماهیانه
      const monthlyPaymentCalc = payback / months

      setResults({
        totalProfit,
        profitPercent,
        annualProfitPercent,
        monthlyProfitPercent,
        monthlyPaymentCalc,
      })
    } else {
      setResults({
        totalProfit: 0,
        profitPercent: 0,
        annualProfitPercent: 0,
        monthlyProfitPercent: 0,
        monthlyPaymentCalc: 0,
      })
    }
  }, [principalAmount, monthCount, totalPayback])

  function handlePrincipalChange(value: string) {
    const numeric = parseCurrencyInput(value)
    setPrincipalAmount(numeric.toString())
    setPrincipalDisplay(numeric > 0 ? formatCurrencyPersian(numeric) : "")
  }

  function handleMonthlyPaymentChange(value: string) {
    const numeric = parseCurrencyInput(value)
    setMonthlyPayment(numeric.toString())
    setMonthlyPaymentDisplay(numeric > 0 ? formatCurrencyPersian(numeric) : "")
  }

  function handleTotalPaybackChange(value: string) {
    const numeric = parseCurrencyInput(value)
    setTotalPayback(numeric.toString())
    setTotalPaybackDisplay(numeric > 0 ? formatCurrencyPersian(numeric) : "")
  }

  const hasResults = results.totalProfit > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
          <Calculator className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">محاسبه‌گر وام و قسط</h2>
          <p className="text-sm text-muted-foreground">محاسبه سود و بازپرداخت</p>
        </div>
      </div>

      {/* ورودی‌ها */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          اطلاعات وام
        </h3>

        <div className="space-y-4">
          {/* مبلغ کل */}
          <div>
            <Label htmlFor="principal" className="text-sm font-medium">
              مبلغ کل دریافتی (تومان) *
            </Label>
            <Input
              id="principal"
              type="text"
              value={principalDisplay}
              onChange={(e) => handlePrincipalChange(e.target.value)}
              placeholder="مثال: ۱۰۰,۰۰۰,۰۰۰"
              className="mt-2 text-right text-lg font-semibold"
              dir="rtl"
            />
          </div>

          {/* تعداد ماه */}
          <div>
            <Label htmlFor="months" className="text-sm font-medium">
              تعداد اقساط (ماه) *
            </Label>
            <Input
              id="months"
              type="text"
              value={monthCount ? toPersianDigits(monthCount) : ""}
              onChange={(e) => setMonthCount(parseCurrencyInput(e.target.value).toString())}
              placeholder="مثال: ۱۲"
              className="mt-2 text-right text-lg font-semibold"
              dir="rtl"
            />
            {monthCount && Number(monthCount) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                معادل {toPersianDigits((Number(monthCount) / 12).toFixed(1))} سال
              </p>
            )}
          </div>

          {/* انتخاب روش ورودی */}
          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-3 block">روش محاسبه بازپرداخت:</Label>
            
            {/* گزینه 1: پرداخت ماهیانه */}
            <div className="space-y-2 mb-3">
              <Label htmlFor="monthly" className="text-sm">
                پرداخت ماهیانه (تومان)
              </Label>
              <Input
                id="monthly"
                type="text"
                value={monthlyPaymentDisplay}
                onChange={(e) => handleMonthlyPaymentChange(e.target.value)}
                placeholder="مثال: ۱۰,۸۳۳,۳۳۳"
                className="text-right text-lg font-semibold"
                dir="rtl"
              />
            </div>

            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">یا</span>
              <div className="flex-1 border-t" />
            </div>

            {/* گزینه 2: کل بازپرداخت */}
            <div className="space-y-2">
              <Label htmlFor="total" className="text-sm">
                کل بازپرداخت (تومان)
              </Label>
              <Input
                id="total"
                type="text"
                value={totalPaybackDisplay}
                onChange={(e) => handleTotalPaybackChange(e.target.value)}
                placeholder="مثال: ۱۳۰,۰۰۰,۰۰۰"
                className="text-right text-lg font-semibold"
                dir="rtl"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* نتایج */}
      {hasResults && (
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            نتایج محاسبات
          </h3>

          <div className="grid gap-4 md:grid-cols-2">
            {/* کل سود */}
            <div className="p-4 rounded-lg bg-card border-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">کل سود پرداختی</span>
                <DollarSign className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrencyPersian(results.totalProfit)} تومان
              </p>
            </div>

            {/* درصد کل سود */}
            <div className="p-4 rounded-lg bg-card border-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">درصد کل سود</span>
                <Percent className="h-4 w-4 text-orange-500" />
              </div>
              <p className="text-2xl font-bold text-orange-600">
                {toPersianDigits(results.profitPercent.toFixed(2))}%
              </p>
            </div>

            {/* سود سالانه */}
            <div className="p-4 rounded-lg bg-card border-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">نرخ سود سالانه</span>
                <Calendar className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {toPersianDigits(results.annualProfitPercent.toFixed(2))}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                معادل {formatCurrencyPersian(Math.round((results.totalProfit / Number(monthCount)) * 12))} تومان در سال
              </p>
            </div>

            {/* سود ماهیانه */}
            <div className="p-4 rounded-lg bg-card border-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">نرخ سود ماهیانه</span>
                <Percent className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">
                {toPersianDigits(results.monthlyProfitPercent.toFixed(2))}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                معادل {formatCurrencyPersian(Math.round(results.totalProfit / Number(monthCount)))} تومان در ماه
              </p>
            </div>
          </div>

          {/* پرداخت ماهیانه */}
          <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">پرداخت ماهیانه</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrencyPersian(Math.round(results.monthlyPaymentCalc))} تومان
                </p>
              </div>
              <Badge variant="secondary" className="text-lg px-4 py-2">
                ماهانه
              </Badge>
            </div>
          </div>

          {/* خلاصه */}
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border">
            <p className="text-sm text-muted-foreground mb-2">📊 خلاصه:</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{formatCurrencyPersian(Number(principalAmount))} تومان</span>
                <span className="text-muted-foreground">دریافتی شما</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span className="font-medium">+ {formatCurrencyPersian(results.totalProfit)} تومان</span>
                <span>سود</span>
              </div>
              <div className="border-t pt-1 mt-1 flex justify-between font-bold">
                <span>{formatCurrencyPersian(Number(totalPayback))} تومان</span>
                <span>کل بازپرداخت</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* راهنما */}
      {!hasResults && (
        <Card className="p-6 bg-muted/30">
          <div className="text-center text-muted-foreground">
            <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              برای مشاهده نتایج، اطلاعات مورد نیاز را وارد کنید
            </p>
            <p className="text-xs mt-2">
              💡 می‌توانید پرداخت ماهیانه یا کل بازپرداخت را وارد کنید
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}