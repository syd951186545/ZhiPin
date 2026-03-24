export interface SseEvent {
  event: string
  data: unknown
}

export const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2ZpGQAAAAASUVORK5CYII='

export const transparentPngDataUrl = `data:image/png;base64,${TRANSPARENT_PNG_BASE64}`

function formatSseData(data: unknown): string {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data)
  return serialized
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')
}

export function toEventStream(events: SseEvent[]): string {
  return `${events
    .map(({ event, data }) => `event: ${event}\n${formatSseData(data)}`)
    .join('\n\n')}\n\n`
}
