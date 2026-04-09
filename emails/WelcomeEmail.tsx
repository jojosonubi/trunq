import * as React from 'react'
import {
  Html, Head, Preview, Body, Container,
  Section, Text, Link, Hr,
} from '@react-email/components'

interface Props {
  name?: string
}

export default function WelcomeEmail({ name }: Props) {
  const display = name ?? 'there'

  return (
    <Html lang="en">
      <Head />
      <Preview>Welcome to Trunq — your media archive is ready.</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Wordmark */}
          <Text style={wordmark}>TRUNQ</Text>

          <Hr style={rule} />

          {/* Body */}
          <Section style={section}>
            <Text style={heading}>Hey {display},</Text>
            <Text style={para}>
              Your account is set up and ready. Trunq is where you upload,
              review, and deliver event photos — all in one place.
            </Text>
            <Text style={para}>A few things to get started:</Text>
            <Text style={listItem}>→ Create your first project from the Projects page</Text>
            <Text style={listItem}>→ Upload photos and assign them to photographers</Text>
            <Text style={listItem}>→ Approve selects in the Review queue</Text>
            <Text style={listItem}>→ Generate a delivery link to share with your client</Text>
          </Section>

          <Hr style={rule} />

          <Text style={footer}>
            You're receiving this because an account was created with this
            address.{' '}
            <Link href="mailto:hello@trunq.so" style={footerLink}>
              Contact us
            </Link>{' '}
            if this wasn't you.
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

const listItem: React.CSSProperties = {
  fontSize:   13,
  color:      '#666666',
  lineHeight: 1.8,
  margin:     '0 0 4px',
  paddingLeft: 4,
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
