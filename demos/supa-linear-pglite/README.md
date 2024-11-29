# Linearlite + PGlite + ElectricSQL + Supabase

## Setup

1. Make sure you've installed all dependencies for the monorepo and built packages

From the root directory (make sure you have the `wasm` binaries in `packages/pglite/release`!):

- `pnpm i`
- `pnpm run -r build`

- `cd demos/supa-linear-pglite`

2. Start the docker containers

`pnpm backend:up`

3. When the `up` returns run

`pnpm db:load-data`

4. Start the frontend dev server

`pnpm dev`

5. Open a browser and go to `http://localhost:5173`, log on with either `janedoe@pglite.dev` (admin)
  or `joebloggs@pglite.dev` (user). All users have the password `a_good_password`. You can connect to the
  Supabase Studio on `http://localhost:8000` with user `supabase` and password
  `this_password_is_insecure_and_should_be_updated`

6. When done, tear down the backend containers

`pnpm backend:down`
