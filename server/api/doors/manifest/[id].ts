import { getRequestURL, setResponseHeader } from 'h3'
import { getDoorIdParam, getDoorOrThrow } from '../../../utils/doors'

export default defineEventHandler(async (event) => {
  const doorId = getDoorIdParam(event)
  const { origin } = getRequestURL(event)

  setResponseHeader(event, 'Content-Type', 'application/manifest+json; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-cache, no-store, must-revalidate')

  if (doorId === 0) {
    const manifest = {
      id: '/',
      name: 'DoorPhone Dashboard',
      short_name: 'Dashboard',
      lang: 'ja-JP',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      orientation: 'landscape-primary',
      icons: [],
      related_applications: [],
      prefer_related_applications: false,
      categories: ['productivity'],
      start_url_full: origin
    }

    return manifest
  }

  const door = await getDoorOrThrow(doorId)
  const doorName = typeof door === 'string' ? door : door.name
  const startPath = `/doorphone/${doorId}`

  const manifest = {
    id: startPath,
    name: `${doorName} | DoorPhone`,
    short_name: doorName,
    lang: 'ja-JP',
    display: 'fullscreen',
    start_url: startPath,
    scope: `/doorphone/${doorId}`,
    theme_color: '#15803d',
    background_color: '#0f172a',
    orientation: 'landscape-primary',
    icons: [],
    related_applications: [],
    prefer_related_applications: false,
    categories: ['productivity'],
    start_url_full: `${origin}${startPath}`
  }

  return manifest
})
