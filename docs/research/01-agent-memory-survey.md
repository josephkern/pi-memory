# Agent Memory Research: arXiv 2512.13564 ("Memory in the Age of AI Agents: A Survey")

> Status: all claims below were adversarially verified (3-0 or 2-0 verifier votes, no refutations) against the primary sources cited.

## What the paper is

- **It is a survey/taxonomy paper, not a system paper.** It proposes no novel memory architecture of its own and reports no original benchmark numbers. Its value to this project is the taxonomy and its characterizations of existing systems. ([abs/2512.13564](https://arxiv.org/abs/2512.13564))
  > "This work aims to provide an up-to-date landscape of current agent memory research. We begin by clearly delineating the scope of agent memory and distinguishing it from related concepts such as LLM memory, retrieval augmented generation (RAG), and context engineering."
- "Memory in the Age of AI Agents: A Survey", Yuyang Hu + 46 co-authors. v1 2025-12-15, v2 2026-01-13. ([pdf](https://arxiv.org/pdf/2512.13564))
- The official companion paper list is [Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List) on GitHub.

## The three-axis taxonomy

| Axis | Categories | Meaning |
|---|---|---|
| **Forms** (what carries memory) | token-level, parametric, latent | Explicit/discrete text units vs. model weights vs. hidden states |
| **Functions** (what memory is for) | factual, experiential, working | Knowledge vs. learned skills/insights vs. active context management |
| **Dynamics** (how memory evolves) | formation, evolution, retrieval | Extraction → consolidation & forgetting → access strategies |

> "From the perspective of forms, we identify three dominant realizations of agent memory, namely token-level, parametric, and latent memory. From the perspective of functions, we propose a finer-grained taxonomy that distinguishes factual, experiential, and working memory. From the perspective of dynamics, we analyze how memory is formed, evolved, and retrieved over time."

## Findings directly relevant to a pi memory extension

### 1. Token-level (file-based) memory is the dominant, best-studied form

> "Token-level memory stores information as persistent, discrete units that are externally accessible and inspectable. ... Because these units are explicit, token-level memory is typically transparent, easy to edit, and straightforward to interpret ... Token-level memory is also the most common memory form and the one with the largest body of existing work."

**Implication:** a file-based design (markdown memory files, analogous to CLAUDE.md/AGENTS.md or Claude Code's auto-memory directory) is well supported by the literature, and gets transparency/editability for free. The only forms available to an extension anyway are token-level (we cannot touch weights or hidden states).

### 2. Naive LLM summary-merging on write drifts over time

> "Early implementations such as MemGPT (Packer et al., 2023a) and Mem0 (Chhikara et al., 2025) directly merged new chunks with existing summaries at appropriate moments, relying solely on the LLM's inherent summarization ability. However, this approach was constrained by the model's limited capacity, often resulting in inconsistency or semantic drift."

Later systems mitigated this with external redundancy filters (e.g. DeBERTa-based) or RL-trained summarizers (Mem1 with PPO, MemAgent with GRPO).

**Implication:** prefer **append-with-dedup of discrete facts** over continuously rewriting one merged summary blob. If we do merge/rewrite, do it rarely and keep the discrete source records.

### 3. Forgetting/decay mechanisms come in three named families

> "Forgetting mechanisms can be categorized into Time-based Forgetting, Frequency-based Forgetting, and Importance-driven Forgetting, corresponding respectively to creation time, retrieval activity, and integrated semantic valuation."

- **Time-based:** MemGPT evicts earliest messages on context overflow; MAICC soft-decays weights.
- **Frequency-based:** XMem uses LFU; MemOS uses LRU with archiving ("removing long-unused items while archiving highly active ones"); KARMA uses counting Bloom filters.
- **Importance-driven:** integrated semantic valuation.

The survey warns that **overly aggressive pruning erases rare-but-essential knowledge**.

**Implication:** if the extension prunes at all, prefer archiving (move to a cold file) over deletion, and bias toward keeping rare-but-load-bearing facts.

## Sources

| URL | Quality |
|---|---|
| https://arxiv.org/abs/2512.13564 | primary |
| https://arxiv.org/pdf/2512.13564 | primary |
| https://github.com/Shichun-Liu/Agent-Memory-Paper-List | primary (official companion) |
| https://huggingface.co/papers/2512.13564 | secondary |
| https://www.alphaxiv.org/overview/2512.13564 | secondary |
| https://arxiviq.substack.com/p/memory-in-the-age-of-ai-agents | blog (unverified, background only) |
