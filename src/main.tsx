import { ProductNavigation } from './components/ProductNavigation'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App, LegalPage, DpsRoute } from './browser/routeLoading'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { LoadingState } from './components/ui/loading'
import { legalPageFromPath } from './data/legal'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found')
}

const legalPage = legalPageFromPath(window.location.pathname)
const lab = window.location.pathname.startsWith('/lab')
const root = createRoot(rootElement)
root.render(
  <StrictMode>
    <RouteErrorBoundary>
      {lab ? <ProductNavigation /> : null}
      <Suspense fallback={<LoadingState presentation="page" layout="board" label="Loading page" />}>
        {legalPage ? <LegalPage page={legalPage} /> : lab ? <DpsRoute /> : <App />}
      </Suspense>
    </RouteErrorBoundary>
  </StrictMode>,
)
