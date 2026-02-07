"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, RotateCcw, Trash } from "lucide-react"
import type { Installment } from "@/lib/types"
import { getDeletedInstallments, restoreInstallment, hardDeleteInstallment } from "@/lib/data-sync"
import { useToast } from "@/hooks/use-toast"
import { formatCurrencyPersian, toPersianDigits } from "@/lib/persian-calendar"

interface TrashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestore: () => void
}

export function TrashDialog({ open, onOpenChange, onRestore }: TrashDialogProps) {
  const [deletedItems, setDeletedItems] = useState<Installment[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
     loadDeletedItems()
    }
  }, [open])

  async function loadDeletedItems() {
    setLoading(true)
    try {
      const items = await getDeletedInstallments()
      setDeletedItems(items)
    } catch (error) {
      console.error("[Trash] Error loading deleted items:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleRestore(installmentId: string) {
    try {
      await restoreInstallment(installmentId)
      
      toast({
        title: "✅ بازیابی شد",
        description: "قسط با موفقیت بازیابی شد",
      })

     await loadDeletedItems()
      onRestore()
    } catch (error) {
      console.error("[Trash] Error restoring:", error)
      toast({
        title: "❌ خطا",
        description: "مشکلی در بازیابی پیش آمد",
        variant: "destructive",
      })
    }
  }

  async function handleHardDelete(installmentId: string, creditorName: string) {
    if (!confirm(`آیا مطمئنید می‌خواهید "${creditorName}" را برای همیشه حذف کنید؟ این عملیات قابل بازگشت نیست!`)) {
      return
    }

    try {
      await hardDeleteInstallment(installmentId)
      
      toast({
        title: "🗑️ حذف شد",
        description: "قسط برای همیشه حذف شد",
      })
      //await delay(1000)

      await loadDeletedItems()
    } catch (error) {
      console.error("[Trash] Error hard deleting:", error)
      toast({
        title: "❌ خطا",
        description: "مشکلی در حذف پیش آمد",
        variant: "destructive",
      })
    }
  }

  function formatDeletedDate(dateString?: string): string {
    if (!dateString) return ""
    
    const date = new Date(dateString)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    
    return `${toPersianDigits(hours)}:${toPersianDigits(minutes)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            سطل زباله ({toPersianDigits(deletedItems.length)})
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : deletedItems.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">سطل زباله خالی است</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deletedItems.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{item.creditor_name}</h3>
                    <p className="text-sm text-muted-foreground">{item.item_description}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <Badge variant="outline">
                        {formatCurrencyPersian(item.total_amount)} تومان
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        حذف شده: {formatDeletedDate(item.deleted_at)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 flex-col sm:flex-row">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(item.id)}
                      className="gap-1"
                    >
                      <RotateCcw className="h-4 w-4" />
                      بازیابی
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleHardDelete(item.id, item.creditor_name)}
                      className="gap-1"
                    >
                      <Trash className="h-4 w-4" />
                      حذف دائم
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          💡 <strong>نکته:</strong> اقساط حذف شده بعد از ۳۰ روز به صورت خودکار پاک می‌شوند.
        </div>
      </DialogContent>
    </Dialog>
  )
}
