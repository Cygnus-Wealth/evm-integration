# EVM Integration Documentation Map

> **Quick reference guide** to all project documentation
> **Last Updated**: 2025-10-12

---

## 🎯 Start Here Based on Your Role

### 👨‍💻 **Implementing Features?**
**START**: [DEVELOPERS.md](./DEVELOPERS.md) ← **Your entry point**

### 📚 **Using This Library?**
**START**: [README.md](./README.md) ← User API docs

### 🏗️ **Reviewing Architecture?**
**START**: [ARCHITECTURE.md](./ARCHITECTURE.md) ← System design

### 🔨 **Looking for Component Specs?**
**START**: [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) ← Component index

---

## 📊 Documentation Flow Chart

```
┌─────────────────────────────────────────────────────────────────┐
│  For Library Users (External)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  README.md                                                       │
│  ├─ Installation & Quick Start                                  │
│  ├─ API Reference                                               │
│  ├─ Examples                                                     │
│  └─ Points to DEVELOPERS.md for contributors                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  For Developers/Contributors (Implementation)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DEVELOPERS.md ⭐ **START HERE**                                │
│  ├─ Documentation hierarchy                                     │
│  ├─ Reading order by phase                                      │
│  ├─ File organization                                           │
│  ├─ Implementation roadmap                                      │
│  ├─ Quick navigation cheat sheet                                │
│  └─ Success criteria & checklist                                │
│                                                                  │
│  Links to:                                                       │
│  ├─→ ARCHITECTURE.md (System design)                            │
│  ├─→ UNIT_ARCHITECTURE_INDEX.md (Component specs)               │
│  └─→ README.md (User perspective)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  System Architecture (Design & Patterns)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ARCHITECTURE.md                                                 │
│  ├─ Layered architecture                                        │
│  ├─ Core components (Registry, Adapters, Services)              │
│  ├─ Resilience patterns (Circuit Breaker, Retry, Fallback)      │
│  ├─ Performance patterns (Cache, Batch, Pool)                   │
│  ├─ Observability (Health, Metrics, Tracing)                    │
│  ├─ Security (Validation, Rate Limiting)                        │
│  ├─ Testing strategy                                            │
│  └─ Performance targets                                         │
│                                                                  │
│  Breadcrumbs: Links to DEVELOPERS.md, UNIT_ARCHITECTURE_INDEX   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  Unit Architecture (Implementation Specs)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  UNIT_ARCHITECTURE_INDEX.md ⭐ **Navigation Hub**              │
│  ├─ Quick navigation to all components                          │
│  ├─ Component dependency graph                                  │
│  ├─ 8-phase implementation roadmap                              │
│  ├─ File structure reference                                    │
│  ├─ Testing strategy                                            │
│  ├─ Quality standards                                           │
│  └─ Quick reference card (LOC estimates)                        │
│                                                                  │
│  Links to detailed specs in:                                    │
│  ├─→ UNIT_ARCHITECTURE.md (Part 1)                              │
│  └─→ UNIT_ARCHITECTURE.md (Part 2)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
          ↓                                    ↓
┌────────────────────────────┐   ┌────────────────────────────────┐
│  Part 1: Foundation        │   │  Part 2: Services              │
├────────────────────────────┤   ├────────────────────────────────┤
│                            │   │                                │
│  UNIT_ARCHITECTURE.md      │   │  UNIT_ARCHITECTURE.md    │
│                            │   │                                │
│  ├─ Error Hierarchy        │   │  ├─ BalanceService             │
│  ├─ Resilience Components  │   │  ├─ TransactionService         │
│  │  ├─ CircuitBreaker      │   │  ├─ TrackingService            │
│  │  ├─ RetryPolicy         │   │  ├─ HealthMonitor              │
│  │  ├─ FallbackChain       │   │  ├─ MetricsCollector           │
│  │  ├─ BulkheadManager     │   │  ├─ CorrelationContext         │
│  │  └─ TimeoutManager      │   │  ├─ Validators                 │
│  └─ Performance Components │   │  ├─ RateLimiter                │
│     ├─ CacheManager        │   │  ├─ Test Specifications        │
│     ├─ BatchProcessor      │   │  └─ Implementation Guide       │
│     ├─ RequestCoalescer    │   │                                │
│     └─ ConnectionPool      │   │  Phases: 4-8                   │
│                            │   │                                │
│  Phases: 1-3               │   └────────────────────────────────┘
│                            │
└────────────────────────────┘
```

---

## 📁 Complete File List

### Entry Points & Guides
- **[DEVELOPERS.md](./DEVELOPERS.md)** ⭐ - **START HERE** for developers
- **[README.md](./README.md)** - User-facing API documentation
- **[CLAUDE.md](./CLAUDE.md)** - AI assistant guidance

### Architecture Documentation
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture (layered, patterns, design)
- **[UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md)** - Component specs navigation
- **[UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md)** - Part 1: Foundation (errors, resilience, performance)
- **[UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md)** - Part 2: Services (services, observability, security)

### This Document
- **[DOCUMENTATION_MAP.md](./DOCUMENTATION_MAP.md)** - You are here! Overview of all docs

### Source Code (to be implemented)
- **src/** - Implementation goes here following unit architecture specs

---

## 🗺️ Navigation Breadcrumbs

All architecture documents include navigation breadcrumbs at the top:

```
DEVELOPERS.md
    └─> ARCHITECTURE.md
        └─> UNIT_ARCHITECTURE_INDEX.md
            ├─> UNIT_ARCHITECTURE.md (Part 1)
            └─> UNIT_ARCHITECTURE.md (Part 2)
```

**Example breadcrumb** (from UNIT_ARCHITECTURE.md):
```
> Navigation: Developer Guide > System Architecture > Unit Architecture Index > Part 1: Foundation
```

---

## 📖 Reading Paths

### Path 1: New Developer Onboarding
1. [README.md](./README.md) - Understand what users see
2. [DEVELOPERS.md](./DEVELOPERS.md) - Get oriented
3. [ARCHITECTURE.md](./ARCHITECTURE.md) - Understand system design
4. [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) - Find your component
5. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) or [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) - Get detailed specs

### Path 2: Implementing Phase X
1. [DEVELOPERS.md](./DEVELOPERS.md) - Check phase roadmap
2. [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) - Review phase components
3. [ARCHITECTURE.md](./ARCHITECTURE.md) - Read relevant architecture section
4. Detailed specs in [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) or [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md)
5. Implement with tests

### Path 3: Understanding Component X
1. [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) - Find component
2. Follow link to detailed spec
3. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for pattern details
4. Review existing code if implemented

### Path 4: Code Review
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Verify alignment with system design
2. [UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md) - Check against component specs
3. [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 7 - Verify test coverage
4. [DEVELOPERS.md](./DEVELOPERS.md) - Check quality gates

---

## 📊 Document Size Reference

| Document | Lines | Purpose | Audience |
|----------|-------|---------|----------|
| README.md | ~210 | User API docs | Library users |
| DEVELOPERS.md | ~650 | Developer guide | Contributors |
| ARCHITECTURE.md | ~863 | System design | All engineers |
| UNIT_ARCHITECTURE_INDEX.md | ~600 | Component index | Implementers |
| UNIT_ARCHITECTURE.md | ~2,500 | Part 1 specs | Implementers |
| UNIT_ARCHITECTURE.md | ~2,800 | Part 2 specs | Implementers |
| **Total** | **~7,600** | Complete docs | - |

---

## 🔍 Finding Information

### "Where can I find..."

| Information | Document | Section |
|------------|----------|---------|
| Installation instructions | README.md | Installation |
| API usage examples | README.md | Examples |
| Getting started guide | DEVELOPERS.md | Quick Start for Developers |
| System architecture overview | ARCHITECTURE.md | Overview |
| Resilience patterns | ARCHITECTURE.md | Resilience Architecture |
| Performance optimization | ARCHITECTURE.md | Performance Architecture |
| Error handling strategy | ARCHITECTURE.md | Error Handling Architecture |
| Testing strategy | ARCHITECTURE.md | Testing Architecture |
| Component specifications | UNIT_ARCHITECTURE_INDEX.md | Quick Navigation |
| Implementation roadmap | UNIT_ARCHITECTURE_INDEX.md | Implementation Roadmap |
| Error hierarchy specs | UNIT_ARCHITECTURE.md | Section 1 |
| Circuit breaker specs | UNIT_ARCHITECTURE.md | Section 2.1 |
| Cache manager specs | UNIT_ARCHITECTURE.md | Section 3.1 |
| Service layer specs | UNIT_ARCHITECTURE.md | Section 4 |
| Observability specs | UNIT_ARCHITECTURE.md | Section 5 |
| Test specifications | UNIT_ARCHITECTURE.md | Section 7 |
| Quality standards | DEVELOPERS.md | Quality Standards |
| File organization | DEVELOPERS.md | File Organization |

---

## ✅ Documentation Checklist

### For New Contributors
- [ ] Read README.md (understand user perspective)
- [ ] Read DEVELOPERS.md completely
- [ ] Skim ARCHITECTURE.md (get the big picture)
- [ ] Bookmark UNIT_ARCHITECTURE_INDEX.md
- [ ] Identify which phase you're working on
- [ ] Read detailed specs for your phase

### For Code Reviews
- [ ] Code follows ARCHITECTURE.md patterns
- [ ] Implementation matches UNIT_ARCHITECTURE specs
- [ ] Tests meet coverage requirements (UNIT_ARCHITECTURE.md Section 7)
- [ ] Quality gates passed (DEVELOPERS.md)

### For New Features
- [ ] Check if feature exists in architecture
- [ ] If new, document architectural changes
- [ ] Update relevant architecture docs
- [ ] Add to UNIT_ARCHITECTURE if needed

---

## 🚀 Quick Links

### Most Important Documents
1. **[DEVELOPERS.md](./DEVELOPERS.md)** - Start here if contributing
2. **[UNIT_ARCHITECTURE_INDEX.md](./UNIT_ARCHITECTURE_INDEX.md)** - Find any component spec
3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Understand system design

### By Phase
- **Phase 1**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 1 (Errors)
- **Phase 2**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 2 (Resilience Core)
- **Phase 3**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 3 (Performance)
- **Phase 4**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 2 (Advanced Resilience)
- **Phase 5**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 4 (Services)
- **Phase 6**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 5 (Observability)
- **Phase 7**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 6 (Security)
- **Phase 8**: [UNIT_ARCHITECTURE.md](./UNIT_ARCHITECTURE.md) Section 7-8 (Testing)

---

## 📝 Document Maintenance

**Owner**: Project Architect
**Update Trigger**: When new documents are added or major refactoring occurs
**Last Updated**: 2025-10-12

---

**Need help?** Start with [DEVELOPERS.md](./DEVELOPERS.md)!
