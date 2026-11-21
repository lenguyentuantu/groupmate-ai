import type { MetadataRoute } from 'next';

// Makes the app installable: Add to Dock in Safari, Install in Chrome and Edge,
// Add to Home Screen on a phone. The background matches the light theme and the
// installed app chrome uses the primary brand colour.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GroupMate AI',
    short_name: 'GroupMate AI',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f0eee9',
    theme_color: '#955251',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
