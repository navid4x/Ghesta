"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { jalaliToGregorian } from "@/lib/persian-calendar"
import type { Event } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Trash2 } from "lucide-react"

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDate: [number, number, number] | null
  event: Event | null
  onSuccess: () => void
}

export function EventDialog({ open, onOpenChange, selectedDate, event, onSuccess }: EventDialogProps) {
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [time, setTime] = useState("")
  const [reminderMinutes, setReminderMinutes] = useState("30")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setDescription(event.description || "")
      setTime(event.event_time || "")
      setReminderMinutes(event.reminder_minutes.toString())
    } else {
      setTitle("")
      setDescription("")
      setTime("")
      setReminderMinutes("30")
    }
  }, [event])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDate) return

    setLoading(true)

    const [gy, gm, gd] = jalaliToGregorian(...selectedDate)
    const gregorianDate = `${gy}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`

    const stored = localStorage.getItem("calendar_events")
    const events: Event[] = stored ? JSON.parse(stored) : []

    if (event) {
      // Update existing event
      const index = events.findIndex((e) => e.id === event.id)
      if (index !== -1) {
        events[index] = {
          ...event,
          title,
          description,
          event_date: gregorianDate,
          event_time: time || null,
          reminder_minutes: Number.parseInt(reminderMinutes),
          updated_at: new Date().toISOString(),
        }
      }
    } else {
      // Create new event
      const newEvent: Event = {
        id: crypto.randomUUID(),
        user_id: "local-user",
        title,
        description,
        event_date: gregorianDate,
        event_time: time || null,
        reminder_minutes: Number.parseInt(reminderMinutes),
        is_holiday: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      events.push(newEvent)
    }

    localStorage.setItem("calendar_events", JSON.stringify(events))

    setLoading(false)
    toast({
      title: event ? "رویداد ویرایش شد" : "رویداد ایجاد شد",
      description: "رویداد با موفقیت ذخیره شد",
    })
    onSuccess()
    onOpenChange(false)
  }

  function handleDelete() {
    if (!event) return

    if (!confirm("آیا از حذف این رویداد اطمینان دارید؟")) return

    setLoading(true)

    const stored = localStorage.getItem("calendar_events")
    const events: Event[] = stored ? JSON.parse(stored) : []
    const filtered = events.filter((e) => e.id !== event.id)
    localStorage.setItem("calendar_events", JSON.stringify(filtered))

    setLoading(false)
    toast({
      title: "رویداد حذف شد",
      description: "رویداد با موفقیت حذف شد",
    })
    onSuccess()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "ویرایش رویداد" : "افزودن رویداد جدید"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">عنوان رویداد</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: جلسه کاری"
              required
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="description">توضیحات</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیحات اضافی..."
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="time">ساعت</Label>
            <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="reminder">یادآوری</Label>
            <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">۱۵ دقیقه قبل</SelectItem>
                <SelectItem value="30">۳۰ دقیقه قبل</SelectItem>
                <SelectItem value="60">یک ساعت قبل</SelectItem>
                <SelectItem value="1440">یک روز قبل</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            {event && (
              <Button type="button" variant="destructive" size="icon" onClick={handleDelete} disabled={loading}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "در حال ذخیره..." : event ? "ذخیره تغییرات" : "ایجاد رویداد"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
