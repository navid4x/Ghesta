"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { loginOrSignup, getCurrentUser } from "@/lib/simple-auth"
import { WifiOff, Wifi, Wallet } from "lucide-react"

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    async function checkUser() {
      const user = await getCurrentUser()
      if (user) {
        router.replace("/")
      }
    }
    checkUser()

    setIsOnline(navigator.onLine)
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
      const result = await loginOrSignup(email, password)

      if (result.error) {
        toast({
          title: "خطا",
          description: result.error,
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      if (result.user) {
        // نمایش پیام بر اساس عملیات انجام شده
        const messages = {
          login_online: { title: "✅ خوش آمدید!", desc: "با موفقیت وارد شدید" },
          signup_online: { title: "✅ حساب شما ایجاد شد!", desc: "خوش آمدید" },
          login_offline: { title: "📱 ورود آفلاین", desc: "با اطلاعات محلی وارد شدید" },
          signup_offline: { title: "📱 ثبت‌نام آفلاین", desc: "هنگام اتصال به اینترنت همگام‌سازی می‌شود" },
        }

        const key = `${result.action}_${result.isOnline ? 'online' : 'offline'}` as keyof typeof messages
        const message = messages[key]

        toast({
          title: message.title,
          description: message.desc,
        })

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
      {/* نشانگر وضعیت اینترنت */}
      <div className="absolute top-4 right-4">
        {isOnline ? (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-full">
            <Wifi className="h-4 w-4" />
            <span>آنلاین</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-full">
            <WifiOff className="h-4 w-4" />
            <span>آفلاین</span>
          </div>
        )}
      </div>

      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30">
              <Wallet className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">مدیریت اقساط</CardTitle>
          <CardDescription className="text-base">
            برای ورود یا ثبت‌نام، ایمیل و رمز عبور خود را وارد کنید
            {!isOnline && (
              <span className="block mt-2 text-orange-600 dark:text-orange-400 font-medium">
                🔒 حالت آفلاین - اطلاعات محلی ذخیره می‌شود
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
                  🔐 اگر حساب کاربری دارید وارد می‌شوید، در غیر این صورت حساب جدید ایجاد می‌شود
                </>
              ) : (
                <>
                  📱 در حالت آفلاین می‌توانید کار کنید. هنگام اتصال به اینترنت، اطلاعات شما همگام‌سازی می‌شود
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
