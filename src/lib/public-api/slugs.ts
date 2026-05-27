const PUBLIC_ORG_SLUGS: Record<string, string> = {
  recess: '2b557660-6bb3-4d41-9b49-71e860681b9c',
}

const PUBLIC_EVENT_SLUGS: Record<string, string> = {
  'recessland-2026': '6c5527a5-a7b3-41ef-b872-061fca9e52cf',
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
