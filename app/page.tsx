"use client"

import dynamic from "next/dynamic"
import { Wallet, LogOut, Wifi, WifiOff } from "lucide-react"
import { getTodayPersian, persianMonths } from "@/lib/persian-calendar"
import { Button } from "@/components/ui/button"
import { logout, getCurrentUser, setupOnlineListener } from "@/lib/simple-auth"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback, memo } from "react"
import { startBackgroundSync, stopBackgroundSync, getQueueSize } from "@/lib/background-sync"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

// Lazy load heavy components
const InstallmentDashboard = dynamic(() => import("@/components/installment-dashboard").then(mod => ({ default: mod.InstallmentDashboard })), {
  loading: () => <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>,
  ssr: false
})

const NotificationSettings = dynamic(() => import("@/components/notification-settings").then(mod => ({ default: mod.NotificationSettings })), {
  ssr: false
})


export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingOps, setPendingOps] = useState(0)
  const { toast } = useToast()

  // Memoize callbacks
  const updatePendingOps = useCallback(() => {
    setPendingOps(getQueueSize())
  }, [])

  const handleLogout = useCallback(async () => {
    stopBackgroundSync()
    await logout()
    router.push("/auth")
    router.refresh()
  }, [router])

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUser()

      if (!currentUser) {
        router.replace("/auth")
      } else {
        setUser(currentUser)
        setLoading(false)
        updatePendingOps()
        startBackgroundSync()
      }
    }

    loadUser()
    setIsOnline(navigator.onLine)

    const cleanup = setupOnlineListener(async (online) => {
      setIsOnline(online)
      if (online) {
        const refreshedUser = await getCurrentUser()
        if (refreshedUser) {
          setUser(refreshedUser)
        }
      }
    })

    const handleSyncComplete = () => {
      updatePendingOps()
    }

    const handleQueueUpdated = () => {
      updatePendingOps()
    }

    const handleSyncError = (event: CustomEvent) => {
      toast({
        variant: "destructive",
        title: "خطا در همگام‌سازی",
        description: event.detail.message,
      })
    }

    window.addEventListener("sync-complete", handleSyncComplete)
    window.addEventListener("queue-updated", handleQueueUpdated)
    window.addEventListener("sync-error", handleSyncError as EventListener)

    return () => {
      cleanup()
      stopBackgroundSync()
      window.removeEventListener("sync-complete", handleSyncComplete)
      window.removeEventListener("queue-updated", handleQueueUpdated)
      window.removeEventListener("sync-error", handleSyncError as EventListener)
    }
  }, [router, toast, updatePendingOps])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">در حال بارگذاری...</p>
        </div>
      </div>
    )
  }

  const today = getTodayPersian()
  const todayPersianString = `${today[2].toString().padStart(2, "0")} ${persianMonths[today[1] - 1]} ${today[0]}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/30">
              <Wallet className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">قسطا </h1>
              <p className="text-sm text-muted-foreground mt-1">{toPersianDigits(todayPersianString)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* ✨ نمایش وضعیت sync */}
            {pendingOps > 0 && (
              <Badge variant="secondary" className="gap-1">
                {isOnline ? (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    در حال همگام‌سازی...
                  </>
                ) : (
                  <>
                   
                    {toPersianDigits(pendingOps)} کار در انتظار
                  </>
                )}
              </Badge>
            )}
            
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-orange-500" />
            )}
            
            <Button onClick={handleLogout} variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <NotificationSettings userId={user.id} />
        <InstallmentDashboard userId={user.id} />
      </main>
    </div>
  )
}

function toPersianDigits(str: string | number): string {
  if (str === null || str === undefined) return ""
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹"
  return String(str).replace(/[0-9]/g, (w) => persianDigits[+w])
}
