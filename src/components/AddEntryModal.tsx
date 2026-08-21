import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

type Kind = 'in' | 'out'

type Props = {
  kind: Kind
  onClose: () => void
  onSave: (entry: { description: string; amount: number; kind: Kind }) => Promise<void>
}

export function AddEntryModal({ kind, onClose, onSave }: Props) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCash = kind === 'in'

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number(amount.replace(/,/g, ''))
    if (!description.trim()) {
      setError('Add a short description.')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({ description: description.trim(), amount: parsed, kind })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{isCash ? 'Add cash' : 'Add expense'}</h2>
        <p className="modal-copy">
          Saved on this device immediately, then pushed to your SmartCB book.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="amount">Amount</label>
          <input
            ref={inputRef}
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
          />
          <label htmlFor="description">Description</label>
          <input
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={isCash ? 'e.g. UserC contri' : 'e.g. kirana'}
          />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={`btn ${isCash ? 'cash' : 'expense'}`} disabled={busy}>
              {busy ? 'Saving…' : isCash ? 'Save cash' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
