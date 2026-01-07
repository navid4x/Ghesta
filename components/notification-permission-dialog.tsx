"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Bell, BellOff, CheckCircle2 } from "lucide-react"
import { useState } from "react"

interface NotificationPermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAllow: () => Promise<void>
  onDeny: () => void
}

export function NotificationPermissionDialog({
  open,
  onOpenChange,
  onAllow,
  onDeny,
}: NotificationPermissionDialogProps) {
  const [loading, setLoading] = useState(false)

  async function handleAllow() {
    setLoading(true)
    try {
      await onAllow()
      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Error requesting notification permission:", error)
    } finally {
      setLoading(false)
    }
  }

  function handleDeny() {
    onDeny()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md" dir="rtl" aria-describedby="notification-dialog-description">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                <Bell className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
          </div>
          <DialogTitle className="text-center text-xl">فعال‌سازی اعلان‌ها</DialogTitle>
          <DialogDescription id="notification-dialog-description" className="text-center text-base leading-relaxed">
            با فعال کردن اعلان‌ها، از سررسید اقساط خود مطلع خواهید شد و هیچ پرداختی را فراموش نخواهید کرد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm">یادآوری قبل از سررسید هر قسط</p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm">اطلاع‌رسانی حتی وقتی برنامه بسته است</p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm">قابل غیرفعال‌سازی در هر زمان</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            onClick={handleAllow}
            disabled={loading}
            className="w-full sm:w-auto gap-2 bg-gradient-to-r from-primary to-primary/80"
          >
            <Bell className="h-4 w-4" />
            {loading ? "در حال فعال‌سازی..." : "فعال کردن اعلان‌ها"}
          </Button>
          <Button
            variant="outline"
            onClick={handleDeny}
            disabled={loading}
            className="w-full sm:w-auto gap-2 bg-transparent"
          >
            <BellOff className="h-4 w-4" />
            فعلاً نه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
