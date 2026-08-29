import './ProgressBar.css'

export const ProgressBar = ({ value, max }: { value: number; max: number }) => {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="pbar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}
