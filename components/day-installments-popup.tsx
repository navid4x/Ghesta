"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, Calendar, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Installment } from "@/lib/types"
import { formatCurrencyPersian, toPersianDigits } from "@/lib/persian-calendar"

interface DayInstallmentsPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  installments: Array<{
    installment: Installment
    payment: any
  }>
  persianDate: string
}

export function DayInstallmentsPopup({
  open,
  onOpenChange,
  installments,
  persianDate,
}: DayInstallmentsPopupProps) {

  return (
      // @ts-ignore
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Popup */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
              }}
              className="pointer-events-auto w-full max-w-md"
            >
              <Card className="p-6 shadow-2xl border-2 max-h-[80vh] overflow-auto" dir="rtl">
                {/* Header */}
                <div className="flex flex-row items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Calendar className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-right">
                      <h3 className="text-lg font-bold">اقساط روز</h3>
                      <p className="text-sm text-muted-foreground">{toPersianDigits(persianDate)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenChange(false)}
                    className="h-8 w-8 rounded-full"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Installments List */}
                <div className="space-y-3">
                  {installments.map((item, index) => (
                    <motion.div
                      key={item.payment.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="p-4 bg-gradient-to-br from-muted/30 to-muted/10 border-2 hover:border-primary/50 transition-all cursor-pointer group">
                        <div className="flex flex-row-reverse items-start justify-between gap-3" >
                          <div className="flex-1 min-w-0 text-right">
                            {/* عنوان */}
                            <div className="flex flex-row-reverse items-center gap-2 mb-2 justify-end">
                              <h4 className="font-bold text-base break-words">
                                {item.installment.creditor_name}
                              </h4>
                              <Wallet className="h-4 w-4 text-primary shrink-0" />
                            </div>

                            {/* مبلغ */}
                            <div className="flex flex-row-reverse items-center gap-2 flex-wrap justify-end" >
                              {/* وضعیت پرداخت */}
                              {item.payment.is_paid ? (
                                <Badge className="bg-green-500 text-white">
                                  ✓ پرداخت شده
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-orange-600 border-orange-600">
                                  در انتظار پرداخت
                                </Badge>
                              )}
                              
                              <Badge variant="secondary" className="font-bold text-sm">
                                {formatCurrencyPersian(item.payment.amount)} تومان
                              </Badge>
                            </div>

                            {/* یادداشت */}
                            {item.installment.notes && (
                              <p className="text-xs text-muted-foreground mt-2 italic border-r-2 border-primary/30 pr-2 break-words text-right">
                                {item.installment.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* خلاصه */}
                <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex flex-row-reverse items-center justify-between">
                    <span className="text-lg font-bold text-primary">
                      {formatCurrencyPersian(
                        installments.reduce((sum, item) => sum + item.payment.amount, 0)
                      )}{" "}
                      تومان
                    </span>
                    <span className="text-sm font-medium">جمع اقساط:</span>
                  </div>
                  <div className="flex flex-row-reverse items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span>{toPersianDigits(installments.length)} قسط</span>
                    <span>تعداد:</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
