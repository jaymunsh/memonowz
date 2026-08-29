import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  block?: boolean
}

export const Button = ({ variant = 'ghost', block, className = '', ...rest }: Props) => (
  <button
    type="button"
    className={`btn btn--${variant}${block ? ' btn--block' : ''} ${className}`}
    {...rest}
  />
)
