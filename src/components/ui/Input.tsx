'use client'

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

/** Token-driven form field — replaces the 27 hand-rolled input stylings. */
const FIELD =
  'w-full rounded-lg px-3 py-2 text-base focus:outline-none transition-colors ' +
  'bg-[var(--surface-1)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ' +
  'border border-[var(--surface-3)] focus:border-[var(--accent-border)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx(FIELD, className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(FIELD, 'resize-none', className)} {...rest} />
  },
)

export default Input
