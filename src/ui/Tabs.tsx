import './Tabs.css'

export type TabOption<T extends string> = { value: T; label: string }

export const Tabs = <T extends string>({ options, value, onChange, label }: {
  options: TabOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) => (
  <div className="tabs" role="tablist" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={o.value === value}
        className={`tabs__tab${o.value === value ? ' is-on' : ''}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
)
