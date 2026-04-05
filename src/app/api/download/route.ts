import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signStoragePath } from '@/lib/supabase/storage'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

/**
 * GET /api/download?path={storagePath}&filename={filename}
 *
 * Generates a short-lived signed URL for the given storage path and streams
 * the file back as a download attachment. Requires an authenticated session
 * OR a valid delivery token passed as ?token={token} for public delivery links.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const storagePath = searchParams.get('path')
  const filename    = searchParams.get('filename') ?? 'download'
  const token       = searchParams.get('token')

  if (!storagePath) {
    return new NextResponse('Missing path parameter', { status: 400 })
  }

  const supabase = createClient()
  let   userId: string | null = null

  if (token) {
    const { data: link } = await supabase
      .from('delivery_links')
      .select('id')
      .eq('token', token)
      .single()
    if (!link) {
      return new NextResponse('Invalid delivery token', { status: 403 })
    }
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    userId = user.id
  }

  try {
    const signedUrl = await signStoragePath(storagePath, 60)

    const res = await fetch(signedUrl)
    if (!res.ok) {
      return new NextResponse('Failed to fetch file from storage', { status: res.status })
    }

    const buffer      = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'

    // Audit log (fire-and-forget — never block the download response)
    const service = createServiceClient()
    writeAudit(service, {
      userId,
      action:     'photo_downloaded',
      entityType: 'photo',
      entityId:   null,
      metadata:   {
        storage_path: storagePath,
        filename,
        via_delivery: !!token,
      },
    }).catch(() => {})

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[download] error:', err)
    return new NextResponse('Download failed', { status: 500 })
  }
}
