import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree'
import { QueryClient } from '@tanstack/react-query'
import React from 'react'
import SmallLoadingSpinner from './components/ui/SmallLoadingSpinner'

// Default pending component that shows just a loading spinner
// Note: MainLayout is not included here to avoid duplicate headers during initial load
const DefaultPendingComponent: React.FC = () => {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--app-bg-color)',
        color: 'var(--text-color)',
      }
    },
    React.createElement(SmallLoadingSpinner)
  )
}

// Create the router instance
export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    context: {
      queryClient,
    },
    defaultPendingComponent: DefaultPendingComponent,
    defaultPendingMs: 100, // Show pending component after 100ms
    // Enable router-managed scroll restoration to coordinate with iOS back-swipe
    scrollRestoration: true,
    getScrollRestorationKey: (location) => `${location.pathname}${location.search ?? ''}`,
  })
}

// Create a type for the router
export type AppRouter = ReturnType<typeof createAppRouter>
