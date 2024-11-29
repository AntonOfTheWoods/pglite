import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'
import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  )
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const {
    data: { user },
  } = await supabaseClient.auth.getUser(token)

  if (!user) throw new Error('User not found')
  const supauser = {
    id: user.id,
    ...user.user_metadata,
    identities: user.identities,
    role: user.role,
    anon: user.is_anonymous,
  }
  //
  // Authentication and authorization
  //

  // If the user isn't set, return 401
  if (supauser.role !== 'authenticated' || supauser.anon) {
    return new Response(
      `authenticated user not found: ` +
        JSON.stringify([...req.headers.entries()]),
      { status: 401 }
    )
  }

  const url = new URL(req.url)

  // Construct the upstream URL
  const electric = Deno.env.get('ELECTRIC_URL') ?? ''
  const originUrl = new URL(`${electric}/v1/shape`)

  // Copy over the relevant query params that the Electric client adds
  // so that we return the right part of the Shape log.
  url.searchParams.forEach((value, key) => {
    if ([`live`, `table`, `handle`, `offset`, `cursor`].includes(key)) {
      originUrl.searchParams.set(key, value)
    }
  })
  const table = url.searchParams.get('table')
  // Only query data the user has access to unless they're an admin.
  if (table !== 'profiles' && !user.app_metadata?.roles?.includes('admin')) {
    originUrl.searchParams.set(`where`, `"user_id" = '${user.id}'`)
  }

  // When proxying long-polling requests, content-encoding &
  // content-length are added erroneously (saying the body is
  // gzipped when it's not) so we'll just remove them to avoid
  // content decoding errors in the browser.
  //
  // Similar-ish problem to https://github.com/wintercg/fetch/issues/23
  let resp = await fetch(originUrl.toString())
  if (resp.headers.get(`content-encoding`)) {
    const headers = new Headers(resp.headers)
    headers.delete(`content-encoding`)
    headers.delete(`content-length`)
    resp = new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    })
  }
  return resp
})
