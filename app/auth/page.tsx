"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { signInOrSignUp, getCurrentUser } from "@/lib/auth-handler"
import { WifiOff, Wallet } from "lucide-react"
import { subscribeToPushNotifications } from "@/lib/push-notifications"
import { checkRealConnectivity, resetConnectivityCache } from "@/lib/network"

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  // پیش‌فرض true - فرم نمایش داده میشه، فقط در پس‌زمینه چک میکنیم
  const [isOnline, setIsOnline] = useState(true)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    // چک کاربر لاگین‌شده و وضعیت اتصال رو موازی اجرا میکنیم
    // فرم بلافاصله نمایش داده میشه
    async function init() {
      // موازی: هم چک connectivity، هم چک user
      const [online, currentUser] = await Promise.all([
        checkRealConnectivity(),
        getCurrentUser(),
      ])

      setIsOnline(online)

      // اگه لاگین بود redirect کن
      if (currentUser) {
        router.replace("/")
      }
    }

    init()

    // polling هر 15 ثانیه در پس‌زمینه
    const interval = setInterval(async () => {
      resetConnectivityCache()
      const online = await checkRealConnectivity()
      setIsOnline(online)
    }, 15000)

    const handleOnline = async () => {
      resetConnectivityCache()
      const online = await checkRealConnectivity()
      setIsOnline(online)
    }
    const handleOffline = () => {
      resetConnectivityCache()
      setIsOnline(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      clearInterval(interval)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 6) {
      toast({
        title: "خطا",
        description: "رمز عبور باید حداقل ۶ کاراکتر باشد",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      // موقع submit یه بار دیگه چک میکنیم
      resetConnectivityCache()
      const online = await checkRealConnectivity()
      setIsOnline(online)

      if (!online) {
        toast({
          title: "⚠️ اتصال به سرور لازم است",
          description: "برای ورود یا ثبت‌نام باید به سرور دسترسی داشته باشید",
          variant: "destructive",
        })
        return
      }

      const result = await signInOrSignUp(email, password)

      if (!result.success) {
        toast({
          title: "خطا",
          description: result.error || "ورود ناموفق بود",
          variant: "destructive",
        })
        return
      }

      const user = await getCurrentUser()

      if (user) {
        toast({
          title: result.isNewUser ? "✅ حساب شما ایجاد شد!" : "✅ خوش آمدید!",
          description: result.isNewUser ? "خوش آمدید به قسطا" : "با موفقیت وارد شدید",
        })

        if ("Notification" in window) {
          const permission = await Notification.requestPermission()
          if (permission === "granted") {
            await subscribeToPushNotifications(user.id)
          }
        }

        setTimeout(() => {
          router.push("/")
          router.refresh()
        }, 1000)
      }
    } catch (error: any) {
      toast({
        title: "خطا",
        description: error.message || "مشکلی پیش آمد",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30">
              <Wallet className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">قسطا</CardTitle>
          <CardDescription className="text-base">
            برای ورود یا ثبت‌نام، ایمیل و رمز عبور خود را وارد کنید
            {!isOnline && (
              <span className="block mt-2 text-orange-600 dark:text-orange-400 font-medium">
                ⚠️ اتصال به سرور برقرار نیست
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">ایمیل</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                dir="ltr"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                dir="ltr"
                className="mt-2"
              />
              <p className="mt-2 text-xs text-muted-foreground">حداقل ۶ کاراکتر</p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  در حال ورود...
                </span>
              ) : (
                "ورود / ثبت‌نام"
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              {isOnline ? (
                <>
                  🔐 اگر حساب کاربری دارید وارد می‌شوید، در غیر این صورت حساب جدید ایجاد می‌شود.
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 inline ml-1" />
                  دسترسی به سرور امکان‌پذیر نیست. لطفاً اتصال اینترنت خود را بررسی کنید.
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
