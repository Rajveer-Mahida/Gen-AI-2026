import { useEffect, useRef, useState } from 'react'
import { RealtimeSession } from '@openai/agents/realtime'
import {
  createVoiceSession,
  fetchEphemeralKey,
  historyToMessages,
  DEFAULT_VOICE,
  VOICES,
  type ChatMessage,
  type LiveCaption,
  type VoiceId,
} from './voiceAgent'
import { AgentMark, MicIcon, UserMark, WaveIcon } from './icons'
import './App.css'

export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Ready',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const VOICE_STORAGE_KEY = 'voice-agent:voice'

function loadStoredVoice(): VoiceId {
  try {
    const stored = localStorage.getItem(VOICE_STORAGE_KEY)
    if (stored && (VOICES as readonly string[]).includes(stored)) return stored as VoiceId
  } catch {
    // storage unavailable
  }
  return DEFAULT_VOICE
}

const CAPTION_MAX_CHARS = 90
const CAPTION_CHARS_PER_SECOND = 12
const CAPTION_MIN_MS = 1600

function takeCaptionChunk(buffer: string, flush: boolean): { chunk: string; rest: string } | null {
  const text = buffer.replace(/^\s+/, '')
  if (!text) return null

  const sentenceEnd = text.match(/[.!?…]["')\]]?(?=\s)/)
  if (sentenceEnd?.index !== undefined) {
    const end = sentenceEnd.index + sentenceEnd[0].length
    if (end <= CAPTION_MAX_CHARS) {
      return { chunk: text.slice(0, end), rest: text.slice(end) }
    }
  }

  if (text.length > CAPTION_MAX_CHARS) {
    const cut = text.lastIndexOf(' ', CAPTION_MAX_CHARS)
    const end = cut > 20 ? cut : CAPTION_MAX_CHARS
    return { chunk: text.slice(0, end), rest: text.slice(end) }
  }

  if (flush) return { chunk: text, rest: '' }
  return null
}

function StatusPill({ status }: { status: AgentStatus }) {
  return (
    <div className={`status-pill status-pill--${status}`} role="status" aria-live="polite">
      <span className="status-pill__dot" />
      {STATUS_LABELS[status]}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`message message--${message.role}`}>
      <div className="message__avatar" aria-hidden="true">
        {message.role === 'user' ? <UserMark /> : <AgentMark />}
      </div>
      <div className="message__stack">
        <div className="message__bubble">{message.text}</div>
        <time className="message__time" dateTime={message.timestamp.toISOString()}>
          {formatTime(message.timestamp)}
        </time>
      </div>
    </article>
  )
}

function Waveform({ status }: { status: AgentStatus }) {
  const isActive = status === 'listening' || status === 'speaking'
  return (
    <div
      className={`waveform ${isActive ? 'waveform--active' : ''} waveform--${status}`}
      aria-hidden="true"
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={i} className="waveform__bar" />
      ))}
    </div>
  )
}

function App() {
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<RealtimeSession | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [caption, setCaption] = useState<LiveCaption | null>(null)
  const [voice, setVoice] = useState<VoiceId>(loadStoredVoice)
  const isConnected = status !== 'idle'

  const handleVoiceChange = (next: VoiceId) => {
    setVoice(next)
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, next)
    } catch {
      // storage unavailable
    }
  }

  const captionQueueRef = useRef<string[]>([])
  const captionTimerRef = useRef<number | null>(null)
  const agentBufferRef = useRef('')
  const audioDoneRef = useRef(true)
  const unmuteTimerRef = useRef<number | null>(null)

  const cancelPendingUnmute = () => {
    if (unmuteTimerRef.current !== null) {
      window.clearTimeout(unmuteTimerRef.current)
      unmuteTimerRef.current = null
    }
  }

  const stopCaptionPump = () => {
    if (captionTimerRef.current !== null) {
      window.clearTimeout(captionTimerRef.current)
      captionTimerRef.current = null
    }
    captionQueueRef.current = []
    agentBufferRef.current = ''
  }

  const pumpCaptions = () => {
    if (captionTimerRef.current !== null) return
    // queue drained: keep the last chunk on screen until the next
    // speaker or turn replaces it — never blank mid-speech
    const chunk = captionQueueRef.current.shift()
    if (!chunk) return
    setCaption({ role: 'agent', text: chunk })
    const holdMs = Math.max(CAPTION_MIN_MS, (chunk.length / CAPTION_CHARS_PER_SECOND) * 1000)
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null
      pumpCaptions()
    }, holdMs)
  }

  const queueAgentCaption = (flush: boolean) => {
    let next = takeCaptionChunk(agentBufferRef.current, flush)
    while (next) {
      captionQueueRef.current.push(next.chunk)
      agentBufferRef.current = next.rest
      next = takeCaptionChunk(agentBufferRef.current, flush)
    }
    pumpCaptions()
  }

  const closeSession = () => {
    sessionRef.current?.close()
    sessionRef.current = null
    stopCaptionPump()
    cancelPendingUnmute()
    setCaption(null)
    setStatus('idle')
  }

  const handleMicClick = async () => {
    if (sessionRef.current) {
      closeSession()
      return
    }

    setError(null)
    setStatus('thinking')

    try {
      const apiKey = await fetchEphemeralKey()
      const session = createVoiceSession(voice)

      session.on('history_updated', (history) => {
        const next = historyToMessages(history)
        setMessages(next)
      })

      session.on('transport_event', (event) => {
        const type = 'type' in event ? String(event.type) : ''

        if (type === 'input_audio_buffer.speech_started') {
          stopCaptionPump()
          setStatus('listening')
          setCaption({ role: 'user', text: '' })
        }

        if (type === 'conversation.item.input_audio_transcription.delta') {
          const delta = 'delta' in event && typeof event.delta === 'string' ? event.delta : ''
          if (!delta) return
          setCaption((current) => ({
            role: 'user',
            text: `${current?.role === 'user' ? current.text : ''}${delta}`,
          }))
        }

        if (type === 'conversation.item.input_audio_transcription.completed') {
          const transcript =
            'transcript' in event && typeof event.transcript === 'string' ? event.transcript : ''
          if (transcript) {
            console.log('User transcript:', transcript)
            setCaption({ role: 'user', text: transcript })
          }
        }

        if (type === 'response.output_audio_transcript.delta') {
          const delta = 'delta' in event && typeof event.delta === 'string' ? event.delta : ''
          if (!delta) return
          agentBufferRef.current += delta
          queueAgentCaption(false)
        }

        if (type === 'response.output_audio_transcript.done') {
          const transcript =
            'transcript' in event && typeof event.transcript === 'string' ? event.transcript : ''
          if (transcript) console.log('Agent transcript:', transcript)
          queueAgentCaption(true)
        }
      })

      session.on('agent_start', () => {
        stopCaptionPump()
        cancelPendingUnmute()
        setStatus('thinking')
        setCaption({ role: 'agent', text: '' })
        // mute for the whole agent turn (thinking + speaking), so speech
        // can't commit a new turn while a response is still in progress
        try {
          session.mute(true)
        } catch {
          // WebRTC mute is best-effort
        }
      })
      session.on('audio_start', () => {
        audioDoneRef.current = false
        cancelPendingUnmute()
        setStatus('speaking')
        try {
          session.mute(true)
        } catch {
          // WebRTC mute is best-effort
        }
      })
      session.on('audio_stopped', () => {
        audioDoneRef.current = true
        setStatus('listening')
        pumpCaptions()
        // hold the mute briefly so speaker tail / room echo of the
        // agent's own voice can't register as a new user turn
        cancelPendingUnmute()
        unmuteTimerRef.current = window.setTimeout(() => {
          unmuteTimerRef.current = null
          try {
            sessionRef.current?.mute(false)
          } catch {
            // ignore
          }
        }, 600)
      })
      session.on('agent_end', () => {
        if (audioDoneRef.current) {
          setStatus('listening')
          pumpCaptions()
          // no audio played for this turn — make sure the mic comes back
          if (unmuteTimerRef.current === null) {
            unmuteTimerRef.current = window.setTimeout(() => {
              unmuteTimerRef.current = null
              try {
                sessionRef.current?.mute(false)
              } catch {
                // ignore
              }
            }, 600)
          }
        }
      })
      session.on('error', (event) => {
        console.error(event)
        // benign: a turn got committed while a response was still active
        if (JSON.stringify(event).includes('conversation_already_has_active_response')) return
        setError('Voice session error. Check the console and try again.')
      })

      await session.connect({ apiKey })
      sessionRef.current = session
      setStatus('listening')
    } catch (err) {
      closeSession()
      const message = err instanceof Error ? err.message : 'Could not connect to the voice agent'
      setError(message)
    }
  }

  useEffect(() => {
    return () => {
      sessionRef.current?.close()
    }
  }, [])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isConnected])

  return (
    <div className="app">
      <div className="panel">
        <header className="header">
          
          <div className="header__brand">
            <span className="header__mark" aria-hidden="true" />
            <div className="header__copy">
              <h1 className="header__title">Voice Agent</h1>
              <p className="header__subtitle">Speak naturally, get instant replies</p>
            </div>
          </div>
          <div className="header__actions">
            <label className="voice-select">
              <select
                className="voice-select__input"
                value={voice}
                onChange={(e) => handleVoiceChange(e.target.value as VoiceId)}
                disabled={isConnected}
                aria-label="Agent voice"
                title={isConnected ? 'Hang up to change the voice' : 'Agent voice'}
              >
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <StatusPill status={status} />
          </div>
        </header>

        <main className="conversation" aria-label="Conversation">
          {isConnected ? (
            <div
              className={`live-caption ${caption ? `live-caption--${caption.role}` : ''}`}
              aria-live="polite"
            >
              <span className="live-caption__label">
                {caption?.role === 'agent' || status === 'speaking' || status === 'thinking'
                  ? 'Agent'
                  : 'You'}
              </span>
              <p className="live-caption__text">
                {caption?.text ||
                  (status === 'speaking'
                    ? 'Speaking…'
                    : status === 'thinking'
                      ? 'Thinking…'
                      : 'Listening…')}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="conversation__empty">
              <WaveIcon />
              <p className="conversation__empty-title">Start a conversation</p>
              <p className="conversation__empty-hint">
                Tap the microphone to connect. Speak, and the agent will answer out loud.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={conversationEndRef} />
            </>
          )}
        </main>

        <footer className="controls">
          <Waveform status={status} />

          <button
            type="button"
            className={`mic-button ${isConnected ? 'mic-button--listening' : ''}`}
            onClick={handleMicClick}
            aria-label={isConnected ? 'End call' : 'Start voice agent'}
            aria-pressed={isConnected}
          >
            {isConnected && (
              <>
                <span className="mic-button__ring" />
                <span className="mic-button__ring" />
              </>
            )}
            <MicIcon />
          </button>

          <p className={`controls__hint ${error ? 'controls__hint--error' : ''}`}>
            {error ?? (isConnected ? 'Tap to hang up' : 'Tap to speak')}
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
