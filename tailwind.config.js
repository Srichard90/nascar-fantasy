/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        racing: {
          black:  '#0C0C0C',
          dark:   '#141414',
          card:   '#1C1C1C',
          border: '#2A2A2A',
          yellow: '#F5C218',
          red:    '#E8291E',
          muted:  '#6B6B6B',
          light:  '#E8E8E8',
        },
      },
      fontFamily: {
        bebas: ['var(--font-bebas)', 'Impact', 'sans-serif'],
        body:  ['var(--font-dm)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
