/**
 * Test utilities for rendering React components with providers
 */
import React, { ReactElement } from 'react'
import { render, RenderOptions, RenderResult } from '@testing-library/react'

/**
 * Custom render function that wraps components with all necessary providers.
 * Use this instead of RTL's render() for components that need context.
 *
 * @example
 * ```tsx
 * import { renderWithProviders } from 'test/utils/test-utils'
 *
 * test('renders component', () => {
 *   const { getByText } = renderWithProviders(<MyComponent />)
 *   expect(getByText('Hello')).toBeInTheDocument()
 * })
 * ```
 */

interface ProviderOptions {
  // Add provider-specific options here as we add more providers
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  providerOptions?: ProviderOptions
}

/**
 * AllProviders wrapper for tests
 * Add new providers here as they are created during refactoring
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  )
}

function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
): RenderResult {
  const { providerOptions: _providerOptions, ...renderOptions } = options ?? {}

  return render(ui, {
    wrapper: AllProviders,
    ...renderOptions,
  })
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react'
export { renderWithProviders }

// Export a default render that uses providers
export { renderWithProviders as render }
