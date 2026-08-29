import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import './Field.css'

type Common = { label?: string }
type InputProps = Common & { as?: 'input' } & InputHTMLAttributes<HTMLInputElement>
type AreaProps = Common & { as: 'textarea' } & TextareaHTMLAttributes<HTMLTextAreaElement>

export const Field = ({ label, as = 'input', ...rest }: InputProps | AreaProps) => (
  <label className="field">
    {label && <span className="field__label">{label}</span>}
    {as === 'textarea'
      ? <textarea className="field__control" rows={3} {...(rest as AreaProps)} />
      : <input className="field__control" {...(rest as InputProps)} />}
  </label>
)
