"use client"

import { InstallmentDashboard } from "@/components/installment-dashboard"
import { NotificationSettings } from "@/components/notification-settings"
import { Wallet, LogOut, Wifi, WifiOff } from "lucide-react"
import { getTodayPersian, persianMonths } from "@/lib/persian-calendar"
import { Button } from "@/components/ui/button"
import { logout, getCurrentUser, setupOnlineListener } from "@/lib/simple-auth"
import { checkRealConnectivity, resetConnectivityCache } from "@/lib/network"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { startBackgroundSync, stopBackgroundSync, getQueueSize } from "@/lib/background-sync"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"


export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(false)
  const [pendingOps, setPendingOps] = useState(0)
  const { toast } = useToast()
  const prevOnlineRef = useRef<boolean | null>(null)

  useEffect(() => {
    async function loadUser() {
      const online = await checkRealConnectivity()
      setIsOnline(online)
      prevOnlineRef.current = online

      // getCurrentUser از localStorage میخونه اگه آفلاین بود - سریعه
      const currentUser = await getCurrentUser()

      console.log("[v0] Current user:", currentUser ? currentUser.email : "None")
      console.log("[v0] Real connectivity:", online)

      if (!currentUser) {
        router.replace("/auth")
        return
      }

      setUser(currentUser)
      setLoading(false)
      updatePendingOps()
      startBackgroundSync()
    }

    // timeout اگه loadUser بیشتر از 8 ثانیه طول کشید
    const loadingTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.log("[v0] Loading timeout - using local cache")
          try {
            const stored = localStorage.getItem("auth_user")
            if (stored) {
              setUser(JSON.parse(stored))
              startBackgroundSync()
            } else {
              router.replace("/auth")
            }
          } catch {
            router.replace("/auth")
          }
          return false
        }
        return prev
      })
    }, 8000)

    loadUser().finally(() => clearTimeout(loadingTimeout))

    // setupOnlineListener از checkRealConnectivity استفاده میکنه (در simple-auth.ts)
    const cleanup = setupOnlineListener((online) => {
      const prev = prevOnlineRef.current
      setIsOnline(online)
      prevOnlineRef.current = online

      if (prev !== null && prev !== online) {
        if (online) {
          toast({ title: "✅ اتصال برقرار شد", description: "ارتباط با سرور برقرار شد" })
          getCurrentUser().then((u) => u && setUser(u))
        } else {
          toast({
            variant: "destructive",
            title: "⚠️ آفلاین",
            description: "اتصال به سرور قطع شد. حالت آفلاین فعال است.",
          })
        }
      }
    })

    // polling هر 30 ثانیه
    const connectivityInterval = setInterval(async () => {
      resetConnectivityCache()
      const online = await checkRealConnectivity()
      const prev = prevOnlineRef.current
      prevOnlineRef.current = online
      setIsOnline(online)

      if (prev !== null && prev !== online) {
        if (online) {
          toast({ title: "✅ اتصال برقرار شد", description: "ارتباط با سرور برقرار شد" })
        } else {
          toast({
            variant: "destructive",
            title: "⚠️ آفلاین",
            description: "اتصال به سرور قطع شد. حالت آفلاین فعال است.",
          })
        }
      }
    }, 30000)

    const handleSyncComplete = () => updatePendingOps()
    const handleQueueUpdated = () => updatePendingOps()
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
      clearTimeout(loadingTimeout)
      clearInterval(connectivityInterval)
      cleanup()
      stopBackgroundSync()
      window.removeEventListener("sync-complete", handleSyncComplete)
      window.removeEventListener("queue-updated", handleQueueUpdated)
      window.removeEventListener("sync-error", handleSyncError as EventListener)
    }
  }, [router])

  function updatePendingOps() {
    setPendingOps(getQueueSize())
  }

  async function handleLogout() {
    stopBackgroundSync()
    await logout()
    router.push("/auth")
    router.refresh()
  }

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
