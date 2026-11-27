# HC-UFPE Imaging Exam Assistant

An AI-powered assistant that helps patients and healthcare professionals at the **Diagnostic Imaging Unit (UDI)** of **Hospital das Clínicas — UFPE** find out exactly how to prepare for imaging exams (CT, MRI, ultrasound, mammography, X-ray, and more).

The assistant answers questions about fasting, contrast, required documents, scheduling, AGHU codes, and operational flow — grounded **strictly** in the official UDI documentation, never on external or invented medical knowledge.

![Home page](home.png)

![Chat screen](chat.png)

## Objective

Patients and clinical teams often don't know how to prepare for an imaging exam, which leads to cancellations, repeated visits, and overloaded phone lines at the unit. This project provides a focused conversational assistant that:

- Gives **safe, source-grounded** preparation guidance — it answers *only* with what is written in the official UDI knowledge base, refusing to hallucinate fasting times, dosages, contraindications, or contacts.
- Adapts tone to two profiles:
  - **Patient** — simple, warm, step-by-step language.
  - **Professional** — technical, operational language (protocols, contraindications, request flow, **AGHU codes**).
- Offers a **guided exam picker**: instead of typing, the user drills down by modality → exam → variant (contrast / sedation / side), so it works even when you don't know the exact exam name.
- Handles special cases: the **X-ray request flow** (via AGHU system), the **list of contrast X-ray exams** that require preparation, and a **fallback** when a specific preparation isn't registered yet (it tells the user to contact the sector instead of guessing).
- **Inpatient module (professional profile):** questions about an inpatient (AGHU request, call the day before, prescription sent along, venous access, conditions to report) are answered from the documented CT/MRI/US flow (`data/inpatient-flow.json`). The **Checklist do internado** panel turns an exam plus the patient's conditions (diabetes, contrast allergy, sedation, isolation, O2, hemodialysis, weight, age) into a checklist split by who acts and when — on request (physician), 48h/day before, fasting, before going down (ward nursing) and what to report to the sector — with the source of every item and a "validação pendente" notice. It can be copied or printed to attach to the prescription. There is no AGHU integration or patient identifier field; the selected conditions are still health-related data and require an approved usage policy.
- Keeps **follow-up context**: a question like "and which documents do I bring?" reuses the exam from the recent conversation.
- Always cites the **sources** (exams) used to build each answer.
- **Persists conversations** locally so the user can revisit previous chats.
- Degrades gracefully: if the AI key is missing or the model is unavailable, a **deterministic mock response** built from the same knowledge base is returned, so the app never goes dark.

## How it works

1. The user picks a profile (patient or professional) on the home page.
2. The user types a question **or** chooses an exam in the guided picker. A picker selection sends the catalog identifier directly to the API.
3. Deterministic policies first handle known exams, medication questions, service restrictions, ambiguities, inpatient flow and standardized preparation items.
4. For eligible free text, Groq may interpret the question into validated fields. It does not write the answer; the catalog renderer does.
5. Residual questions may use Claude with a strict documentary context. Missing keys, invalid model output or provider errors fall back to deterministic behavior.
6. The reply and its evidence are returned and saved in the browser's `localStorage`.

### Knowledge base

The exam catalog is generated from the official spreadsheet (`docs-exames-udi-aghu.md`) by a deterministic ingest script into `data/exames.json`. New preparation guidance is stored as atomic, source-linked items in `data/orientacoes-preparo.json`; legacy coverage remains in `data/preparos.json` and `data/documentary-evidence.json` while migration continues.

| Data | Count |
|------|-------|
| Exams (`data/exames.json`) | **814** |
| Legacy preparation groups (`data/preparos.json`) | 23: 12 `ok`, 4 partial, 7 pending |
| Standardized atomic items (`data/orientacoes-preparo.json`) | 50: 29 documentary, 17 conflicting, 4 without located source; none approved by UDI |

Exams by modality:

| Modality | Exams |
|----------|-------|
| CT (`tomografia_computadorizada`) | 259 |
| X-ray (`radiologia_convencional`) | 212 |
| MRI (`ressonancia_magnetica`) | 193 |
| Ultrasound (`ultrassonografia`) | 108 |
| Nuclear medicine (`medicina_nuclear`) | 32 |
| Mammography (`mamografia`) | 6 |
| Bone densitometry (`densitometria_ossea`) | 4 |

> Every exam carries its **AGHU code** (`sigla`), surfaced only to the professional profile. The guided picker lists the full catalog, including exams whose preparation is still pending.

## Current architecture and conversation data

See [Architecture and conversation data](docs/arquitetura-atual-e-dados-de-conversa.md) for the implemented request flow, local history lifecycle, third-party data flows, current limitations and the retention/access decisions that still require institutional approval.

## Technologies

**Framework & language**
- [Next.js](https://nextjs.org) 16 (App Router)
- [React](https://react.dev) 19
- [TypeScript](https://www.typescriptlang.org) 5.7

**AI**
- [Vercel AI SDK](https://sdk.vercel.ai) (`ai`)
- [`@ai-sdk/anthropic`](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic) — Claude (`claude-sonnet-4-5`)
- Groq Chat Completions API — structured question interpretation (`openai/gpt-oss-120b`)

**UI & styling**
- [Tailwind CSS](https://tailwindcss.com) 4
- [shadcn/ui](https://ui.shadcn.com) + [@base-ui/react](https://base-ui.com)
- [Lucide React](https://lucide.dev) — icons
- [react-markdown](https://github.com/remarkjs/react-markdown) — render assistant replies
- `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`

**Tooling & platform**
- [Playwright](https://playwright.dev) — end-to-end tests (`e2e/`)
- [Vercel Analytics](https://vercel.com/analytics)
- ESLint
- Deployed on [Vercel](https://vercel.com), built/managed with [v0](https://v0.app)

## Project structure

```
app/
  page.tsx                 # Home — profile selection
  chat/
    page.tsx
    chat-client.tsx        # Chat UI (input + guided picker + sidebar)
  api/chat/route.ts        # Route selection, deterministic policies and optional model calls
components/
  guided-exam-picker.tsx   # Modality → exam → variant picker
  chat-sidebar.tsx         # Saved conversations
  ui/                      # shadcn/ui components
hooks/
  use-chat-sessions.ts     # Load/save/select persisted conversations
lib/
  search.ts                # Normalized text search over the exam base
  exam-options.ts          # Modalities & exam options for the picker (+ name prettifying)
  exam-grouping.ts         # Groups exam variants (contrast/sedation/side) for the picker
  chat-storage.ts          # localStorage persistence (7-day TTL, capped, auto-pruned)
  question-interpreter.ts  # Optional Groq interpretation into validated fields
  standard-answer.ts       # Answers backed by standardized atomic preparation items
  mock-response.ts         # Deterministic fallback when AI is unavailable
  types.ts                 # Shared types
data/
  exames.json              # Exam catalog (generated by ingest)
  fontes.json              # Registry of documentary sources and hashes
  orientacoes-preparo.json # Atomic preparation items with source and validation state
  conflitos.json           # Documentary conflicts awaiting a decision
  preparos.json            # Legacy preparation groups still in migration
scripts/
  ingest-exames.mjs        # docs-exames-udi-aghu.md → data/exames.json (deterministic)
  verify-grouping.mjs      # Sanity-check variant grouping
e2e/                       # Playwright specs: retrieval, follow-up context, guided picker
docs-exames-udi-aghu.md    # Source spreadsheet (exam catalog + AGHU codes)
```

## Getting Started

Provider keys are optional. Without them, the app keeps its deterministic responses:

```bash
# .env.local
CLAUDE_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```

Run the development server:

```bash
npm run dev
# or pnpm dev / yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run ingest` | Regenerate `data/exames.json` from the source spreadsheet |
| `npm run ingest:check` | Parse + validate + report, without writing |
| `npm run audit:catalog` | Audit catalog, preparation links and source conflicts; regenerate JSON/Markdown reports |
| `npm run audit:catalog:check` | Verify reports are current and fail on structural blockers |
| `npm run data:check` | Validate standardized preparation data and the generated UDI review |
| `npm run data:report` | Regenerate standardized-data reports |
| `npm run eval:dev` | Run the versioned development evaluation set |
| `npm run test:e2e` | Run the Playwright end-to-end suite |
| `npm run test:e2e:ui` | Run the E2E suite in Playwright UI mode |

> Most tests exercise deterministic paths. Scenarios intended to exercise a real provider require the corresponding environment key and must be identified separately from fallback runs.

## Disclaimer

This assistant provides **support guidance only** and does **not** replace the orientation of the healthcare team.

---

Built with [v0](https://v0.app). This repository is linked to a [v0 project](https://v0.app/chat/projects/prj_HlYN3UAL7PZ831ukC4wteYW0l12L) — every merge to `main` auto-deploys.
