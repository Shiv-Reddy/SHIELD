# Tech Stack — Shield

Two layers: what you build for the hackathon, and what a production version
would add. Do not adopt Full Product infrastructure prematurely — it adds
overhead the hackathon timeline can't absorb.

## 1. Hackathon Stack (Build This Now)

### Client (Browser Extension)
| Layer | Choice |
|---|---|
| Browser target | Google Chrome only |
| Extension framework | Chrome WebExtensions API, Manifest V3 |
| Language | JavaScript or TypeScript |
| Local AI inference | ONNX Runtime Web + Transformers.js |
| Acceleration | WebGPU, with WebAssembly/CPU fallback |
| Vision model | Targeted at what DOM cannot see (faces, pixel-baked text) rather than generic element detection — see DECISIONS.md |
| Face detection | UltraFace version-RFB-320 (native ONNX, MIT, WIDERFACE-trained) |
| OCR | Tesseract.js, run only on image-element crops — see DECISIONS.md |
| Redaction rendering | Canvas API |
| DOM scanning | Native JavaScript |

### Server (Backend)
| Layer | Choice |
|---|---|
| Framework | FastAPI (Python) or Express/NestJS (Node.js) |
| Reasoning model | Free-tier hosted VLM API first; self-hosted open-weight model as fallback |
| API style | REST, JSON (see API_SPEC.md) |
| Hosting (demo) | Local machine during dev; free-tier PaaS (Render/Railway/Fly.io) for live demo reliability |

### Dev & Testing
| Tool | Purpose |
|---|---|
| Browser DevTools | Extension debugging, network inspection |
| Postman or similar | Backend API testing |
| `performance.now()` | Latency instrumentation |
| Jest / PyTest | Unit testing (pick per language used) |

## 2. Full Product Stack (Add Later, Architected For Now)

### Infrastructure
| Layer | Choice (Representative Options) |
|---|---|
| Cloud hosting | AWS, GCP, or Azure — containerized deployment |
| Containerization | Docker, orchestrated with Kubernetes or a managed container service |
| CI/CD | GitHub Actions or equivalent — automated test + deploy pipeline |
| Model serving | Dedicated GPU-backed inference service (e.g. a managed model-serving platform), decoupled from the API gateway |
| Database (for audit logs, org config) | PostgreSQL |
| Caching | Redis, for repeatable prompt templates and rate-limit counters |
| Secrets management | Cloud provider's secrets manager (never hardcoded keys) |
| CDN | For serving extension update assets efficiently |

### Observability
| Tool | Purpose |
|---|---|
| Structured logging (e.g. JSON logs to a log aggregator) | Request tracing, error rates |
| Metrics dashboard (e.g. Grafana + Prometheus) | Latency, throughput, error-rate monitoring |
| Alerting | Anomaly detection on error spikes, latency regressions |

### Browser Store & Multi-Browser Support
| Item | Notes |
|---|---|
| Chrome Web Store | Developer account, privacy disclosure form, store listing assets |
| Firefox Add-ons | Manifest adjustments for Firefox's WebExtensions differences |
| Edge Add-ons | Chromium-based, largely compatible with Chrome build with minor adjustments |

### Security & Compliance Tooling
| Tool | Purpose |
|---|---|
| Static analysis / dependency scanning | Catch vulnerable dependencies before release |
| Third-party security review | Independent audit of the redaction pipeline and threat model (see SECURITY_PRIVACY.md) |

## 3. Migration Path (Hackathon → Full Product)

1. Keep the client-side redaction logic framework-agnostic from day one, so
   it ports cleanly if the extension is later rebuilt for Firefox/Edge.
2. Keep the backend's reasoning-model integration behind a clean interface
   (see API_SPEC.md), so swapping from a free-tier API to a production model
   backend doesn't require rewriting the API Gateway or Prompt Builder.
3. Introduce the database and audit-logging layer only when persistent
   storage is actually needed (Full Product) — the hackathon build should
   remain stateless by design.
4. Introduce CI/CD and observability tooling before any public beta, not
   during the hackathon.

## 4. Explicitly Not Using (Hackathon Phase)

- Firefox/Edge extension APIs
- Any paid LLM/VLM API by default (exploring free options first — see DECISIONS.md)
- Cloud GPU training pipelines (no model training required, only inference
  with pre-trained models)
- Kubernetes, managed databases, or any production infrastructure — adds
  overhead with no benefit at demo scale

## 5. Cost Note

The hackathon stack is free or near-free (pre-trained open models, free-tier
hosting/compute). The Full Product stack introduces real infrastructure
costs (cloud hosting, model serving, observability tooling) that should only
be adopted once there's a validated reason to run at production scale — see
ROADMAP.md for when that transition would realistically happen.
