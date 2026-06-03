# Phase 3: Route Updates

This document is the change list for the 59 route files in src/app/api plus the
two client-side direct inserts in src/components and src/app/events/new.

The shape of the changes:

1. **New helper `requireApiUserWithOrg()` in `src/lib/api-auth.ts`** —
   resolves both the authenticated user AND their org_id (currently always
   "Recess" since you're a single-org SaaS). Use this in any route that
   inserts into a tenanted table.

2. **Client-side direct inserts** (NewProjectModal, events/new) need to
   either resolve the org_id themselves (extra round-trip) or be moved to
   API routes (cleaner). I recommend moving them to a new `/api/events`
   POST route — same auth pattern as everything else.

3. **Service-role routes that INSERT** into tenanted tables need to set
   `organisation_id` on the insert. Most derive from a parent event_id;
   some are top-level.

4. **Service-role routes that READ** from tenanted tables technically still
   work because service role bypasses RLS — but they should filter by
   organisation_id explicitly. For now (single-org), this is non-blocking.
   We add filtering in a follow-up cleanup.

5. **`/api/photographers`** insert is silently broken because it doesn't set
   org_id. This is why your photographer autocomplete only shows
   "disposable camera". Fix: set organisation_id on insert.

6. **`/api/upload/complete`** should set `photographer_id` (FK) when a
   photographer name is provided, not just the legacy text column.

---

## Step 1: Update `src/lib/api-auth.ts`

Replace the file contents entirely. The new helper resolves the user's org
membership in one place so every other route can reuse it.

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Verifies the current request has a valid authenticated session.
 * Returns auth.user (non-null) and an error response on failure.
 */
export async function requireApiUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const
  }
  return { user, response: null } as const
}

/**
 * Verifies the current request has a valid authenticated session AND
 * resolves the user's primary organisation_id.
 *
 * Returns auth.user (non-null), auth.organisationId (non-null), and an
 * error response on failure (401 if not authenticated, 403 if no org
 * membership).
 *
 * Currently the user is assumed to belong to exactly one organisation
 * (Recess). When we onboard customers with multiple orgs, this helper
 * will need an org-context header to disambiguate.
 */
export async function requireApiUserWithOrg() {
  const baseAuth = await requireApiUser()
  if (baseAuth.response) {
    return { user: null, organisationId: null, response: baseAuth.response } as const
  }

  // Use service-role here to read organisation_members regardless of caller's
  // RLS scope — the membership check is the security boundary, not RLS.
  const service = createServiceClient()
  const { data: membership, error } = await service
    .from('organisation_members')
    .select('organisation_id, role')
    .eq('user_id', baseAuth.user.id)
    .limit(1)
    .maybeSingle()

  if (error || !membership) {
    return {
      user: null,
      organisationId: null,
      response: NextResponse.json({ error: 'No organisation membership found' }, { status: 403 }),
    } as const
  }

  return {
    user: baseAuth.user,
    organisationId: membership.organisation_id as string,
    organisationRole: membership.role as 'owner' | 'editor' | 'viewer',
    response: null,
  } as const
}

/**
 * Verifies the current request is from an authenticated admin user
 * (platform-level admin, not org-level).
 */
export async function requireAdminUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return {
      user: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as const
  }
  return { user, response: null } as const
}
```

---

## Step 2: Move event creation to a server route

Create new file: `src/app/api/events/route.ts`

```ts
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
```

---

## Step 3: Update client-side event creation to use the new route

### `src/components/archive/NewProjectModal.tsx`

Replace the insert block (lines ~63-95) — the code that does
`supabase.from('events').insert(...)` and then fires the audit fetch.

**Before:**
```ts
const supabase = createClient()
const { data, error: dbError } = await supabase
  .from('events')
  .insert({
    name:          form.name.trim(),
    date:          form.date,
    location:      form.location.trim() || null,
    venue:         form.venue.trim() || null,
    description:   form.description.trim() || null,
    photographers: photographers,
  })
  .select()
  .single()

setLoading(false)

if (dbError) {
  setError(dbError.message)
  return
}

const eventId = data.id

// Audit log — fire and forget
fetch('/api/audit', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({
    action:     'project_created',
    entityType: 'project',
    entityId:   eventId,
    metadata:   { name: form.name.trim(), date: form.date },
  }),
})
```

**After:**
```ts
const res = await fetch('/api/events', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({
    name:          form.name.trim(),
    date:          form.date,
    location:      form.location.trim() || null,
    venue:         form.venue.trim() || null,
    description:   form.description.trim() || null,
    photographers: photographers,
  }),
})

setLoading(false)

if (!res.ok) {
  const err = await res.json().catch(() => ({}))
  setError(err.error || 'Failed to create project')
  return
}

const { event } = await res.json()
const eventId = event.id

// Audit happens server-side now, no second fetch needed
```

### `src/app/events/new/page.tsx`

Same change. Find the `.from('events').insert(...)` block (line ~42) and
replace with the same `fetch('/api/events', ...)` POST pattern as above.

---

## Step 4: Fix `src/app/api/folders/route.ts`

**Before:**
```ts
const supabase = getServiceClient()
const { data, error } = await supabase
  .from('folders')
  .insert({ event_id, name: name.trim() })
```

**After:**
```ts
const supabase = getServiceClient()

// Resolve organisation_id from the parent event
const { data: event, error: eventErr } = await supabase
  .from('events')
  .select('organisation_id')
  .eq('id', event_id)
  .single()

if (eventErr || !event) {
  return NextResponse.json({ error: 'Event not found' }, { status: 404 })
}

const { data, error } = await supabase
  .from('folders')
  .insert({
    event_id,
    organisation_id: event.organisation_id,
    name:            name.trim(),
  })
```

Also: the file uses its own local `getServiceClient()` instead of importing
from `@/lib/supabase/service`. Replace that with the canonical import. Same
applies to other routes that have inlined service-client creation.

---

## Step 5: Fix `src/app/api/photographers/route.ts`

**This is what's been silently breaking the photographer autocomplete.**

The whole file should be rewritten using the new helper. Replace the file entirely:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/photographers?q=search  — autocomplete search scoped to caller's org
export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const supabase = createServiceClient()

    let query = supabase
      .from('photographers')
      .select('id, name, created_at')
      .eq('organisation_id', auth.organisationId)
      .order('name')
      .limit(10)

    if (q) query = query.ilike('name', `%${q}%`)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ photographers: data ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

// POST /api/photographers — upsert photographer by name in caller's org
export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { name?: string }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const supabase = createServiceClient()

    // Case-insensitive lookup within this org
    const { data: existing, error: selectError } = await supabase
      .from('photographers')
      .select()
      .eq('organisation_id', auth.organisationId)
      .ilike('name', name)
      .maybeSingle()

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ photographer: existing }, { status: 200 })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('photographers')
      .insert({
        organisation_id: auth.organisationId,
        name,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ photographer: inserted }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
```

---

## Step 6: Update `src/app/api/upload/complete/route.ts`

Two changes: set `photographer_id` when a photographer name is provided, and
verify the event belongs to the caller's org.

After the validation block (around line 41), add an event ownership check:

```ts
const supabase = createServiceClient()

// Verify event belongs to caller's org and resolve org id
const { data: event, error: eventErr } = await supabase
  .from('events')
  .select('organisation_id')
  .eq('id', event_id)
  .single()

if (eventErr || !event) {
  return NextResponse.json({ error: 'Event not found' }, { status: 404 })
}

const auth2 = await requireApiUserWithOrg()
if (auth2.response) return auth2.response
if (event.organisation_id !== auth2.organisationId) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

(You can refactor to call `requireApiUserWithOrg()` instead of `requireApiUser()` at the top, then keep the org check.)

Then, before the `media_files.insert(...)`, resolve photographer_id if a name was passed:

```ts
let photographer_id: string | null = null
if (photographer) {
  // Upsert via the photographers table within this org
  const { data: existing } = await supabase
    .from('photographers')
    .select('id')
    .eq('organisation_id', event.organisation_id)
    .ilike('name', photographer)
    .maybeSingle()

  if (existing) {
    photographer_id = existing.id
  } else {
    const { data: inserted } = await supabase
      .from('photographers')
      .insert({
        organisation_id: event.organisation_id,
        name:            photographer,
      })
      .select('id')
      .single()
    photographer_id = inserted?.id ?? null
  }
}
```

Then add `photographer_id` to the insert:

```ts
.insert({
  event_id,
  filename:           archive_filename,
  ...
  photographer,         // keep text column for now
  photographer_id,      // NEW — proper FK
  folder_id,
})
```

---

## Step 7: The remaining INSERT routes

Same pattern applies to these — resolve `organisation_id` from a parent
event (for event-scoped tables) or from the caller's org (for top-level
tables), then include it on the insert.

### Event-scoped (org_id derived from event):

- `src/app/api/delivery/route.ts` — POST inserts delivery_links
- `src/app/api/share/route.ts` — POST inserts share_links
- `src/app/api/brands/route.ts` — POST inserts brands
- `src/app/api/performers/route.ts` — POST inserts performers

For each, the pattern is:

```ts
const { data: event } = await supabase
  .from('events').select('organisation_id').eq('id', event_id).single()
if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

await supabase.from('<TABLE>').insert({
  ...existing fields,
  organisation_id: event.organisation_id,
})
```

### Top-level (org_id from caller):

- `src/app/api/venues/route.ts` — POST inserts venues
- `src/app/api/locations/route.ts` — POST inserts locations
- `src/app/api/photographers/route.ts` — already covered in Step 5

For these, switch to `requireApiUserWithOrg()` and include
`organisation_id: auth.organisationId` on the insert.

---

## Step 8: Read-only routes (LOWER priority)

These routes use service-role to read from tenanted tables. Because service
role bypasses RLS, they still work — but they need an explicit `org_id`
filter so users can't see other orgs' data once we onboard a second org.

For Recessland (single org), this is non-blocking. For the SaaS launch,
required. I recommend doing this in a Phase 4 cleanup, not tonight.

The routes affected (about 20+ routes that read events / media_files /
folders / etc.). Pattern for each:

```ts
const auth = await requireApiUserWithOrg()
// then add to every query:
.eq('organisation_id', auth.organisationId)
// or for child tables, JOIN through events.
```

---

## Verification plan

After applying Steps 1-7, deploy and test in this order:

1. **Login still works.** Load the app at trunq-nine.vercel.app, log in.
2. **Gallery loads.** Navigate to /projects, you should see your 95 events.
3. **Event creation works.** Create a new event. Should succeed.
4. **Upload works.** Upload a photo to an event. Should succeed.
5. **Photographer autocomplete works.** When uploading, type "Jojo" in the
   photographer field. Should show "Jojo" from the DB.
6. **Add a new photographer.** Type a new name like "Test Photographer",
   confirm. Then start a new upload — the name should appear in autocomplete.
7. **Tagging works.** Open an event, click "Tag & Score N images". Should
   queue without error.
8. **Folder creation works.** Create a folder in an event.
9. **Delivery link works.** Create a delivery link, copy URL, open in
   incognito. Should display the gallery.

If 1-9 all pass, the migration is functionally complete for your use case.

---

## Order of execution

1. Step 1 — update api-auth.ts.
2. Steps 2 & 3 — event creation moves to server route, both client files updated.
3. Step 5 — photographers route fix (will start saving photographers!).
4. Step 4 — folders route fix.
5. Step 7 — other INSERT routes (delivery, share, brands, performers, venues, locations).
6. Step 6 — upload/complete route enhanced for photographer FK.
7. Push to main, let Vercel deploy.
8. Run the verification plan against production.
9. Step 8 (read-only org filtering) — defer to Phase 4 cleanup, not blocking.

Estimated time: 1.5–2 hours of focused editing.
