import { type NextRequest, NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  // Just pass through - auth is handled client-side
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
