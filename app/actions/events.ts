"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createEvent(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "لطفاً وارد شوید" }
  }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const eventDate = formData.get("event_date") as string
  const eventTime = formData.get("event_time") as string
  const reminderMinutes = Number.parseInt((formData.get("reminder_minutes") as string) || "30")

  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: user.id,
      title,
      description,
      event_date: eventDate,
      event_time: eventTime || null,
      reminder_minutes: reminderMinutes,
      is_holiday: false,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { data }
}

export async function updateEvent(eventId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "لطفاً وارد شوید" }
  }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const eventDate = formData.get("event_date") as string
  const eventTime = formData.get("event_time") as string
  const reminderMinutes = Number.parseInt((formData.get("reminder_minutes") as string) || "30")

  const { data, error } = await supabase
    .from("events")
    .update({
      title,
      description,
      event_date: eventDate,
      event_time: eventTime || null,
      reminder_minutes: reminderMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { data }
}

export async function deleteEvent(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "لطفاً وارد شوید" }
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId).eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function getEvents(startDate: string, endDate: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: [] }
  }

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", user.id)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching events:", error)
    return { data: [] }
  }

  return { data: data as Event[] }
}
