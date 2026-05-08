import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireApiUser } from '@/lib/api-auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

type Platform = 'instagram' | 'story' | 'linkedin'

const PLATFORM_PROMPT: Record<Platform, string> = {
  instagram:
    'Write an engaging Instagram caption: 2–3 evocative sentences, then a new line with 6–8 relevant hashtags. Conversational and vivid.',
  story:
    'Write a Story caption: maximum 6 words, bold and punchy. No hashtags. High impact.',
  linkedin:
    'Write a professional LinkedIn caption: 2–3 sentences, no hashtags. Focus on atmosphere, energy, and the experience — suitable for a brand or event company.',
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const { public_url, tags, description, platform } = (await request.json()) as {
      public_url: string
      tags: string[]
      description: string | null
      platform: Platform
    }

    if (!public_url || !platform) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const contextLines: string[] = []
    if (description) contextLines.push(`Photo description: ${description}`)
    if (tags.length) contextLines.push(`Tags: ${tags.join(', ')}`)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: public_url } },
            {
              type: 'text',
              text: `You are writing social media copy for an events photography archive.\n${contextLines.join('\n')}\n\n${PLATFORM_PROMPT[platform]}\n\nReturn only the caption text — no preamble, no explanation.`,
            },
          ],
        },
      ],
    })

    const caption =
      response.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
    return NextResponse.json({ caption })
  } catch (err) {
    console.error('[caption] error:', err)
    return NextResponse.json({ error: 'Caption generation failed' }, { status: 500 })
  }
}
