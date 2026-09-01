import { RealtimeAgent, RealtimeSession, type RealtimeItem } from '@openai/agents/realtime'

export const REALTIME_MODEL = 'gpt-realtime-2.1'

export const VOICES = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
] as const

export type VoiceId = (typeof VOICES)[number]

export const DEFAULT_VOICE: VoiceId = 'marin'

export type ChatMessage = {
  id: string
  role: 'user' | 'agent'
  text: string
  timestamp: Date
}

export type LiveCaption = {
  role: 'user' | 'agent'
  text: string
}

export function createVoiceSession(voice: VoiceId = DEFAULT_VOICE) {
  const agent = new RealtimeAgent({
    name: 'Voice Agent',
    instructions:
      'You are a helpful voice assistant. Keep replies short and conversational. Speak naturally.',
  })

  return new RealtimeSession(agent, {
    model: REALTIME_MODEL,
    config: {
      outputModalities: ['audio'],
      audio: {
        output: { voice },
        input: {
          noiseReduction: { type: 'far_field' },
          transcription: {
            model: 'gpt-live-transcribe',
            delay: 'low',
            languages: ['en'],
          },
          turnDetection: {
            type: 'server_vad',
            threshold: 0.8,
            prefixPaddingMs: 300,
            silenceDurationMs: 700,
            createResponse: true,
            interruptResponse: false,
          },
        },
      },
    },
  })
}

export async function fetchEphemeralKey() {
  const response = await fetch('/api/realtime-session', { method: 'POST' })
  const data = (await response.json()) as { value?: string; error?: string; message?: string }

  if (!response.ok || !data.value) {
    throw new Error(data.error ?? data.message ?? 'Could not create a realtime session')
  }

  return data.value
}

export function historyToMessages(history: RealtimeItem[]): ChatMessage[] {
  const messages: ChatMessage[] = []

  for (const item of history) {
    if (item.type !== 'message') continue
    if (item.role !== 'user' && item.role !== 'assistant') continue

    const text = item.content
      .map((part) => {
        if ('text' in part && part.text) return part.text
        if ('transcript' in part && part.transcript) return part.transcript
        return ''
      })
      .join(' ')
      .trim()

    if (!text) continue
    if ('status' in item && item.status !== 'completed') continue

    messages.push({
      id: item.itemId,
      role: item.role === 'assistant' ? 'agent' : 'user',
      text,
      timestamp: new Date(),
    })
  }

  return messages
}
