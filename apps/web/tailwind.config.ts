import type { Config } from 'tailwindcss';

// Pixel 复古主题 token（docs/ui-reference.md §1）
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: 'var(--panel)',
        panelLight: 'var(--panel-light)',
        ink: 'var(--ink)',
        inkSoft: 'var(--ink-soft)',
        accent: 'var(--accent)',
        ok: 'var(--ok)',
        brandBg: 'var(--brand-bg)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      boxShadow: {
        pixel: 'var(--shadow)',
      },
      borderRadius: {
        px2: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config;
