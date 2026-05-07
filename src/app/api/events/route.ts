import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as {
      name:           string
      date:           string
      location?:      string | null
      venue?:         string | null
      description?:   string | null
      photographers?: string[]
    }

    if (!body.name?.trim() || !body.date) {
      return NextResponse.json(
        { error: 'name and date are required' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('events')
      .insert({
        organisation_id: auth.organisationId,
        name:            body.name.trim(),
        date:            body.date,
        location:        body.location?.trim() || null,
        venue:           body.venue?.trim() || null,
        description:     body.description?.trim() || null,
        photographers:   body.photographers ?? [],
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await writeAudit(supabase, {
      userId:     auth.user.id,
      action:     'project_created',
      entityType: 'project',
      entityId:   data.id,
      metadata:   { name: body.name.trim(), date: body.date },
    })

    return NextResponse.json({ event: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
