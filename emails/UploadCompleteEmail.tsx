import * as React from 'react'
import {
  Html, Head, Preview, Body, Container,
  Section, Text, Link, Hr,
} from '@react-email/components'

interface Props {
  recipientName?: string
  eventName:      string
  photoCount:     number
  projectUrl:     string
}

export default function UploadCompleteEmail({
  recipientName,
  eventName,
  photoCount,
  projectUrl,
}: Props) {
  const display = recipientName ?? 'there'

  return (
    <Html lang="en">
      <Head />
      <Preview>{`${photoCount} photo${photoCount !== 1 ? 's' : ''} uploaded to ${eventName}.`}</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Wordmark */}
          <Text style={wordmark}>TRUNQ</Text>

          <Hr style={rule} />

          <Section style={section}>
            <Text style={heading}>Upload complete.</Text>
            <Text style={para}>Hey {display},</Text>
            <Text style={para}>
              <span style={{ color: '#ffffff' }}>
                {photoCount.toLocaleString()} photo{photoCount !== 1 ? 's' : ''}
              </span>{' '}
              have been uploaded to{' '}
              <span style={{ color: '#ffffff' }}>{eventName}</span>{' '}
              and are ready for review.
            </Text>

            <Section style={ctaWrap}>
              <Link href={projectUrl} style={ctaButton}>
                Go to project →
              </Link>
            </Section>
          </Section>

          <Hr style={rule} />

          <Text style={footer}>
            Sent by{' '}
            <Link href="https://trunq.so" style={footerLink}>Trunq</Link>.
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
  margin: '24px 0 0',
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
