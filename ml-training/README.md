# ml-training/ — Phase 9: CNN Model

This directory is separate from `backend/` and `frontend/` on purpose — this is dataset/model work,
not Django or React code.

## Crops covered

**Rice, Black Pepper, Cocoa** — three of the four crops in this project's real regional system (the
Dakshina Kannada / Udupi / Shivamogga arecanut-based mixed-cropping belt; see
`../PROJECT_SCOPE_PIVOT.md`). Arecanut itself has no public image dataset, so it's deliberately not in
this first model — see the notebook's closing section for why that's actually a research opportunity,
not a gap to hide.

## How to run this

1. You'll need a free **Kaggle account and API token**: go to
   [kaggle.com/settings](https://www.kaggle.com/settings) → **API** → **Create New Token**. This
   downloads a `kaggle.json` file — keep it handy, you'll upload it when the notebook asks.
2. Go to [Google Colab](https://colab.research.google.com) and sign in with your Google account.
3. `File > Upload notebook` → select `phase9_cnn_training.ipynb` from this folder.
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

## What's next (Phase 10)

Once `model_v1.h5` and `labels_v1.json` are in this folder, Phase 10 (AI Integration) wires them into
the `ScanUploadView` in `backend/scans/views.py`, replacing the current "Processing not yet
connected" placeholder with a real prediction — populating `ScanHistory.predicted_disease` and
`.confidence` for the first time.
