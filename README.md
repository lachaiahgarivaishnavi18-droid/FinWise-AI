# FinWise AI

A working React + Flask personal finance application with persistent financial records, goal planning, consent-controlled memory, grounded chat, and per-user machine learning.

## Run the app

Requires **Python 3.12** and **Node 22 + pnpm 11**. Run commands from this directory.

```powershell
python -m venv .venv312
.\.venv312\Scripts\python -m pip install -r backend/requirements-core.txt
pnpm install
pnpm build
.\.venv312\Scripts\python -m backend.bootstrap
.\.venv312\Scripts\python -m backend.app
```

Open **http://127.0.0.1:5000**. Register an account. New accounts start empty. Go to **Settings & privacy** to configure your financial profile and currency before creating records. Use **Explore sample data** on an empty account to load clearly labeled fictional records. Sample loading is explicit, account-scoped, and blocked when financial records or goals already exist.

Dependencies and a production frontend build have already been prepared in this workspace. To restart here:

```powershell
.\scripts\start.ps1
```

The startup script reads `.env` if present. Without `DATABASE_URL`, local development uses `backend/instance/finwise.db`. Without a configured JWT secret, a random process-local key is generated; restarting signs everyone out. Set a strong stable secret for persistent sessions. `.env.example` documents the settings. Never commit `.env`.

For frontend development, run the backend and `pnpm dev` in separate terminals. Vite proxies `/api` to port 5000.

## What works

- Registration, hashed passwords, JWT sign-in, server-side logout revocation, and request throttling.
- Financial profiles, four currencies, income and expense CRUD, recurring flags, month/date/category/amount filters, and CSV export.
- Monthly cash flow, expense distribution, savings trends, transaction history, and goal progress charts.
- Category budgets with actual utilization, overspending alerts, and suggestions derived from up to three completed months of records. Suggestions can be accepted, edited, or rejected.
- Goals with target dates, contribution history, progress, required monthly savings, and estimated completion dates in the API. Goal allocations are separate from cash-flow transactions; they do not double-count expenses.
- Recommendations with supporting amounts, actions, priorities, and persisted accept/reject/dismiss decisions.
- Conversational assistant using authorized records, computed financial context, approved memories, and the last 12 session messages.
- Explicit memory approval, correction, deduplication, expiration, summary, per-memory deletion, bulk deletion, and embedding deletion. Memory pause disables retrieval and new approvals.
- Opt-in chat retention for 30 days. History is off by default. Turning it off deletes stored history; clearing chat does not delete approved memories.
- Personal expense and savings regression, unusual-spending detection, and transaction categorization with holdout evaluation and model persistence.

Recurring transactions are labeled, not automatically charged or inserted into future months. Profile income is a planning input, not an income ledger entry. Recorded cash flow does not imply a bank-account balance.

## AI modes

### Conversational generation

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the backend environment. The backend calls the LLM over HTTPS with computed financial facts, relevant approved memories, profile amounts, and conversation context. The key never reaches the browser. Provider failure and missing configuration use a labeled calculation fallback; this fallback handles savings, spending, comparisons, budgets, and existing goals, but does not claim general language understanding.

Messages sent to a configured external LLM include relevant authorized financial context. Long-term memory approval is separate from optional chat-history retention. Do not enter credentials: common secret/card-number patterns are rejected before memory storage or chat generation. This filter is a defense, not an exhaustive data-loss prevention system.

### Semantic memory / RAG

The local default is a labeled **keyword fallback**. To enable Sentence Transformers:

```powershell
.\.venv312\Scripts\python -m pip install -r backend/requirements.txt
$env:ENABLE_SEMANTIC_MEMORY='true'
$env:EMBEDDING_MODEL='sentence-transformers/all-MiniLM-L6-v2'
.\.venv312\Scripts\python -m flask --app backend.app:create_app index-memories
```

The model downloads on first use. Provide sufficient memory and a writable model cache. The PostgreSQL configuration uses **pgvector**, 384-dimensional vectors, cosine retrieval, and an HNSW index. `backend.bootstrap` applies the initial vector migration. Existing memories can be reindexed with `index-memories`. With SQLite, normalized embeddings are searched locally; with embeddings disabled, only keyword matching runs. Changing embedding models requires rebuilding all embeddings; the initial migration supports only 384 dimensions.

Retrieval always scopes by authenticated user and excludes expired memories. Financial memories expire after 90 days by default, configurable to 1–365 days when approving. Corrections renew for 90 days. The assistant is instructed to verify stale/conflicting financial facts. Conflicting, differently worded memories are not automatically resolved; users can inspect and correct them. Summarization is extractive, source-labeled, and does not silently retain new information.

Short-term context remains in session state unless history is enabled. Long-term preferences and episodic events both require the user to approve their exact text. Chat may propose a memory for review; no chat statement automatically saves one.

Run the following daily in your scheduler to physically remove expired data. Expired data is already excluded from retrieval before this purge runs:

```powershell
.\.venv312\Scripts\python -m flask --app backend.app:create_app purge-expired
```

## Machine learning

`POST /api/predictions` trains independently for the current user. It requires at least eight completed months with expense records and rejects missing calendar-month gaps. Current-month partial spending is excluded. Linear regression uses a chronological 75/25 holdout (at least four training months). MAE, RMSE, and R² are calculated on held-out months before a final refit. R² is `null` when undefined. The forecast targets next calendar month. A separate savings model is trained and evaluated only when every expense-history month also has income.

Isolation Forest flags unusual amounts when at least 20 completed-month expense transactions exist. Flags are review prompts, not fraud findings. The prediction response includes transaction IDs; inspect them in Transactions.

`POST /api/categorize` trains TF-IDF + Multinomial Naive Bayes on the user's labeled descriptions. It needs 30 records, two categories, and three examples per category. It reports stratified holdout accuracy and returns suggestions for manual review. Repeated descriptions and small datasets can inflate holdout accuracy; production evaluation should also use grouped merchant/description splits and temporal backtesting. Sample-data metrics demonstrate the pipeline only and are not evidence of accuracy on real finances.

Joblib models are stored under ignored `backend/models_store/`. Only the application writes these files. Never load untrusted joblib files. A forecast is an estimate; there are no investment-return assumptions.

## Architecture

```text
src/
  main.jsx                    Application shell, views, connected state
  components/Auth.jsx         Registration and sign-in
  components/ui.jsx           Shared accessible controls and tables
  components/FinanceForms.jsx Transaction, budget, goal, memory and profile forms
  lib/api.js                  JWT-aware API client
  styles.css                  Responsive fintech design system
backend/
  app.py                      Application factory, REST routes, auth, validation
  models.py                   15 normalized SQLAlchemy tables
  services.py                 Decimal calculations, memory retrieval, RAG, recommendations
  ml.py                       Per-user preprocessing, evaluation and models
  bootstrap.py                Fresh database initialization
  migrations/001_pgvector.sql Native vector column and indexes
  tests/                      API, isolation, financial and memory lifecycle tests
```

The schema includes users, user_profiles, income_records, expense_records, expense_categories, budgets, financial_goals, goal_contributions, conversations, messages, user_memories, memory_embeddings, recommendations, ml_predictions, and notification_preferences. User-owned rows have indexed foreign keys. Goal, message, and embedding lifecycles cascade from their owning entities. Amounts use `NUMERIC(14,2)` and Decimal arithmetic, with positive/nonnegative checks. Mutations commit atomically, and validation failures roll back.

`bootstrap` is idempotent for a fresh installation and the initial vector migration. It is not a general schema-upgrade system; introduce reviewed, versioned migrations before changing an existing production schema.

## API reference

All endpoints except health, registration, and login require `Authorization: Bearer <token>`.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Database connectivity |
| `/api/auth/register`, `/api/auth/login` | POST | Authentication |
| `/api/auth/logout` | POST | Revoke all current user sessions |
| `/api/profile` | GET, PATCH | Profile and financial planning inputs |
| `/api/categories` | GET | Expense category IDs |
| `/api/transactions` | GET, POST | Filtered records / create income or expense |
| `/api/transactions/{income\|expense}/{id}` | PATCH, DELETE | Edit or delete an owned record |
| `/api/dashboard?month=YYYY-MM` | GET | Accurate summaries and trend history |
| `/api/budgets?month=YYYY-MM` | GET, PUT | Category limits and history-based suggestions |
| `/api/goals` | GET, POST | Goal list / creation |
| `/api/goals/{id}` | PATCH, DELETE | Goal modification |
| `/api/goals/{id}/contributions` | POST | Contribution history |
| `/api/recommendations` | GET | Evidence-based suggestions |
| `/api/recommendations/{id}` | PATCH | Recommendation decision |
| `/api/memories` | GET, POST, DELETE | Inspect, approve, or forget memories |
| `/api/memories/{id}` | PATCH, DELETE | Approve a correction / forget one |
| `/api/memories/summary` | GET | Extractive summary of current approved memories |
| `/api/settings` | GET, PATCH | Memory, history, budget-alert preferences |
| `/api/chat` | GET, POST, DELETE | Retained history, answer generation, clear history |
| `/api/predictions` | POST | Train/evaluate expense and savings forecasts |
| `/api/categorize` | POST | Suggest a transaction category |
| `/api/demo` | POST | Explicit fictional data for an empty account |

Transactions require `kind`, `description`, `amount`, and `date`; expenses also require `category_id`. GET filters: `month`, `start`, `end`, `kind`, `category`, `min`, `max`. Results are capped at 1,000 per transaction type. Budgets use `category_id`, `amount`, and `status` (`accepted` or `rejected`). Memories require `content`, `consent: true`, and optionally `kind` / `expires_in_days`. Chat accepts `message` and optional session `history`.

## PostgreSQL / Docker

The Compose file supplies PostgreSQL 16 + pgvector, Redis, and the application. Set strong `POSTGRES_PASSWORD` and `JWT_SECRET_KEY` environment values before running:

```sh
docker compose up --build
```

Database data lives in a named volume. Use a URI-safe password or percent-encode it in a custom connection string. The default image includes the core ML stack and keyword memory retrieval. For semantic retrieval, extend the image to install `sentence-transformers` (CPU PyTorch is recommended), then configure `ENABLE_SEMANTIC_MEMORY=true` and reindex. Keep the deployment model cache writable. No bank integration is present or required.

## Vercel + Render deployment

The full application is deployed at **https://finwise-ai-five.vercel.app**, with the React frontend and Flask API in the `finwise-ai` Vercel project and a dedicated free Neon PostgreSQL database (`finwise-db`). The initial schema and pgvector extension/index are initialized. Local financial records were not uploaded.

`api/index.py` is the Vercel WSGI entrypoint, `api/requirements.txt` pins its scientific runtime, and `api/.python-version` selects Python 3.12. `/api/*` routes to Flask; static assets and the frontend use Vercel's CDN. Keep `VITE_API_URL` unset for this same-origin deployment. `JWT_SECRET_KEY` is stored as a Vercel secret. Model artifacts use temporary runtime storage and can be retrained; financial records and evaluation results remain in PostgreSQL. LLM generation and transformer embeddings still require their optional configuration.

For subsequent deployments, run `vercel deploy --prod` from a clean source checkout linked to this project. `.vercelignore` excludes local environments, databases, test data, and caches. This machine used the ignored `.deploy/finwise` staging directory to avoid filesystem access errors while packaging; copy changed source into that directory before deploying from it again. Do not copy `.env` or local databases. The deployed project is already linked, so do not create another project or database for routine updates.

The following remains an alternative setup for a separate Render backend:

1. Push this repository to your Git host.
2. Provision PostgreSQL with the `vector` extension available. Set `DATABASE_URL` on Render to its connection URL; bootstrap upgrades `postgres://` URLs to the psycopg driver automatically.
3. Create the API service using `render.yaml`. Set `CORS_ORIGINS` to the exact Vercel frontend origin, `OPENAI_API_KEY` if desired, and `RATELIMIT_STORAGE_URI` to your shared Redis URL. Render generates a JWT secret. The predeploy command initializes the database and pgvector. The baseline service installs core dependencies; enable semantic retrieval only after installing and provisioning its model runtime.
4. Import the frontend into Vercel using `vercel.json`. Set **`VITE_API_URL=https://your-api.onrender.com`** before building. Never put API keys or database credentials in `VITE_` variables. These variables are public build-time values.
5. Configure a daily retention purge, backups, and restore testing. Use durable storage for model artifacts if they must survive restarts; financial records and evaluation results remain in PostgreSQL, and models can be retrained.

Production requires HTTPS and a shared rate-limit store across workers. The in-memory rate-limit default is for local development. Authentication requests are throttled, but email verification, password recovery, MFA, external identity providers, and comprehensive operational monitoring are not included. Review these for your release requirements. Configure platform logging without request bodies or secrets. The browser token is held in sessionStorage and cleared at logout; use a strict content security policy and consider HttpOnly-cookie sessions for a hardened production deployment.

## Verification

```powershell
.\.venv312\Scripts\python -m pytest backend/tests -q
pnpm build
```

All 24 tests pass, including with the scientific library versions pinned for Vercel. Tests exercise monetary validation and exact calculations, authorization and logout revocation, account isolation, transaction CRUD, goal contributions, budget utilization and decisions, currency protection, consent, deduplication, expiration, retrieval exclusions, embedding replacement/deletion, retention purge, opt-in chat, data insufficiency, the ML train/evaluation pipeline, provider context assembly, and provider-failure fallback. Semantic-lifecycle tests inject deterministic vectors; they do not verify downloaded transformer weights. The live Vercel frontend and PostgreSQL-backed API health endpoint were verified. Live LLM generation, transformer-based pgvector retrieval, and Docker builds have not been exercised.

The interface is intended for budgeting education. It provides no regulated investment, tax, or legal advice and never assumes guaranteed returns.
