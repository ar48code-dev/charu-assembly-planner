# Charu — The Assembly Planner

Charu — The Assembly Planner is one product with two connected workflows: **Brief Studio** keeps the original constrained, AI-assisted assembly planner, while **Desk Kit mode** adds a measurement-driven cable-organizer design workflow. Both make constraints visible and keep results reviewable.

## What it does

1. Describe an assembly and choose a use case.
2. Lock the required part names and part-to-part connections.
3. Set the maximum part count and geometry budget.
4. Generate a proposal through Nebius Token Factory using `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
5. Review the spatial layout, assembly steps, warnings, and structural validation checks.
6. Explicitly accept the saved response, find it in the archive, or export its evidence JSON with a SHA-256 integrity hash.

The API uses a real model response; it does not silently substitute a mock proposal. The server validates the response and may make one bounded repair attempt. Acceptance records a person's decision, not a safety certification.

### Desk Kit mode

Use desk and cable measurements to generate an editable, parametric under-desk organizer. Inspect its 3D geometry, review the Fit Passport's clamp-point and clearance checks, and use the printer-aware compiler to split supported parts for a selected print-bed size. Scene edits are explicit local commands that are staged for review before they are applied.

Desk Kit geometry and scene-edit commands are deterministic local code; they do not call the model. Fit and printer checks are dimensional estimates, not physical testing, strength or safety certification, or a promise that a printed part will fit.

## How to use Charu

- Enter a clear description of what the assembly should do.
- Keep the names in **Locked parts** and the directions in **Locked connections** aligned with the design you have in mind.
- Choose a part ceiling and geometry budget that fit the concept.
- Select **Create proposal** and inspect the model output and every validation result.
- If the proposal is valid and useful, choose **Review and accept proposal**, then confirm. Otherwise, revise the brief and make another proposal.
- Use **Plan archive** to search or filter saved plans and reload their recorded details.
- Use **Export evidence** to download the saved plan and its integrity hash.
- Open **Desk Kit** to configure an organizer from measurements, inspect the Fit Passport, and compile a printer-aware prototype package.
- Open **Scenes** to save local objects, then **Scene agent** to review and apply explicit scene-edit commands.

## Current scope and safety

- Brief Studio's spatial view uses bounded box and cylinder primitives; it is not a full CAD editor.
- Desk Kit exports are geometric prototypes, not strength-tested, material-tested, or printer-validated products. Its dimensional checks do not prove physical fit, tolerances, or safe operation.
- Assembly-plan structural checks cover response shape, required parts, directed connections, part count, and geometry budget; they do not prove mechanical safety.
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

## Hackathon demo

Charu keeps the original Brief Studio and adds Desk Kit mode. The current 2-minute-46-second video file is `generated-artifacts/charu-youtube-upload-branded.mp4`; generated videos are excluded from this source archive.

Before submitting, upload the video publicly to YouTube and paste its URL into Devpost. Make sure the video demonstrates Charu working and shows the actual Nebius Token Factory/Nemotron workflow, as required by the hackathon. The submission also needs a public demo URL and this public source repository.

## License

This project is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
