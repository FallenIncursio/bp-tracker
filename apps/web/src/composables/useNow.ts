import { onMounted, onUnmounted, ref } from 'vue'

const now = ref(Date.now())
let intervalId: ReturnType<typeof window.setInterval> | null = null
let consumers = 0

const startTicker = () => {
  if (intervalId || typeof window === 'undefined') return
  intervalId = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

const stopTicker = () => {
  if (!intervalId) return
  window.clearInterval(intervalId)
  intervalId = null
}

export const useNow = () => {
  onMounted(() => {
    consumers += 1
    now.value = Date.now()
    startTicker()
  })

  onUnmounted(() => {
    consumers = Math.max(consumers - 1, 0)
    if (consumers === 0) stopTicker()
  })

  return now
}
