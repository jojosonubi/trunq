/**
 * App-wide formatting helpers. ONE date format everywhere: DD/MM/YYYY.
 *
 * Date-only strings ('YYYY-MM-DD', e.g. events.date) are parsed as LOCAL
 * dates — `new Date('YYYY-MM-DD')` is UTC midnight, which renders as the
 * PREVIOUS day for viewers west of UTC.
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return ''
  let d: Date
  if (input instanceof Date) {
    d = input
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
    d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(input)
  }
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** Avatar initials from a profile-ish object. */
export function initials(p: { full_name?: string | null; email: string }): string {
  if (p.full_name) {
    const parts = p.full_name.trim().split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return p.email[0].toUpperCase()
}
