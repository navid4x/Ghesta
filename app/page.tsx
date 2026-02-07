"use client"

import { InstallmentDashboard } from "@/components/installment-dashboard"
import { NotificationSettings } from "@/components/notification-settings"
import { Wallet, LogOut, Wifi, WifiOff } from "lucide-react"
import { getTodayPersian, persianMonths } from "@/lib/persian-calendar"
import { Button } from "@/components/ui/button"
import { logout, getCurrentUser } from "@/lib/simple-auth"
import { useSupabaseConnection } from "@/hooks/useSupabaseConnection"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { getPendingOperationsCount } from "@/lib/data-sync"
import { startBackgroundSync, stopBackgroundSync, getQueueSize } from "@/lib/background-sync"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const isOnline = useSupabaseConnection()
  const [pendingOps, setPendingOps] = useState(0)

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUser()

      console.log("[v0] Current user:", currentUser ? `${currentUser.email} (${currentUser.id})` : "None")

      if (!currentUser) {
        router.replace("/auth")
      } else {
        setUser(currentUser)
        setLoading(false)
        updatePendingOps()
        
        // ✨ شروع Background Sync
        startBackgroundSync()
      }
    }

    loadUser()

    // ✨ گوش دادن به sync-complete event
    const handleSyncComplete = () => {
      console.log("[v0] Sync complete!")
      updatePendingOps()
    }
    
    window.addEventListener('sync-complete', handleSyncComplete)

    return () => {
      stopBackgroundSync() // ✨ توقف Background Sync
      window.removeEventListener('sync-complete', handleSyncComplete)
    }
  }, [router])

  // Refresh user when coming back online
  useEffect(() => {
    if (isOnline && user) {
      console.log("[v0] Network online - refreshing user and syncing...")
      getCurrentUser().then((refreshedUser) => {
        if (refreshedUser) {
          setUser(refreshedUser)
        }
      })
      updatePendingOps()
    }
  }, [isOnline])

  function updatePendingOps() {
    setPendingOps(getQueueSize())
  }

  async function handleLogout() {
    stopBackgroundSync() // ✨ توقف قبل از logout
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
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30">
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
