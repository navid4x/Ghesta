// Performance monitoring utilities

export function measurePerformance(metricName: string, callback: () => void): void {
  if (typeof window === 'undefined' || !window.performance) return

  const startTime = performance.now()
  callback()
  const endTime = performance.now()
  const duration = endTime - startTime

  console.log(`[Performance] ${metricName}: ${duration.toFixed(2)}ms`)

  // Report to analytics if available
  if (window.gtag) {
    window.gtag('event', 'timing_complete', {
      name: metricName,
      value: Math.round(duration),
      event_category: 'Performance'
    })
  }
}

export async function measureAsyncPerformance<T>(
  metricName: string,
  callback: () => Promise<T>
): Promise<T> {
  if (typeof window === 'undefined' || !window.performance) {
    return callback()
  }

  const startTime = performance.now()
  const result = await callback()
  const endTime = performance.now()
  const duration = endTime - startTime

  console.log(`[Performance] ${metricName}: ${duration.toFixed(2)}ms`)

  // Report to analytics if available
  if (window.gtag) {
    window.gtag('event', 'timing_complete', {
      name: metricName,
      value: Math.round(duration),
      event_category: 'Performance'
    })
  }

  return result
}

// Web Vitals monitoring
export function reportWebVitals(metric: any): void {
  console.log(`[Web Vitals] ${metric.name}:`, metric.value)

  // Report to analytics
  if (window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    })
  }
}

// Memory monitoring
export function monitorMemory(): void {
  if (typeof window === 'undefined' || !('memory' in performance)) return

  const memory = (performance as any).memory
  if (memory) {
    console.log('[Memory]', {
      usedJSHeapSize: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
      totalJSHeapSize: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
      jsHeapSizeLimit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
    })
  }
}

// Long task detection
export function detectLongTasks(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.warn('[Long Task]', {
          duration: `${entry.duration.toFixed(2)}ms`,
          startTime: entry.startTime,
        })
      }
    })

    observer.observe({ entryTypes: ['longtask'] })
  } catch (e) {
    // PerformanceObserver not supported
  }
}

// Initialize performance monitoring
export function initPerformanceMonitoring(): void {
  if (typeof window === 'undefined') return

  // Monitor memory every 30 seconds in development
  if (process.env.NODE_ENV === 'development') {
    setInterval(monitorMemory, 30000)
  }

  // Detect long tasks
  detectLongTasks()

  // Log initial performance metrics
  if (window.performance && window.performance.timing) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const timing = window.performance.timing
        const loadTime = timing.loadEventEnd - timing.navigationStart
        const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart
        const renderTime = timing.domComplete - timing.domLoading

        console.log('[Performance Metrics]', {
          loadTime: `${loadTime}ms`,
          domReadyTime: `${domReadyTime}ms`,
          renderTime: `${renderTime}ms`,
        })
      }, 0)
    })
  }
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}
