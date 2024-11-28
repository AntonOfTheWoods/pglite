import { PGliteProvider } from '@electric-sql/pglite-react'
import { live, LiveNamespace, LiveQuery } from '@electric-sql/pglite/live'
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import 'animate.css/animate.min.css'
import { createContext, useEffect, useMemo, useState } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  type Params,
} from 'react-router-dom'
import 'react-toastify/dist/ReactToastify.css'

import { Session } from '@supabase/supabase-js'
import Board from './pages/Board'
import Issue from './pages/Issue'
import List from './pages/List'
import Root from './pages/root'
import PGWorker from './pglite-worker.js?worker'
import { supabase } from './supabase'
import { Issue as IssueType, Status, StatusValue } from './types/types'
import {
  FilterState,
  filterStateToSql,
  getFilterStateFromSearchParams,
} from './utils/filterState'

interface MenuContextInterface {
  showMenu: boolean
  setShowMenu: (show: boolean) => void
}

export const MenuContext = createContext(null as MenuContextInterface | null)

type PGliteWorkerWithLive = PGliteWorker & { live: LiveNamespace }

const pgPromise = PGliteWorker.create(new PGWorker(), {
  extensions: {
    live,
  },
})

async function issueListLoader({ request }: { request: Request }) {
  const pg = await pgPromise
  const url = new URL(request.url)
  const filterState = getFilterStateFromSearchParams(url.searchParams)
  const { sql, sqlParams } = filterStateToSql(filterState)
  const liveIssues = await pg.live.query<IssueType>({
    query: sql,
    params: sqlParams,
    signal: request.signal,
    offset: 0,
    limit: 100,
  })
  return { liveIssues, filterState }
}

async function boardIssueListLoader({ request }: { request: Request }) {
  const pg = await pgPromise
  const url = new URL(request.url)
  const filterState = getFilterStateFromSearchParams(url.searchParams)

  const columnsLiveIssues: Partial<Record<StatusValue, LiveQuery<IssueType>>> =
    {}

  for (const status of Object.values(Status)) {
    const colFilterState: FilterState = {
      ...filterState,
      orderBy: 'kanbanorder',
      orderDirection: 'asc',
      status: [status],
    }
    const { sql: colSql, sqlParams: colSqlParams } =
      filterStateToSql(colFilterState)
    const colLiveIssues = await pg.live.query<IssueType>({
      query: colSql,
      params: colSqlParams,
      signal: request.signal,
      offset: 0,
      limit: 10,
    })
    columnsLiveIssues[status] = colLiveIssues
  }

  return {
    columnsLiveIssues: columnsLiveIssues as Record<
      StatusValue,
      LiveQuery<IssueType>
    >,
    filterState,
  }
}

async function issueLoader({
  params,
  request,
}: {
  params: Params
  request: Request
}) {
  const pg = await pgPromise
  const liveIssue = await pg.live.query<IssueType>({
    query: `SELECT * FROM issue WHERE id = $1`,
    params: [params.id],
    signal: request.signal,
  })
  return { liveIssue }
}

const router = createBrowserRouter([
  {
    path: `/`,
    element: <Root />,
    children: [
      {
        path: `/`,
        element: <List />,
        loader: issueListLoader,
      },
      {
        path: `/search`,
        element: <List showSearch={true} />,
        loader: issueListLoader,
      },
      {
        path: `/board`,
        element: <Board />,
        loader: boardIssueListLoader,
      },
      {
        path: `/issue/:id`,
        element: <Issue />,
        loader: issueLoader,
      },
    ],
  },
])

const App = () => {
  const [showMenu, setShowMenu] = useState(false)
  const [pgForProvider, setPgForProvider] =
    useState<PGliteWorkerWithLive | null>(null)

  useEffect(() => {
    pgPromise.then(setPgForProvider)
  }, [])

  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const menuContextValue = useMemo(
    () => ({ showMenu, setShowMenu }),
    [showMenu]
  )

  if (!session) {
    return <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} />
  } else if (!pgForProvider) {
    return
  } else {
    return (
      <PGliteProvider db={pgForProvider}>
        <MenuContext.Provider value={menuContextValue}>
          <RouterProvider router={router} />
        </MenuContext.Provider>
      </PGliteProvider>
    )
  }
}

export default App