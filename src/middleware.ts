import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/delivery',
  '/api/tag/process',
  '/api/tag/batch',
  '/api/rescore/process',
  '/api/rescore/batch',
  '/api/foto-lab/',
  '/api/share/',          // share link auth/media/review (unauthenticated viewers)
  '/api/webhooks/',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Propagate updated auth cookies to the browser
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          )
        },
      },
    }
  )

  // getUser() validates the JWT and refreshes the session if needed.
  // Must be called before any response is returned.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect unauthenticated visitors to /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect already-logged-in users away from auth pages
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const next = request.nextUrl.searchParams.get('next') ?? '/projects'
    const url  = request.nextUrl.clone()
    url.pathname = next
    url.search   = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Run on all routes except static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
