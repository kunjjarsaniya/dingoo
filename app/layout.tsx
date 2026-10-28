import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://dingoo.vercel.app'),
  title: {
    default: 'Dingoo — Real-Time Multiplayer Bingo Game',
    template: '%s | Dingoo',
  },
  description:
    'Dingoo is a fast, tactile, real-time multiplayer Bingo game with cut-paper styling, satisfying 3D press controls, 40s turn timers, and instant room sync. Play live with friends!',
  applicationName: 'Dingoo',
  authors: [{ name: 'Dingoo Team', url: 'https://dingoo.vercel.app' }],
  generator: 'Next.js',
  keywords: [
    'Dingoo',
    'Bingo',
    'Multiplayer Bingo',
    'Real-time Bingo',
    'Online Bingo with Friends',
    'Hallmark Hum Theme',
    'Play Bingo Online Free',
    'Dingoo Vercel',
  ],
  creator: 'Dingoo',
  publisher: 'Dingoo',
  alternates: {
    canonical: 'https://dingoo.vercel.app',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://dingoo.vercel.app',
    siteName: 'Dingoo',
    title: 'Dingoo — Real-Time Multiplayer Bingo Game',
    description:
      'Playful real-time multiplayer Bingo with physical cut-paper cards, 40s turn limits, and instant authoritative sync.',
    images: [
      {
        url: 'https://dingoo.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Dingoo — Real-Time Multiplayer Bingo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dingoo — Real-Time Multiplayer Bingo Game',
    description:
      'Playful real-time multiplayer Bingo with physical cut-paper cards, 40s turn limits, and instant authoritative sync.',
    images: ['https://dingoo.vercel.app/og-image.png'],
    creator: '@dingoogame',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#faf8f5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light">
      <head>
        <link
          rel="preconnect"
          href="https://api.fontshare.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=chillax@500,600,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Outfit:wght@500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen text-[oklch(20%_0.014_255)] font-sans selection:bg-[oklch(87%_0.175_96)] selection:text-[oklch(20%_0.014_255)]">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
