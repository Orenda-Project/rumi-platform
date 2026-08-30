# How educational / curriculum KGs are built — literature basis for `semantic_slos.py`

This is the grounding for the SLO semantic + prerequisite layer. The one rule that shapes the whole design: **embeddings are symmetric (similarity), a prerequisite is directional — so cosine can never *be* a prerequisite; it can only propose candidates that a separate orienter then directs, followed by a DAG constraint.**

## Ontology (what nodes/edges the field uses)
- Nodes: **Knowledge Concepts**, **Learning Objects/Materials**, **Learning Objectives/Outcomes** (our SLO), categories, learners, assessment items.
- Edges: **PREREQUISITE_OF** (directional), **SIMILAR_TO / RELATED_TO** (symmetric), **EQUIVALENT_TO** (symmetric equivalence), plus is-a/part-of, covers/teaches.
- Interoperability vocab to align *to*: **1EdTech CASE** (`isChildOf`/`isRelatedTo`/`exactMatchOf`) and **ASN** (Achievement Standards Network) crosswalks. Keep **equivalence (symmetric)** and **progression/prerequisite (directional)** as *distinct edge types* — mirrors CASE.
  - CASE: https://www.1edtech.org/standards/case · ASN: http://www.achievementstandards.org/content/asn-toolkit
  - Worked EduKG schema (CourseMapper): Alatrash et al., *Inferring Prerequisite Knowledge Concepts…*, arXiv:2509.05393 (2025) — https://arxiv.org/html/2509.05393

## Prerequisite inference — the real methods (each supplies a directional signal)
- **RefD / Reference Distance** — Liang, Wu, Huang & Giles, EMNLP 2015 — https://aclanthology.org/D15-1193/ . Asymmetric Wikipedia-link metric. **Needs every concept mapped to a Wikipedia article ⇒ poor for fine-grained, non-English, locally-authored SLOs.**
- **Supervised pairwise classification** — Pan et al., ACL 2017 — https://keg.cs.tsinghua.edu.cn/jietang/publications/ACL17-Pan-et-al-Prerequisite-Relationship-MOOCs.pdf . Directionality lives in the *features* (order, link ratios, complexity). Needs labels; F1 ~0.6–0.8.
- **Textbook/curriculum ORDER prior** — Wang/Liang/Giles, CIKM 2016 — https://dl.acm.org/doi/10.1145/2983323.2983725 . *This is exactly our `PRECEDES_SLO` teaching-order signal.* Legitimate but **weak** (order = prerequisite + pedagogy + theme) → one low-weighted voter, not truth.
- **Graph/link-prediction (VGAE/GNN)** — LectureBank AAAI 2019 (https://arxiv.org/pdf/1811.12181), R-VGAE 2020 (https://arxiv.org/pdf/2004.10610), GNN CIKM 2023 (https://dl.acm.org/doi/10.1145/3583780.3614761). Embeddings are node *features*, direction is learned from seed edges.
- **LLM pairwise adjudication (2023–25)** — Le & Abel, arXiv:2507.18479 (2025) — https://arxiv.org/html/2507.18479 . Best zero-shot F1 ≈ 0.83, but on the lenient BERTScore metric — authors warn of surface lexical matching. **Strongest single orienter for locally-authored SLOs with no encyclopedia article**; must be candidate-gated, both-orderings (position-bias), DAG-checked.
- Consensus (multi-criteria voting paper, 2509.05393): **ensemble several weak directional criteria, tune for precision over recall** — a false prerequisite mis-routes a learner; a missing one is cheaper.

## Embeddings — legitimate (symmetric) uses only
Candidate generation (kNN), similarity/clustering, node features, and **cross-curriculum standards alignment** (Camilli, arXiv:2405.17284 — embed both sides, cosine + reciprocal-best-match, **experts sign off**). They must **never** assert prerequisite direction.
- **Multilingual (e.g. English + a non-Latin L1)**: **BGE-M3** (BAAI, 100+ langs, beats LaBSE on retrieval — https://huggingface.co/BAAI/bge-m3), **multilingual-E5-large** (arXiv:2402.05672), **LaBSE** (bitext specialist → reserve for cross-lingual *equivalence*). All run offline, no creds. **Do not pre-translate the non-English side** — encode natively.

## Evaluation
Held-out labeled pairs (precision/recall/F1; benchmarks LectureBank/AL-CPL/ESCO-PrereqSkill), expert annotation for locally-authored standards, **precision-favoring operating point**, and a **DAG/cycle check** (a prerequisite cycle is definitionally invalid).

## The pipeline we implement (`semantic_slos.py`)
1. **Encode once** with a multilingual model (BGE-M3 preferred; multilingual-E5-large fallback), native language, cached. *(offline)*
2. **SIMILAR_TO** — mutual kNN + tuned cosine threshold; cosine as weight. *(offline, symmetric)*
3. **EQUIVALENT_TO** — reciprocal-best-match at a high threshold (cross-lingual: require LaBSE agreement). Distinct edge type. *(offline)*
4. **PREREQUISITE_OF candidates** = SIMILAR_TO ∪ adjacent PRECEDES_SLO ∪ (cross-strand, semantically close, ≤2 grades apart). *(offline)*
5. **Orient** by an ensemble of weak voters, precision-tuned: **grade ordering** (strong, offline) · **teaching order** (weak, offline) · **Bloom complexity** (offline; SLO Bloom derived from its teaching lessons' `AT_BLOOM`) · **LLM adjudication** (strong, needs a key) for the same-grade/cross-strand pairs the offline voters leave tied. Offline pass emits those tied pairs as **unoriented candidates** for a later LLM pass.
6. **DAG pass** — detect cycles, break weakest-weight edge, transitive-reduce. *(offline)*
7. **Evaluate** — precision-favoring; expert audit of a sample.

### What NOT to do
Don't threshold cosine and call it a prerequisite · don't treat teaching order as ground-truth dependency · don't let an LLM invent edges free-form (gate to vetted candidates, both orderings, DAG-check) · don't pre-translate the non-English side · don't skip the cycle check · don't tune for recall · don't conflate SIMILAR_TO/EQUIVALENT_TO with PREREQUISITE_OF · don't rely on RefD for local non-English SLOs.

*(The LLM F1≈0.83 rests on lenient BERTScore — do not over-read.)*
