type Props = {
  label?: string
  overlay?: boolean
}

export function DriveLoader({ label = 'Loading from Drive', overlay = false }: Props) {
  const content = (
    <div className="drive-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="drive-loader-orb" aria-hidden="true">
        <span className="drive-loader-glow" />
        <span className="drive-loader-ring" />
        <span className="drive-loader-arc" />
        <span className="drive-loader-mark">CB</span>
      </div>
      <p className="drive-loader-label">{label}</p>
      <span className="drive-loader-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  )

  if (!overlay) return content

  return <div className="drive-loader-overlay">{content}</div>
}
