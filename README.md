# Charu — Parametric Desk-Kit Studio

Charu turns desk measurements into editable 3D under-desk cable-organizer concepts. The app includes a parametric Desk Kit, two-point Fit Passport, printer-aware prototype exports, and a bounded local scene editor with review-before-apply.

## Verification boundaries

Fit and printer checks are dimensional estimates only. STL exports are geometric prototypes, not strength-tested, material-tested, or printer-validated products. Scene edits use an explicit local command grammar; they are not unrestricted AI edits. Desk-kit and scene-edit commands make no model calls. Browser-created objects and scenes stay in local browser storage.

## Run the web app

Use Node.js and pnpm:

```sh
pnpm install
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/charu run dev
```

For the assembly proposal workflow, run the API server separately:

```sh
pnpm --filter @workspace/api-server run dev
```

The API-backed features need PostgreSQL (`DATABASE_URL`), a session secret (`SESSION_SECRET`), and Nebius Token Factory (`NEBIUS_API_KEY`). Use a hosting platform's secret manager or environment variables; never commit actual values or `.env` files.

## Generate and verify API clients

The checked-in OpenAPI spec, generated React Query client, and generated Zod types are included together. To regenerate them and run the library typecheck:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Orval's React Query v5 setting is pinned in `lib/api-spec/orval.config.ts` because the catalog dependency is not declared directly by the `api-spec` package.

Run the app checks:

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/charu run test:geometry
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/charu run build
```


## Push this folder to GitHub

1. Create an empty public repository. Do not add another README, license, or `.gitignore`; this folder already includes the Apache-2.0 `LICENSE`.
2. Extract the ZIP and open a terminal inside `charu-assembly-planner`.
3. Replace the URL below with your new GitHub repository, then run:

```sh
git init
git add .
git commit -m "Prepare Charu source for hackathon"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```


## License

Apache-2.0. See [`LICENSE`](LICENSE).
