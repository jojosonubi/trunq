import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'surface-0':   'var(--surface-0)',
        'surface-1':   'var(--surface-1)',
        'surface-2':   'var(--surface-2)',
        'surface-3':   'var(--surface-3)',
        'accent':      'var(--accent)',
        'accent-mid':  'var(--accent-mid)',
        'accent-bg':   'var(--accent-bg)',
        'label-bg':    'var(--label-bg)',
        'label-text':  'var(--label-text)',
        't-primary':   'var(--text-primary)',
        't-muted':     'var(--text-muted)',
        't-dim':       'var(--text-dim)',
      },
    },
  },
  plugins: [],
}

export default config
