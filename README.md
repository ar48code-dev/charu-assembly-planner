# Charu — The Assembly Planner

Charu turns a natural-language design brief into a reviewable assembly concept. It keeps required parts, directed connections, a part limit, and a geometry budget explicit, then validates the model's proposal before a person can accept it.

## What it does

1. Describe an assembly and choose a use case.
2. Lock the required part names and part-to-part connections.
3. Set the maximum part count and geometry budget.
4. Generate a proposal through Nebius Token Factory using `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
5. Review the spatial layout, assembly steps, warnings, and structural validation checks.
6. Explicitly accept the saved response, find it in the archive, or export its evidence JSON with a SHA-256 integrity hash.

The API uses a real model response; it does not silently substitute a mock proposal. The server validates the response and may make one bounded repair attempt. Acceptance records a person's decision, not a safety certification.

## How to use Charu

- Enter a clear description of what the assembly should do.
- Keep the names in **Locked parts** and the directions in **Locked connections** aligned with the design you have in mind.
- Choose a part ceiling and geometry budget that fit the concept.
- Select **Create proposal** and inspect the model output and every validation result.
- If the proposal is valid and useful, choose **Review and accept proposal**, then confirm. Otherwise, revise the brief and make another proposal.
- Use **Plan archive** to search or filter saved plans and reload their recorded details.
- Use **Export evidence** to download the saved plan and its integrity hash.

## Current scope and safety

- The current spatial view uses bounded box and cylinder primitives; it is not a full CAD editor and does not import or export manufacturing-ready meshes.
- Structural checks cover response shape, required parts, directed connections, part count, and geometry budget. They do not prove strength, fit, tolerances, material suitability, or safe operation.
- Treat every result as a concept. Independently review and test any design before building or using it.
- Plans are scoped to a signed browser session. The app does not currently provide user accounts or shared workspaces.

## Run in Replit

The web app and API run as separate workflows:

```sh
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/charu run dev
```

Configure these values through Replit Secrets and the workspace database setup; never commit their values:

- `NEBIUS_API_KEY` — enables genuine Nebius Token Factory proposals.
- `DATABASE_URL` — PostgreSQL connection used by the API.
- `SESSION_SECRET` — signs the browser-session cookie.

For a newly provisioned database, apply the Drizzle schema with:

```sh
pnpm --filter @workspace/db run push
```

Review schema changes before applying them to production. The project uses `pnpm`. Replit workflows provide the app's preview `PORT` and `BASE_PATH`; for local checks and builds:

```sh
pnpm typecheck
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/charu run build
pnpm --filter @workspace/api-server run build
```

## Project layout

- `artifacts/charu` — React, TypeScript, and Vite web app.
- `artifacts/api-server` — Express API and Nebius model integration.
- `lib/api-spec`, `lib/api-client-react`, and `lib/api-zod` — shared API contracts and clients.
- `lib/db` — PostgreSQL connection and Drizzle schema.
- `HACKATHON_SUBMISSION.md` — factual Devpost draft and fields that still need participant input.
- `DEMO_SCRIPT.md` — short walkthrough narration and shot list.

## Hackathon demo

The current end-to-end demo produced a three-part camera-slider concept, preserved two required connections, passed all seven structural checks, and recorded explicit acceptance. The downloadable 57-second captioned walkthrough has no voice track and is prepared separately as `generated-artifacts/charu-demo.mp4`; it is intentionally excluded from Git. A narration script is in `DEMO_SCRIPT.md`.

Before submitting, upload that video to the host accepted by Devpost and paste its public or unlisted URL into the submission form. The form also needs the published demo URL, GitHub URL, track, and participant eligibility answers.

## License

This project is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
