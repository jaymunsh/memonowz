import './Tabs.css'

export type TabOption<T extends string> = { value: T; label: string }

export const Tabs = <T extends string>({ options, value, onChange, label }: {
  options: TabOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) => (
  <div className="tabs" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={o.value === value}
        className={`tabs__tab${o.value === value ? ' is-on' : ''}`}
        onClick={() => onChange(o.value)}
        onKeyDown={(event) => {
          const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
          if (!direction && event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
            : (options.findIndex((item) => item.value === o.value) + direction + options.length) % options.length
          onChange(options[index].value)
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus()
        }}
      >
        {o.label}
      </button>
    ))}
  </div>
)
