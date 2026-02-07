"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { signInOrSignUp, getCurrentUser } from "@/lib/auth-handler"
import { useSupabaseConnection } from "@/hooks/useSupabaseConnection"
import { WifiOff, Wifi, Wallet } from "lucide-react"
import { subscribeToPushNotifications } from '@/lib/push-notifications'

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const isOnline = useSupabaseConnection()
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
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // بررسی اتصال اینترنت
    if (!isOnline) {
      toast({
        title: "⚠️ اتصال اینترنت لازم است",
        description: "برای ورود یا ثبت‌نام باید به اینترنت متصل باشید",
        variant: "destructive",
      })
      return
    }

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
      const result = await signInOrSignUp(email, password)

      if (!result.success) {
        toast({
          title: "خطا",
          description: result.error || "ورود ناموفق بود",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      // موفق بود
      const user = await getCurrentUser()
      
      if (user) {
        toast({
          title: result.isNewUser ? "✅ حساب شما ایجاد شد!" : "✅ خوش آمدید!",
          description: result.isNewUser ? "خوش آمدید به قسطا" : "با موفقیت وارد شدید",
        })

        // درخواست مجوز نوتیفیکیشن
        if ('Notification' in window) {
          const permission = await Notification.requestPermission()
          if (permission === 'granted') {
            await subscribeToPushNotifications(user.id)
            console.log("[v0] Notification access granted")
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
 
  return(
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
                ⚠️ برای ورود باید به اینترنت متصل باشید
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
                disabled={!isOnline}
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
                disabled={!isOnline}
              />
              <p className="mt-2 text-xs text-muted-foreground">حداقل ۶ کاراکتر</p>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-base font-semibold" 
              disabled={loading || !isOnline}
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
                  پس از ورود می‌توانید حتی در حالت آفلاین نیز کار کنید.
                </>
              ) : (
                <>
                  📱 برای اولین بار استفاده، باید به اینترنت متصل باشید. سپس می‌توانید آفلاین کار کنید.
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )

}

