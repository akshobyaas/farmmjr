# ml-training/ — Phase 9: CNN Model

This directory is separate from `backend/` and `frontend/` on purpose — this is dataset/model work,
not Django or React code.

## Crops covered

**Live model is v2** (`model_v2.h5`/`labels_v2.json`, trained from `phase9_v2_cnn_training.ipynb`):
**9 classes — Black Pepper (3), Rice (4), Arecanut (2: Yellow Leaf Disease, Mahali/Koleroga)**.
Cocoa was scoped for this retrain but didn't make it in — the only public Cocoa dataset found is in
YOLO object-detection format (`images/`+`labels/`), not classification folders, which this training
pipeline can't read; see `training_report.md` and the project docs for the full story. Arecanut Foot
Rot and Cocoa VSD still have no public dataset anywhere, under any name, as of the last survey
(October 2026).

The original v1 model (`model_v1.h5`/`labels_v1.json`, trained from `phase9_cnn_training.ipynb`,
described by the rest of this README) covered only **Rice and Black Pepper — 7 classes, no Cocoa**
despite this file's older instructions implying otherwise. v1's files are kept in this folder as a
fallback, not deleted, but the app itself (`backend/scans/ml_model.py`) loads v2.

This project's real regional crop system (the Dakshina Kannada / Udupi / Shivamogga arecanut-based
mixed-cropping belt; see `../PROJECT_SCOPE_PIVOT.md`) is 4 crops: Arecanut, Black Pepper, Cocoa, Rice.
Cocoa has guidance content (lifecycle/fertilizer/organic-manure) in the app but, per above, no CNN
disease detection yet.

## How to run this

These steps describe `phase9_cnn_training.ipynb` (v1). `phase9_v2_cnn_training.ipynb` (v2, the one
the live app actually uses) follows the same flow with an extra Arecanut download step — use whichever
notebook you're retraining; the Kaggle/Colab/`CLASS_FOLDER_MAP` steps below apply to both.

1. You'll need a free **Kaggle account and API token**: go to
   [kaggle.com/settings](https://www.kaggle.com/settings) → **API** → **Create New Token**. This
   downloads a `kaggle.json` file (or, for newer Kaggle accounts, a `KGAT_...` API token string) —
   keep it handy, you'll provide it when the notebook asks.
2. Go to [Google Colab](https://colab.research.google.com) and sign in with your Google account.
3. `File > Upload notebook` → select `phase9_cnn_training.ipynb` (v1) or `phase9_v2_cnn_training.ipynb`
   (v2) from this folder.
4. **Before running anything:** `Runtime > Change runtime type` → set Hardware accelerator to **T4 GPU** (free tier). Training on CPU works but is much slower.
5. `Runtime > Run all` — but **it will pause partway through**, on purpose. After the three Kaggle
   datasets download, the notebook prints their real folder structure and asks you to fill in
   `CLASS_FOLDER_MAP` (a short cell mapping the real folder paths to clean class labels) before it can
   continue. This can't be automated blindly — three different people uploaded these datasets to
   Kaggle with three different folder layouts, so you're confirming with your own eyes what's actually
   in them. It's a one-time ~10 minute step; re-run the notebook after filling it in.
6. Once that's filled in, `Runtime > Run all` again (or just run the remaining cells) — it trains,
   evaluates, and produces real metrics.
7. The last cell downloads four files to your computer's normal Downloads folder:
   - `model_v1.h5` — the trained model
   - `labels_v1.json` — class index → disease name mapping
   - `training_report.md` — real accuracy/precision/recall/F1 from this run
   - `confusion_matrix.png` — visual breakdown of what the model confused with what
8. Move all four files into this `ml-training/` folder, next to the notebook.

## Why Colab and not run directly here

Kaggle (where these datasets live) and the pretrained ImageNet weights TensorFlow needs for MobileNetV2
transfer learning are both hosted on infrastructure that wasn't reachable from the sandboxed
environment this project was built in. Colab has normal, full internet access and a free GPU, so it's
actually the better venue for this phase regardless — this isn't a workaround, it's the standard way to
do this kind of training.

## What's next

This has already happened — kept here as the historical record of how v1 first got wired in. Phase
10 (AI Integration) took `model_v1.h5`/`labels_v1.json` and wired them into the `ScanUploadView` in
`backend/scans/views.py`, replacing a "Processing not yet connected" placeholder with a real
prediction. `backend/scans/ml_model.py` has since been switched over to load v2 instead (see "Crops
covered" above) — any future retrain should follow the same pattern: produce `model_vN.h5`/
`labels_vN.json`, verify against real test photos, then update `ml_model.py`'s `is_model_available()`/
`_load()`/`LABEL_TO_DISEASE` to point at the new version, leaving the previous version's files in
place as a fallback.
