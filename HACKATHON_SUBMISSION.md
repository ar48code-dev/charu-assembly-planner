# Devpost submission draft

This draft uses only features verified in the current app. Replace the remaining prompts with participant-confirmed information before submitting.

## Project name

**Charu — The Assembly Planner**

## Elevator pitch

Charu turns a natural-language assembly brief into a reviewable concept while keeping required parts and connections locked, checking the returned structure, and leaving acceptance to a person.

## About the project

### Inspiration

Early assembly concepts are often expressed as loose text, while important details—required parts, connections, and size limits—are easy to lose. Charu makes those constraints visible before generation and keeps the proposal, checks, warnings, and human decision together.

### What it does

People describe an assembly, name required parts, lock directed part-to-part connections, and set a part ceiling and geometry budget. Charu requests a structured proposal, validates the response, displays a primitive spatial concept and build sequence, and stores the response for review. A person can explicitly accept a valid proposal, search it in the archive, or export a SHA-256 evidence manifest.

### How we built it

The web app uses React, TypeScript, and Vite. An Express API calls NVIDIA Nemotron 3 Nano 30B A3B through Nebius Token Factory. PostgreSQL and Drizzle persist plans; shared Zod-based API contracts validate requests and responses. The server checks hard constraints and allows at most one bounded repair attempt. The browser can export the saved response with a canonicalized SHA-256 hash.

### Challenges

The central challenge was treating model output as a proposal rather than trusted data. The pipeline validates required part identity, directed links, part count, supported primitive geometry, and the geometry budget before the UI offers acceptance. The interface also distinguishes a structurally valid response from a physically safe design.

### Accomplishments

- A complete brief-to-proposal-to-acceptance path using a real Nebius model response.
- Locked required parts and connections carried through the response.
- A reloadable archive, explicit acceptance record, and evidence export.
- A live end-to-end test produced a three-part camera-slider concept with two required links and seven of seven structural checks passing.

### What we learned

Constraints are easier to inspect when they are explicit in the request and repeated in the result. Model output needs server-side validation, and a successful structural check should not be presented as proof of mechanical safety.

### What's next

Add importable real 3D parts, richer joint types, more rigorous geometry and collision checks, and controlled comparisons across models. The current renderer uses box and cylinder primitives and does not produce manufacturing-ready CAD.

## Built with

React, TypeScript, Vite, Express, PostgreSQL, Drizzle ORM, Zod, Nebius Token Factory, NVIDIA Nemotron 3 Nano 30B A3B.

## Demo and repository

- **Demo site:** Add the public URL after publishing the app.
- **Video demo:** Upload `generated-artifacts/charu-demo.mp4` to a video host accepted by Devpost and paste the URL here.
- **Source repository:** Add the GitHub URL after connecting GitHub and creating the public repository.
- **Open-source license:** Apache-2.0 (selected by the participant; see `LICENSE`).

## Model and evaluation notes

- **Model used:** `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, through Nebius Token Factory.
- **How it is used:** Generate structured assembly proposals from a constrained natural-language brief. The server validates the output and may make one bounded repair attempt.
- **Why this model:** It is the single model wired into this prototype for generating structured proposals. No controlled model comparison was run, so do not claim it outperformed alternatives.
- **Observed test:** One live generation took about 22.7 seconds and returned a valid proposal with 7/7 structural checks passing. This is one run, not a benchmark or a general latency claim.
- **Token Factory performance comparison:** Not measured.
- **Tavily:** Not used in the current implementation.

## Participant-confirmed fields still required

- Choose the Devpost track(s).
- Enter the participant's age/eligibility and any employee-affiliation answers.
- Add the published demo URL and GitHub repository URL.
- Confirm the repository contains no credentials and that third-party assets retain their own license terms.
- Upload the MP4 and add its hosted video URL.
- Complete any subjective model-quality ratings from the participant's own evaluation; this draft does not invent them.
