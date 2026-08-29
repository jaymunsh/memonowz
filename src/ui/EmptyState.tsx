import type { ReactNode } from 'react'
import './EmptyState.css'

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <p className="empty">{children}</p>
)
