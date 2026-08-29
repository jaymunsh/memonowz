import type { ReactNode } from 'react'
import './Badge.css'

export const Badge = ({ tone = 'neutral', children }: {
  tone?: 'neutral' | 'accent' | 'ok' | 'bad'
  children: ReactNode
}) => <span className={`badge badge--${tone}`}>{children}</span>
