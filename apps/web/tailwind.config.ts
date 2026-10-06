import type { Config } from 'tailwindcss';

// Pixel 复古主题 token（docs/ui-reference.md §1）
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 用 rgb(var(--x-rgb) / <alpha-value>) 而非 var(--x)：否则 /30 这类透明度修饰不生成，
        // 元素会退回 Tailwind 默认灰（日程格线"看不清"的根因，见 index.css 顶部说明）
        panel: 'rgb(var(--panel-rgb) / <alpha-value>)',
        panelLight: 'rgb(var(--panel-light-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        inkSoft: 'rgb(var(--ink-soft-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        ok: 'rgb(var(--ok-rgb) / <alpha-value>)',
        brandBg: 'rgb(var(--brand-bg-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
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
