# Sai Ganga — LDPE Inventory

React + TypeScript + Vite frontend on Supabase (Postgres + Auth), deployed on Vercel — both on their free tiers.

## Free-tier limits this app is designed to respect

- **Supabase database**: 500MB storage. Stock is always computed from views/RPCs over entry rows rather than duplicated columns, so growth is roughly linear in entry count, not in derived data.
- **Supabase egress**: ~5GB/month. Reports (Daily Summary, Trend) and the Dashboard call Postgres RPCs (`rpc_*` in `supabase/migrations/20260731010000_performance_optimizations.sql`) that aggregate with SUM/GROUP BY server-side instead of downloading every entry row to the browser. CSV export (`src/lib/csvExport.ts`) and Records (`src/hooks/useRecords.ts`) both cap/paginate reads for the same reason — see `MAX_QUERY_RANGE_DAYS` in `src/lib/date.ts` and `ROW_CAP` in `useRecords.ts`.
- **Supabase connection limits**: one Supabase client instance for the whole app (`src/lib/supabase.ts`), no realtime subscriptions, master data (products, material/scrap types, dealers, customers, company settings) cached client-side for 5 minutes (`MASTER_DATA_STALE_TIME` in `src/lib/queryClient.ts`) instead of re-fetched on every navigation.
- **Supabase free-tier auto-pause** (projects pause after ~7 days with zero traffic): `.github/workflows/keep-alive.yml` pings the project on a schedule.
- **Vercel free tier**: routes below Dashboard are code-split (`React.lazy` in `src/App.tsx`) so a factory-floor phone only downloads the screen it's opening.

If usage grows past these limits, the first upgrade to reach for is the Supabase Pro plan (higher storage/egress/connections) before anything architectural needs to change — the aggregation-in-Postgres and pagination patterns above scale well past the free tier on their own.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
