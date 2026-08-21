import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

type Props = {
  busy?: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}

export function CreateBookModal({ busy = false, onClose, onCreate }: Props) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = busy || saving

  useEffect(() => {
    inputRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabled) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [disabled, onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim() || 'Cash Book'
    setSaving(true)
    setError(null)
    try {
      await onCreate(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this sheet')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !disabled && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>New cash book</h2>
        <p className="modal-copy">Creates a sheet in the SmartCB folder of your Google Drive.</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="book-name">Sheet name</label>
          <input
            ref={inputRef}
            id="book-name"
            name="book-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cash Book"
            disabled={disabled}
          />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={disabled}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={disabled}>
              {disabled ? 'Creating…' : 'Create sheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
