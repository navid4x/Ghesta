import { type NextRequest, NextResponse } from "next/server"
import webPush from "web-push"
import { createClient } from "@supabase/supabase-js"

// تنظیم VAPID
webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || "",
)

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
)

export async function POST(request: NextRequest) {
  try {
    const { userId, title, body, url } = await request.json()

    // گرفتن subscription های کاربر
    const { data: subscriptions, error } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId)

    if (error || !subscriptions?.length) {
      return NextResponse.json({ error: "No subscriptions found" }, { status: 404 })
    }

    // ارسال به همه دستگاه‌های کاربر
    const results = await Promise.allSettled(
      subscriptions.map((sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }
        return webPush.sendNotification(pushSubscription, JSON.stringify({ title, body, url: url || "/" }))
      }),
    )

    const successCount = results.filter((r) => r.status === "fulfilled").length

    return NextResponse.json({ success: true, sent: successCount })
  } catch (error) {
    console.error("[v0] Send push error:", error)
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 })
  }
}

// GET برای cron job - چک روزانه اقساط
export async function GET(request: NextRequest) {
  // چک کردن auth header برای امنیت cron
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // در development اجازه بده
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    // تاریخ فردا برای یادآوری
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split("T")[0]

    // گرفتن اقساط سررسید امروز
    const { data: todayPayments } = await supabase
      .from("installment_payments")
      .select(`
        id, due_date, amount, is_paid,
        installment:installments!inner(id, user_id, creditor_name, item_description)
      `)
      .eq("due_date", todayStr)
      .eq("is_paid", false)

    // گرفتن اقساط سررسید فردا
    const { data: tomorrowPayments } = await supabase
      .from("installment_payments")
      .select(`
        id, due_date, amount, is_paid,
        installment:installments!inner(id, user_id, creditor_name, item_description)
      `)
      .eq("due_date", tomorrowStr)
      .eq("is_paid", false)

    const notifications: Array<{ userId: string; title: string; body: string }> = []

    // نوتیفیکیشن‌های امروز
    todayPayments?.forEach((payment: any) => {
      notifications.push({
        userId: payment.installment.user_id,
        title: "یادآوری قسط امروز",
        body: `قسط ${payment.installment.creditor_name} به مبلغ ${new Intl.NumberFormat("fa-IR").format(payment.amount)} تومان امروز سررسید است`,
      })
    })

    // نوتیفیکیشن‌های فردا
    tomorrowPayments?.forEach((payment: any) => {
      notifications.push({
        userId: payment.installment.user_id,
        title: "یادآوری قسط فردا",
        body: `قسط ${payment.installment.creditor_name} به مبلغ ${new Intl.NumberFormat("fa-IR").format(payment.amount)} تومان فردا سررسید است`,
      })
    })

    // ارسال نوتیفیکیشن‌ها
    let sentCount = 0
    for (const notif of notifications) {
      const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").eq("user_id", notif.userId)

      if (subscriptions?.length) {
        for (const sub of subscriptions) {
          try {
            await webPush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({ title: notif.title, body: notif.body, url: "/" }),
            )
            sentCount++
          } catch (err: any) {
            // اگر subscription منقضی شده، حذفش کن
            if (err.statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked: { today: todayPayments?.length || 0, tomorrow: tomorrowPayments?.length || 0 },
      sent: sentCount,
    })
  } catch (error) {
    console.error("[v0] Cron error:", error)
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 })
  }
}
