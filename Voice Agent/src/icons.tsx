export function MicIcon() {
  return (
    <svg className="mic-button__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3.25 3.25 0 0 0 3.25-3.25V6.5a3.25 3.25 0 1 0-6.5 0v5.25A3.25 3.25 0 0 0 12 15Z"
        fill="currentColor"
      />
      <path
        d="M18.75 11.25a.75.75 0 0 0-1.5 0 5.25 5.25 0 1 1-10.5 0 .75.75 0 0 0-1.5 0 6.75 6.75 0 0 0 6 6.71V20.5h-2a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-2v-2.54a6.75 6.75 0 0 0 6-6.71Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function WaveIcon() {
  return (
    <svg className="conversation__empty-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10v4M7 7v10M11 4v16M15 7v10M19 10v4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function UserMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M12 12a3.75 3.75 0 1 0-3.75-3.75A3.75 3.75 0 0 0 12 12Zm0 1.5c-3.3 0-6 2.1-6 4.7 0 .44.36.8.8.8h10.4a.8.8 0 0 0 .8-.8c0-2.6-2.7-4.7-6-4.7Z" />
    </svg>
  )
}

export function AgentMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  )
}
