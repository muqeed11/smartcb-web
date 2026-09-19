import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

type Kind = 'in' | 'out'

export type EntryDraft = { description: string; amount: number; kind: Kind }

type Props = {
  kind: Kind
  mode?: 'add' | 'edit'
  initial?: { description: string; amount: number }
  onClose: () => void
  onSave: (entry: EntryDraft) => Promise<void>
}

export function AddEntryModal({ kind, mode = 'add', initial, onClose, onSave }: Props) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCash = kind === 'in'
  const isEdit = mode === 'edit'

  useEffect(() => {
    inputRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
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
        <h2 id={titleId}>
          {isEdit ? (isCash ? 'Edit cash' : 'Edit expense') : isCash ? 'Add cash' : 'Add expense'}
        </h2>
        <p className="modal-copy">
          {isEdit
            ? 'Updates the latest entry in this sheet. The original date is kept.'
            : 'Saved to this sheet in your SmartCB Drive folder.'}
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="amount">Amount</label>
          <input
            ref={inputRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
          />
          <label htmlFor="description">Description</label>
          <input
            id="description"
            name="description"
            enterKeyHint="done"
            autoComplete="off"
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
              {busy ? 'Saving…' : isEdit ? 'Save changes' : isCash ? 'Save cash' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
