"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LogOut, User } from "lucide-react"
import { useRouter } from "next/navigation"

interface AuthButtonProps {
  user: { email: string } | null
}

export function AuthButton({ user }: AuthButtonProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  if (!user) {
    return (
      <Button variant="outline" onClick={() => router.push("/auth/login")}>
        ورود
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4" />
        <span>{user.email}</span>
      </div>
      <Button variant="outline" size="icon" onClick={handleSignOut}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}
