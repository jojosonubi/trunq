# Archive — Product Document

## Overview

Archive is a smart media management tool built for events businesses. It provides a central repository for all photos and videos produced across events, with automatic EXIF metadata extraction, a clean dark-mode interface, and a foundation for AI-powered tagging and semantic search.

The core workflow: create an event → drag-and-drop media → Archive extracts metadata automatically → browse and manage your growing library.

---

## Architecture Decisions

### Next.js 14 App Router

The App Router enables a clean split between server components (data fetching, no client JS overhead) and client components (interactive upload UI, media grid lightbox). Server components fetch event and media data directly from Supabase with zero client-side waterfall. The API route at `/api/upload` handles file ingestion with full access to Node.js APIs.

### Supabase

Supabase provides three things in one:
- **Postgres** — relational DB for events, media_files, and tags with referential integrity and triggers
- **Storage** — S3-compatible object storage for the actual media files, served via public CDN URLs
- **Auth** (future) — row-level security policies are already in place, currently permissive; tighten by replacing `USING (true)` with auth checks

The service role key is used only in the server-side API route, never exposed to the client.

### TypeScript (strict mode)

All types are centralised in `src/types/index.ts` and shared across client and server. Strict mode catches null/undefined bugs at compile time.

### Tailwind CSS

Utility-first CSS with a custom dark palette (`background`, `surface`, `border`, `muted`) defined in `tailwind.config.ts`. No component library dependency — all UI is hand-rolled with consistent dark-theme conventions.

---

## Database Schema

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `name` | TEXT | Required |
| `date` | DATE | Event date |
| `location` | TEXT | Optional |
| `description` | TEXT | Optional |
| `cover_image_url` | TEXT | Optional, set manually or auto-assigned |
| `media_count` | INTEGER | Maintained by trigger, always in sync |
| `created_at` | TIMESTAMPTZ | Auto-set |

### `media_files`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK → events, cascade delete |
| `filename` | TEXT | Original filename |
| `storage_path` | TEXT | Path in Supabase Storage bucket |
| `public_url` | TEXT | CDN URL for display |
| `file_type` | TEXT | `image`, `video`, or `graphic` |
| `file_size` | BIGINT | Bytes |
| `width` / `height` | INTEGER | From EXIF or image metadata |
| `exif_date_taken` | TIMESTAMPTZ | DateTimeOriginal from EXIF |
| `exif_gps_lat` / `exif_gps_lng` | DOUBLE PRECISION | GPS coordinates |
| `exif_camera_make` / `exif_camera_model` | TEXT | Camera info |
| `exif_iso` / `exif_aperture` / `exif_shutter_speed` / `exif_focal_length` | MIXED | Exposure settings |
| `quality_score` | DOUBLE PRECISION | Reserved for future AI scoring |
| `created_at` | TIMESTAMPTZ | Upload timestamp |

`media_count` on `events` is kept accurate by two database triggers:
- `trg_increment_media_count` — fires AFTER INSERT on `media_files`
- `trg_decrement_media_count` — fires AFTER DELETE on `media_files`

### `tags`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `media_file_id` | UUID | FK → media_files, cascade delete |
| `tag_type` | TEXT | `scene`, `mood`, `subject`, `colour`, `ai_generated`, `manual` |
| `value` | TEXT | Tag value (e.g. "outdoor", "energetic", "crowd") |
| `confidence` | DOUBLE PRECISION | 0–1 confidence from AI model, null for manual tags |
| `created_at` | TIMESTAMPTZ | Auto-set |

---

## File Storage Strategy

Files are stored in a Supabase Storage bucket named `media`. The path structure is:

```
media/{event_id}/{uuid}.{ext}
```

Using the event UUID as the folder groups all media for an event and makes it easy to list or delete all files for an event. The UUID filename avoids collisions and original filenames are preserved in the `media_files.filename` column.

The bucket is public, so `getPublicUrl()` returns a stable CDN URL that can be stored in Postgres and used directly in `<Image>` tags.

The 50 MB per-file limit is set in `supabase/storage.sql`. Accepted MIME types are explicitly listed to prevent non-media uploads.

---

## EXIF Extraction Approach

EXIF data is extracted **client-side** before the upload request, using the `exifr` library (`src/lib/exif.ts`). This has several advantages:

1. **No server memory pressure** — parsing happens in the browser, not the Node.js API route
2. **Fast UI feedback** — extraction is async and non-blocking
3. **Rich metadata** — `exifr` handles TIFF, EXIF, and GPS blocks from JPEG, HEIC, and other formats

The extracted `ExifData` object is JSON-serialised and sent as a form field (`exif_data`) alongside the file in the upload `FormData`. The API route deserialises it and maps the fields directly to the `media_files` insert.

If parsing fails (e.g. for graphics or videos), `extractExif` returns a null-filled object and the upload continues normally.

---

## Upload Flow

1. User drops files onto the `DropZone` component
2. For each file (with a 150ms stagger):
   a. Status → `uploading`
   b. `extractExif(file)` runs client-side → returns `ExifData`
   c. `FormData` is built: `file`, `event_id`, `exif_data` (JSON string)
   d. Status → `processing`
   e. `POST /api/upload` is called
3. API route (`src/app/api/upload/route.ts`):
   a. Parses `FormData`
   b. Generates a UUID-based storage path
   c. Uploads the file to Supabase Storage (`media` bucket)
   d. Gets the public CDN URL
   e. Inserts a row into `media_files` with all EXIF fields
   f. Returns the created `MediaFile` as JSON
4. Client sets status → `done` (or `error` with message)
5. When all files complete, `onUploadComplete` is called, which can be used to trigger a page refresh

Progress bars on each file item reflect the stages (0 → 25% EXIF → 60% processing → 100% done).

---

## Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Your project URL from Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Anon/public key — safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (`/api/upload`) | Never expose to client — bypasses RLS |

Copy `.env.local.example` to `.env.local` and fill in values from your Supabase project settings (Settings → API).

---

## Future Roadmap

### AI Tagging (Claude Vision API)
After upload, send each image URL to the Claude vision API with a structured prompt requesting scene classification, mood tags, subject detection, and dominant colour extraction. Store results in the `tags` table with `tag_type = 'ai_generated'` and confidence scores. Surface tags in the media grid UI as filterable chips.

### Semantic Search (pgvector)
Generate CLIP-style embeddings for each image (via an edge function or background job) and store them as `vector(512)` columns. Add a search bar that embeds the query and does approximate nearest-neighbour search with `pgvector`. Enables natural language search like "energetic crowd shots at night".

### Quality Scoring
Implement a lightweight sharpness + exposure scoring function (either client-side using canvas or server-side via a small model) that writes a `quality_score` (0–1) to `media_files`. Use this to surface the best shots in a "top picks" view and filter out blurry/over-exposed frames automatically.

### Social Export
Allow selecting a set of media files and exporting them as a formatted ZIP with renamed files, or generate a shareable gallery link (public read via a signed URL set) for clients to review and download selects.

### Authentication
Add Supabase Auth (email magic link or OAuth). Tighten RLS policies to `auth.uid() = owner_id` once the `owner_id` column is added to `events`. Staff members can be added as collaborators per event.

### Bulk Delete & Move
Multi-select in the media grid, with bulk delete (removes from storage and DB), move to another event, and download selected.

---

## Future Feature: Dual Modes

**Event Mode** — Simplified UI optimised for speed and mobile. Designed for use on the day of the event: quick upload, quick social select, minimal UI surface.

**Studio Mode** — Full feature set for post-event curation: cropping, approval flow, and analytics.

Same product, two contexts.
