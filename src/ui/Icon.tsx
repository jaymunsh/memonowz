export const Icon = ({ name, size = 20, filled = false }: {
  name: 'star' | 'plus' | 'clock' | 'cards' | 'more' | 'back' | 'settings'
  size?: number
  filled?: boolean
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'star' && <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />}
    {name === 'plus' && <path d="M12 5v14M5 12h14" />}
    {name === 'clock' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === 'cards' && <><rect x="7" y="5" width="14" height="16" rx="2" /><path d="M16 3H5a2 2 0 0 0-2 2v11M11 10h6M11 14h4" /></>}
    {name === 'more' && <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}
    {name === 'back' && <path d="m14 6-6 6 6 6" />}
    {name === 'settings' && <><circle cx="12" cy="12" r="3" /><path d="m9 3-.5 2.4-2 1.2-2.3-.7-2 3.5 1.8 1.7v2.3l-1.8 1.7 2 3.5 2.3-.7 2 1.2L9 21h4l.5-2.4 2-1.2 2.3.7 2-3.5-1.8-1.7v-2.3l1.8-1.7-2-3.5-2.3.7-2-1.2L13 3Z" /></>}
  </svg>
)
