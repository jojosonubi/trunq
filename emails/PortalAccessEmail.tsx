import * as React from 'react'
import {
  Html, Head, Preview, Body, Container,
  Section, Text, Link, Hr,
} from '@react-email/components'

interface Props {
  recipientName?: string
  eventName:      string
  portalUrl:      string
  senderName?:    string
  expiresAt?:     string | null
}

export default function PortalAccessEmail({
  recipientName,
  eventName,
  portalUrl,
  senderName,
  expiresAt,
}: Props) {
  const greeting  = recipientName ? `Hi ${recipientName},` : 'Hi,'
  const from      = senderName    ? `${senderName} has` : 'Your photographer has'

  return (
    <Html lang="en">
      <Head />
      <Preview>Your photos from {eventName} are ready to view.</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Wordmark */}
          <Text style={wordmark}>TRUNQ</Text>

          <Hr style={rule} />

          <Section style={section}>
            <Text style={heading}>Your photos are ready.</Text>
            <Text style={para}>
              {greeting}
            </Text>
            <Text style={para}>
              {from} shared a photo delivery for{' '}
              <span style={{ color: '#ffffff' }}>{eventName}</span>.
              Use the link below to view and download your selects.
            </Text>

            {/* CTA */}
            <Section style={ctaWrap}>
              <Link href={portalUrl} style={ctaButton}>
                View your photos →
              </Link>
            </Section>

            <Text style={urlNote}>
              Or copy this link into your browser:{' '}
              <Link href={portalUrl} style={urlLink}>{portalUrl}</Link>
            </Text>

            {expiresAt && (
              <Text style={expiry}>
                This link expires on{' '}
                {new Date(expiresAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
                .
              </Text>
            )}
          </Section>

          <Hr style={rule} />

          <Text style={footer}>
            Delivered via{' '}
            <Link href="https://trunq.so" style={footerLink}>Trunq</Link>
            . If you weren't expecting this, you can safely ignore it.
          </Text>

        </Container>
      </Body>
    </Html>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  fontFamily:      "'Inter', 'Helvetica Neue', Arial, sans-serif",
  margin:          0,
  padding:         0,
}

const container: React.CSSProperties = {
  maxWidth:  560,
  margin:    '0 auto',
  padding:   '40px 24px',
}

const wordmark: React.CSSProperties = {
  fontSize:      13,
  fontWeight:    700,
  letterSpacing: '0.18em',
  color:         '#ff2d00',
  margin:        '0 0 24px',
}

const rule: React.CSSProperties = {
  borderTop:    '1px solid #1a1a1a',
  borderBottom: 'none',
  margin:       '0 0 28px',
}

const section: React.CSSProperties = {
  marginBottom: 28,
}

const heading: React.CSSProperties = {
  fontSize:     18,
  fontWeight:   600,
  color:        '#ffffff',
  margin:       '0 0 16px',
  lineHeight:   1.4,
}

const para: React.CSSProperties = {
  fontSize:   14,
  color:      '#888888',
  lineHeight: 1.7,
  margin:     '0 0 12px',
}

const ctaWrap: React.CSSProperties = {
  margin: '24px 0',
}

const ctaButton: React.CSSProperties = {
  display:         'inline-block',
  backgroundColor: '#ff2d00',
  color:           '#ffffff',
  fontSize:        13,
  fontWeight:      600,
  letterSpacing:   '0.02em',
  padding:         '12px 24px',
  borderRadius:    4,
  textDecoration:  'none',
}

const urlNote: React.CSSProperties = {
  fontSize:   11,
  color:      '#444444',
  lineHeight: 1.6,
  margin:     '0 0 12px',
  wordBreak:  'break-all',
}

const urlLink: React.CSSProperties = {
  color:          '#666666',
  textDecoration: 'underline',
}

const expiry: React.CSSProperties = {
  fontSize:   12,
  color:      '#444444',
  margin:     '8px 0 0',
}

const footer: React.CSSProperties = {
  fontSize:   11,
  color:      '#333333',
  lineHeight: 1.6,
  margin:     0,
}

const footerLink: React.CSSProperties = {
  color:          '#555555',
  textDecoration: 'underline',
}
