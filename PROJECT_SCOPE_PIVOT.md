# Project Scope Update — Regional Focus for Publication

## 1. New scope statement

**Region:** Dakshina Kannada – Udupi – Shivamogga belt (coastal/Malnad Karnataka) — India's
arecanut heartland.

**Crops:** Arecanut, Black Pepper, Cocoa, Rice — not four random crops, but one real, documented
mixed-cropping system: arecanut is the backbone palm crop, black pepper is trellised up the same
palms, cocoa is grown in the shade below, and rice fills the valley paddies. This exact pairing is
institutionalized — **Campco** (Central Arecanut and Cocoa Marketing and Processing Cooperative)
exists specifically to market arecanut and cocoa together from this region.

**Why this satisfies "not existing yet":** every public crop-disease dataset and nearly every
student/hackathon project targets PlantVillage crops (tomato, potato, corn, apple, grape). None
target this specific regional multi-tier cropping system as an integrated whole. That is the actual
gap — not a single clever feature, but an unaddressed *region and crop combination*.

## 2. Literature / dataset survey (use directly in your paper's Related Work section)

| Crop | Public dataset(s) found | Notes |
|---|---|---|
| Rice | [Rice Leaf Disease Images](https://www.kaggle.com/datasets/nirmalsankalana/rice-leaf-disease-image), [Rice Leaf Diseases Dataset](https://www.kaggle.com/datasets/vbookshelf/rice-leaf-diseases), [Rice Diseases Image Dataset](https://www.kaggle.com/datasets/minhhuy2810/rice-diseases-image-dataset) | Well covered — many options, cross-validate across two for robustness |
| Black Pepper | [Black Pepper Leaf Disease Mini-Dataset](https://www.kaggle.com/datasets/adithyantg/black-pepper-leaf-disease-mini-dataset) | Small — supplement with published methodology from [ConvNets transfer-learning paper](https://www.nature.com/articles/s41598-024-51884-0) and [CNN foliar symptom paper](https://phytopatholres.biomedcentral.com/articles/10.1186/s42483-024-00305-1) |
| Cocoa | [Cocoa Diseases (Kaggle)](https://www.kaggle.com/datasets/bryandarquea/cocoa-diseases), [Amini Cocoa Contamination Dataset](https://www.kaggle.com/datasets/ohagwucollinspatrick/amini-cocoa-contamination-dataset) | Usable directly |
| Arecanut | **No public image dataset found.** One recent paper ([graph neural network + Bat algorithm, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13195169/)) does this research but doesn't appear to publish its dataset. | This is your real opening — see Section 5 |

Existing regional-crop combination precedent (cite as related work, not as a competitor to fear):
none found combining these four crops in one system. The closest adjacent work is single-crop
papers (coffee, rice, generic PlantVillage crops) — cite 2–3 of these as "prior work addresses
individual crops; no system addresses this region's actual mixed-cropping reality."

## 3. Updated Phase 7 — Crop Database

Replace the current seed data (Tomato, Potato, Corn, Rice, Wheat, Cotton, Sugarcane — a generic
list not matched to any real region) with:

- **Arecanut** — soil: laterite, well-drained; climate: humid, heavy monsoon (Malnad); role: the
  backbone/primary crop of the system.
- **Black Pepper** — grown as a trellis crop up arecanut palms (note this relationship explicitly
  in the crop record — it's a differentiator that your crop guidance shows *intercropping*
  relationships, not just isolated crop cards).
- **Cocoa** — shade-grown beneath the arecanut/pepper canopy.
- **Rice** — valley paddy, separate fields from the palm gardens.

Consider adding an `intercropped_with` relationship field to the `Crop` model so the app can
actually *show* the real farming system (e.g. Arecanut's detail page lists "commonly grown with:
Black Pepper, Cocoa") — this is a concrete technical feature that directly demonstrates the
regional-system framing, not just marketing copy.

## 4. Updated Phase 9 — CNN Model

Retarget `ml-training/phase9_cnn_training.ipynb`:

- Train on **Rice + Black Pepper + Cocoa** using the datasets above (swap `SELECTED_CROPS` and the
  dataset source cells — rice/pepper/cocoa aren't all on the same GitHub repo the way PlantVillage
  was, so the notebook needs per-dataset download cells instead of one sparse-checkout).
- **Arecanut is the real opportunity for a genuine, citable contribution**: if you (or your team)
  can collect even 150–300 real arecanut leaf photos (healthy + 2–3 common conditions like yellow
  leaf disease) from a local garden or KVK/agricultural extension office, you can honestly claim
  "to our knowledge, the first published image dataset for arecanut disease classification" —
  that's a real, defensible research contribution on its own, independent of model accuracy.
  Publish the dataset alongside the paper (Kaggle or Mendeley Data, like RoCoLe did for coffee).
- Report real per-crop and combined-system metrics — a multi-crop model evaluated as one coherent
  system (not four disconnected single-crop demos) is itself a design decision worth stating
  explicitly in the paper's methodology.

## 5. Publication strategy

Two honest, achievable angles — pick one as primary:

**A. System paper:** "An integrated disease-detection and advisory system for the arecanut-based
mixed-cropping system of coastal Karnataka" — novelty is the region-specific, multi-crop,
intercropping-aware system design + human-expert fallback for low-confidence predictions, not a
single new algorithm. Publishable in a regional/national ag-tech or applied-CS conference or
journal.

**B. Dataset + baseline paper (stronger, if arecanut data collection happens):** "A first image
dataset and baseline CNN for arecanut leaf disease classification" — this is the more defensible,
higher-value claim, since it fills a documented, verified gap (Section 2). Even a modest baseline
accuracy is publishable when paired with a genuinely new dataset — this is exactly how RoCoLe
(coffee) and several cocoa datasets got published.

Either way: be explicit in the paper about what's confirmed (rice/pepper/cocoa — real datasets,
real transfer learning, real metrics) versus what's a contribution precisely because it's new
(arecanut — small, self-collected, honestly labeled as a first pass, not a mature benchmark).
Reviewers respect that framing; overclaiming a mature arecanut model you don't have would not
survive review.

## 6. What doesn't change

Phases 1–8 (auth, security, crop browsing infrastructure, image upload) stay exactly as built —
none of this pivot touches that code. Only the *content* (which crops, which region) and Phase 9's
training target change. Phases 10 (AI integration), 11 (recommendations), 13 (weather), 15 (nearby
services), 17 (advisory) all carry forward unchanged in structure, just populated with this
region's real content instead of generic placeholders.
