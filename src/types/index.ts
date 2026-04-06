export interface Event {
  id: string
  name: string
  date: string
  location: string | null
  venue: string | null
  description: string | null
  cover_image_url: string | null
  media_count: number
  photographers: string[]
  thumbnail_storage_path: string | null
  created_at: string
  deleted_at: string | null
}

/** Alias — the DB table stays "events", but the UI calls them Projects. */
export type Project = Event

export interface Photographer {
  id: string
  name: string
  created_at: string
}

export interface Performer {
  id: string
  event_id: string
  name: string
  role: string | null
  reference_url: string | null
  reference_storage_path: string | null
  created_at: string
}

export interface PerformerTag {
  id: string
  media_file_id: string
  performer_id: string
  confidence: number
  created_at: string
}

export interface PerformerTagWithPerformer extends PerformerTag {
  /** Supabase join — singular object because performer_id is a FK to one row */
  performers: Performer
}

export interface Brand {
  id: string
  event_id: string
  name: string
  reference_url: string | null
  reference_storage_path: string | null
  created_at: string
}

export interface BrandTag {
  id: string
  media_file_id: string
  brand_id: string
  confidence: number
  created_at: string
}

export interface BrandTagWithBrand extends BrandTag {
  brands: Brand
}

export interface Folder {
  id: string
  event_id: string
  name: string
  created_at: string
}

export interface AuditLog {
  id:          string
  user_id:     string | null
  action:      string
  entity_type: string | null
  entity_id:   string | null
  metadata:    Record<string, unknown>
  created_at:  string
  profiles:    { full_name: string | null; email: string } | null
}

export interface MediaFile {
  id: string
  event_id: string
  filename: string
  original_filename: string | null
  file_hash: string | null
  storage_path: string
  public_url: string
  file_type: 'image' | 'video' | 'graphic'
  file_size: number
  width: number | null
  height: number | null
  exif_date_taken: string | null
  exif_gps_lat: number | null
  exif_gps_lng: number | null
  exif_camera_make: string | null
  exif_camera_model: string | null
  exif_iso: number | null
  exif_aperture: number | null
  exif_shutter_speed: string | null
  exif_focal_length: number | null
  quality_score: number | null
  description: string | null
  photographer: string | null
  usage_type: 'all_rights' | 'editorial_only' | 'client_use' | 'restricted' | null
  usage_expires_at: string | null
  usage_notes: string | null
  review_status: 'pending' | 'approved' | 'rejected' | 'held'
  starred: boolean
  folder_id: string | null
  face_scanned: boolean
  brand_scanned: boolean
  dominant_colours: string[]
  created_at: string
  deleted_at: string | null
  /** Populated server-side before passing to client; not stored in DB. */
  signed_url?: string
}

export interface DeliveryLink {
  id: string
  event_id: string
  token: string
  created_at: string
}

export interface MediaFileWithTags extends MediaFile {
  tags: Tag[]
  performer_tags: PerformerTagWithPerformer[]
  brand_tags: BrandTagWithBrand[]
}

export interface Tag {
  id: string
  media_file_id: string
  tag_type: 'scene' | 'mood' | 'subject' | 'colour' | 'ai_generated' | 'manual'
  value: string
  confidence: number | null
  created_at: string
}

export interface UploadProgress {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'tagging' | 'done' | 'error'
  error?: string
  mediaFile?: MediaFile
}
