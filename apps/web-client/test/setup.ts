/**
 * Global test setup for Vitest
 * This file runs before each test file
 */
import '@testing-library/jest-dom'

// Mock document methods for theme system (called on module load)
// These spies allow the theme system to work during tests while tracking calls
const styleElementsById = new Map<string, HTMLElement>()
const originalGetElementById = document.getElementById.bind(document)
const originalAppendChild = document.head.appendChild.bind(document.head)

vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
  // Check our tracked elements first (for theme style injection)
  return styleElementsById.get(id) || originalGetElementById(id)
})

vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
  const el = node as HTMLElement
  if (el.id) {
    styleElementsById.set(el.id, el)
  }
  return originalAppendChild(node)
})

vi.spyOn(document.documentElement, 'setAttribute')

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = ResizeObserverMock

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver

// Suppress console output during tests (optional, can be controlled via env)
if (process.env.SUPPRESS_CONSOLE !== 'false') {
  // Keep console.error for debugging test failures
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReset()
  localStorageMock.setItem.mockReset()
  localStorageMock.removeItem.mockReset()
  localStorageMock.clear.mockReset()
})
