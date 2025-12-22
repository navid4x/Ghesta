"use client"

import { InstallmentDashboard } from "@/components/installment-dashboard"
import { Wallet, LogOut } from "lucide-react"
import { getTodayPersian, persianMonths } from "@/lib/persian-calendar"
import { Button } from "@/components/ui/button"
import { logout, getCurrentUser, setupOnlineListener } from "@/lib/simple-auth"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { getPendingOperationsCount } from "@/lib/data-sync"

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingOps, setPendingOps] = useState(0)

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUser()
      if (!currentUser) {
        router.replace("/auth")
      } else {
        setUser(currentUser)
        setLoading(false)
        updatePendingOps()
      }
    }

    loadUser()
    setIsOnline(navigator.onLine)

    const cleanup = setupOnlineListener(async (online) => {
      setIsOnline(online)
      if (online) {
        // رفرش کردن اطلاعات کاربر
        const refreshedUser = await getCurrentUser()
        if (refreshedUser) {
          setUser(refreshedUser)
        }
        updatePendingOps()
      }
    })

    return cleanup
  }, [router])

  function updatePendingOps() {
    setPendingOps(getPendingOperationsCount())
  }

  async function handleLogout() {
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
              <h1 className="text-2xl font-bold">مدیریت اقساط</h1>
              <p className="text-sm text-muted-foreground mt-1">{toPersianDigits(todayPersianString)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pendingOps > 0 && (
              <Badge variant="secondary" className="gap-1.5">
                {toPersianDigits(pendingOps)} در صف سینک
              </Badge>
            )}

            <Button onClick={handleLogout} variant="ghost" size="sm" className="gap-2">
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
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
