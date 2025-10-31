import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import React, { lazy } from 'react'
import SmallLoadingSpinner from './components/ui/SmallLoadingSpinner'
import { ErrorBoundary } from './components/ErrorBoundary'
import MainLayout from './components/MainLayout'
import GlobalModalManager from './components/GlobalModalManager'


// Small loading spinner for route transitions
const RouteLoadingSpinner: React.FC = () => 
  React.createElement(SmallLoadingSpinner);

// Lazy load components
const NostrFeed = lazy(() => import('./components/NostrFeed'))
const NoteView = lazy(() => import('./components/NoteView'))
const CreateView = lazy(() => import('./components/CreateView'))
const ProfileView = lazy(() => import('./components/ProfileView'))
const ProfileNotesRoute = lazy(() => import('./components/profile/ProfileNotesRoute'))
const ProfileFollowingRoute = lazy(() => import('./components/profile/ProfileFollowingRoute'))
const ProfileFollowersRoute = lazy(() => import('./components/profile/ProfileFollowersRoute'))
const ProfileMuteListRoute = lazy(() => import('./components/profile/ProfileMuteListRoute'))
const ProfileRelaysRoute = lazy(() => import('./components/profile/ProfileRelaysRoute'))
const SearchPage = lazy(() => import('./components/SearchPage'))
const NotificationsPage = lazy(() => import('./components/NotificationsPage'))
const BookmarksPage = lazy(() => import('./components/BookmarksPage'))
const AboutPage = lazy(() => import('./components/AboutPage'))
const ThreadPage = lazy(() => import('./components/ThreadPage'))
const ArticlePage = lazy(() => import('./components/ArticlePage'))

// Root route component - minimal wrapper
function RootComponent() {
  // Mobile detection for GlobalModalManager
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 640);
  
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return React.createElement(
    ErrorBoundary,
    null,
    React.createElement(Outlet),
    React.createElement(GlobalModalManager, { isMobile }),
    // TanStack Router devtools disabled to prevent blocking bottom feed controls
    // import.meta.env.DEV ? React.createElement(TanStackRouterDevtools) : null
  )
}

// Main layout component - wraps all child routes with MainLayout
function MainLayoutComponent() {
  return React.createElement(MainLayout, null, React.createElement(Outlet))
}

// Feed wrapper component
function FeedWrapperComponent() {
  return React.createElement(
    NostrFeed,
    null,
    React.createElement(Outlet)
  )
}

// Root route - minimal wrapper
export const rootRoute = createRootRoute({
  component: RootComponent,
})

// Main layout route - wraps all child routes with MainLayout
export const mainLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_mainLayout',
  component: MainLayoutComponent,
})

// Feed wrapper route - handles root path
export const feedWrapperRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/',
  component: FeedWrapperComponent,
  // Note: Loader removed for now - will be added after proper TanStack Query integration
  // The issue is that loaders run before React context is available
})

// Feed route - removed since FeedWrapperComponent renders NostrFeed directly

// Note view route
export const noteRoute = createRoute({
  getParentRoute: () => feedWrapperRoute,
  path: '/note/$noteId',
  component: NoteView,
  validateSearch: (search: Record<string, unknown>) => ({
    reply: typeof search.reply === 'string' ? search.reply : '',
    repost: typeof search.repost === 'string' ? search.repost : '',
    thread: typeof search.thread === 'string' ? search.thread : '',
    zap: typeof search.zap === 'string' ? search.zap : '',
  }),
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

// Article view route
export const articleRoute = createRoute({
  getParentRoute: () => feedWrapperRoute,
  path: '/article/$addr',
  component: ArticlePage,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

// Create view route
export const createViewRoute = createRoute({
  getParentRoute: () => feedWrapperRoute,
  path: '/create',
  component: CreateView,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

// Profile route
export const profileRoute = createRoute({
  getParentRoute: () => feedWrapperRoute,
  path: '/npub/$npub',
  component: ProfileView,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

// Profile sub-routes
export const profileNotesRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/',
  component: ProfileNotesRoute,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
})

export const profileNotesExplicitRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/notes',
  component: ProfileNotesRoute,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
})

export const profileFollowingRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/following',
  component: ProfileFollowingRoute,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
})

export const profileFollowersRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/followers',
  component: ProfileFollowersRoute,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
})

export const profileMuteListRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/mute-list',
  component: ProfileMuteListRoute,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
})

export const profileRelaysRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: '/relays',
  component: ProfileRelaysRoute,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
})

// Other routes (not nested under feed)
export const searchRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/search',
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    type: typeof search.type === 'string' ? search.type : 'notes',
  }),
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

export const notificationsRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/notifications',
  component: NotificationsPage,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

export const aboutRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/about',
  component: AboutPage,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

export const threadRoute = createRoute({
  getParentRoute: () => feedWrapperRoute,
  path: '/thread/$noteId',
  component: ThreadPage,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})

export const bookmarksRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/bookmarks',
  component: BookmarksPage,
  pendingComponent: () => React.createElement(RouteLoadingSpinner),
  pendingMs: 100,
})


// Build the route tree
export const routeTree = rootRoute.addChildren([
  mainLayoutRoute.addChildren([
    feedWrapperRoute.addChildren([
      noteRoute,
      createViewRoute,
      threadRoute,
      articleRoute,
      profileRoute.addChildren([
        profileNotesRoute,
        profileNotesExplicitRoute,
        profileFollowingRoute,
        profileFollowersRoute,
        profileMuteListRoute,
        profileRelaysRoute,
      ]),
    ]),
    searchRoute,
    notificationsRoute,
    aboutRoute,
    bookmarksRoute,
  ]),
])