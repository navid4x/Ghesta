import { type NextRequest, NextResponse } from "next/server"
// @ts-ignore
import webPush from "web-push"
import { createClient } from "@supabase/supabase-js"

// تنظیم VAPID
webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || "",
)

// Supabase با Service Role Key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// ========================================
// 📤 POST: ارسال نوتیف دستی
// ========================================
export async function POST(request: NextRequest) {
  try {
    const { userId, title, body, url } = await request.json()

    // گرفتن subscription های کاربر
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId)

    if (error || !subscriptions?.length) {
      return NextResponse.json({ error: "No subscriptions found" }, { status: 404 })
    }

    // ارسال به همه دستگاه‌های کاربر
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }
        
        try {
          await webPush.sendNotification(
            pushSubscription,
            JSON.stringify({ title, body, url: url || "/" })
          )
          return { success: true, endpoint: sub.endpoint }
        } catch (err: any) {
          // اگر subscription منقضی شده، حذفش کن
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint)
          }
          throw err
        }
      }),
    )

    const successCount = results.filter((r) => r.status === "fulfilled").length

    return NextResponse.json({ success: true, sent: successCount })
  } catch (error) {
    console.error("[v0] Send push error:", error)
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 })
  }
}

// ========================================
// ⏰ GET: Cron Job - چک خودکار اقساط
// ========================================
export async function GET(request: NextRequest) {
  // چک کردن auth header برای امنیت cron
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split("T")[0]

    console.log(`[Cron] Checking installments for ${todayStr}`)

    // ========================================
    // 1️⃣ گرفتن تمام اقساط فعال
    // ========================================
    const { data: installments, error: installmentsError } = await supabase
      .from("installments")
      .select(`
        id,
        user_id,
        creditor_name,
        reminder_days,
        installment_payments!inner(
          id,
          due_date,
          amount,
          is_paid
        )
      `)

    if (installmentsError) {
      throw installmentsError
    }

    if (!installments || installments.length === 0) {
      return NextResponse.json({ message: "No installments found", sent: 0 })
    }

    // ========================================
    // 2️⃣ پردازش هر قسط
    // ========================================
    const notifications: Array<{ 
      userId: string
      title: string
      body: string
      installmentId: string
      paymentId: string
    }> = []

    for (const installment of installments) {
      const payments = Array.isArray(installment.installment_payments) 
        ? installment.installment_payments 
        : [installment.installment_payments]

      for (const payment of payments) {
        if (payment.is_paid) continue

        const dueDate = new Date(payment.due_date)
        dueDate.setHours(0, 0, 0, 0)

        // محاسبه تاریخ یادآوری
        const reminderDate = new Date(dueDate)
        reminderDate.setDate(reminderDate.getDate() - installment.reminder_days)

        // فرمت مبلغ به فارسی
        const amountFormatted = new Intl.NumberFormat("fa-IR").format(payment.amount)

        // ========================================
        // 📅 چک کردن: آیا امروز روز یادآوری است؟
        // ========================================
        if (
          installment.reminder_days > 0 &&
          reminderDate.getTime() === today.getTime()
        ) {
          notifications.push({
            userId: installment.user_id,
            title: "🔔 یادآوری قسط",
            body: `قسط ${installment.creditor_name} به مبلغ ${amountFormatted} تومان ${installment.reminder_days} روز دیگه میرسه`,
            installmentId: installment.id,
            paymentId: payment.id,
          })
        }

        // ========================================
        // 📅 چک کردن: آیا امروز روز سررسید است؟
        // ========================================
        if (dueDate.getTime() === today.getTime()) {
          notifications.push({
            userId: installment.user_id,
            title: `⚠️ قسط ${installment.creditor_name} یادت نره!`,
            body: `مبلغ قسط ${amountFormatted}`,
            installmentId: installment.id,
            paymentId: payment.id,
          })
        }
      }
    }

    if (notifications.length === 0) {
      return NextResponse.json({ 
        message: "No notifications to send today", 
        checked: installments.length,
        sent: 0 
      })
    }

    // ========================================
    // 3️⃣ ارسال نوتیفیکیشن‌ها
    // ========================================
    let sentCount = 0
    const failedNotifications: string[] = []

    // 🔧 FIX: گروه‌بندی نوتیف‌ها بر اساس userId
    const notifsByUser = new Map<string, typeof notifications>()
    for (const notif of notifications) {
      if (!notifsByUser.has(notif.userId)) {
        notifsByUser.set(notif.userId, [])
      }
      notifsByUser.get(notif.userId)!.push(notif)
    }

    // ارسال برای هر کاربر
    for (const [userId, userNotifications] of notifsByUser) {
      // گرفتن subscription های این کاربر یکبار
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId)

      if (!subscriptions?.length) {
        console.log(`[Cron] No subscriptions for user ${userId}`)
        failedNotifications.push(...userNotifications.map(n => n.installmentId))
        continue
      }

      // ارسال تک تک نوتیف‌ها به همه دستگاه‌های این کاربر
      for (const notif of userNotifications) {
        for (const sub of subscriptions) {
          try {
            await webPush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({
                title: notif.title,
                body: notif.body,
                url: "/",
                // ✨ استفاده از tag منحصر به فرد برای هر نوتیف
                tag: `installment-${notif.installmentId}-${notif.paymentId}`,
                // ✨ این باعث میشه هر نوتیف جداگانه نمایش داده بشه
                renotify: true,
              }),
            )
            sentCount++
          } catch (err: any) {
            console.error(`[Cron] Failed to send to ${sub.endpoint}:`, err.message)
            
            // اگر subscription منقضی شده، حذفش کن
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", sub.endpoint)
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked: installments.length,
      notificationsQueued: notifications.length,
      sent: sentCount,
      failed: failedNotifications.length > 0 ? failedNotifications.length : undefined,
    })
  } catch (error: any) {
    console.error("[Cron] Error:", error)
    return NextResponse.json({ 
      error: "Cron job failed", 
      message: error.message 
    }, { status: 500 })
  }
}
