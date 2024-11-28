import { createClient, SupportedStorage } from '@supabase/supabase-js'
import localForage from 'localforage'

const storage = localForage.createInstance({
  name: 'supa-linear-lite',
  storeName: 'supa-linear-lite',
}) as SupportedStorage

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage,
    },
  }
)
