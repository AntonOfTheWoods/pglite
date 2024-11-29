import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import App from './App'
import { SessionContextProvider } from '@supabase/auth-helpers-react'

export default function AuthWrapper() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('Get session error', error)
      setSession(session)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])
  if (!session) {
    return (
      <div style={{ maxWidth: '700px' }}>
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} />
      </div>
    )
  } else
    return (
      <SessionContextProvider
        supabaseClient={supabase}
        initialSession={session}
      >
        <App />
      </SessionContextProvider>
    )
}
