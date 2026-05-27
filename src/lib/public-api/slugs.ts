const PUBLIC_ORG_SLUGS: Record<string, string> = {
  recess: '2b557660-6bb3-4d41-9b49-71e860681b9c',
}

const PUBLIC_EVENT_SLUGS: Record<string, string> = {
  'recessland-2026': '6c5527a5-a7b3-41ef-b872-061fca9e52cf',
  'recess-nyc-2023': '05452d1d-8851-4fc9-99e0-8f9818996863', // TEMP: tag search verification only
}

export function resolvePublicOrg(slug: string | null): string | null {
  if (!slug) return null
  return PUBLIC_ORG_SLUGS[slug] ?? null
}

export function resolvePublicEvent(slug: string | null): string | null {
  if (!slug) return null
  return PUBLIC_EVENT_SLUGS[slug] ?? null
}

// TODO: replace hardcoded maps with DB lookups when events.slug and organisations.slug columns exist.
