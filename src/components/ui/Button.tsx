'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

/**
 * THE app button. Token-driven so it survives both themes, and finally puts
 * the brand accent on primary actions (the audit found every primary in the
 * app was bg-white/text-black — the accent was unused on interactive UI).
 *
 *   primary — accent background, for THE action on a surface
 *   ghost   — bordered secondary action (the app's dominant button)
 *   danger  — destructive
 *   subtle  — borderless text button
 */
export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  /** Fully-rounded pill shape (floating bars); default is the app 4px radius */
  pill?: boolean
  children: ReactNode
}

const SIZE = {
  sm: 'text-sm px-3 py-1.5 gap-1.5',
  md: 'text-base px-4 py-2 gap-2',
}

const VARIANT: Record<ButtonVariant, { className: string; style?: React.CSSProperties }> = {
  primary: {
    className: 'font-semibold transition-[filter] hover:brightness-95 disabled:hover:brightness-100',
    style: { background: 'var(--accent)', color: 'var(--accent-fg)' },
  },
  ghost: {
    className: 'border transition-colors hover:!text-[var(--text-primary)]',
    style: { borderColor: 'var(--surface-3)', color: 'var(--text-secondary)', background: 'transparent' },
  },
  danger: {
    className: 'border font-medium transition-opacity hover:opacity-85',
    style: { background: 'var(--flagged-bg)', color: 'var(--flagged-fg)', borderColor: 'var(--flagged-border)' },
  },
  subtle: {
    className: 'transition-colors hover:!text-[var(--text-primary)]',
    style: { color: 'var(--text-secondary)', background: 'transparent' },
  },
}

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'ghost', size = 'md', pill = false, className, style, children, ...rest },
  ref,
) {
  const v = VARIANT[variant]
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
        pill ? 'rounded-full' : 'rounded-lg',
        SIZE[size],
        v.className,
        className,
      )}
      style={{ ...v.style, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
})

export default Button
