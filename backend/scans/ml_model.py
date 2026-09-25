"""
Phase 10 — AI Integration.

Loads the CNN trained in Phase 9 (ml-training/model_v1.h5) once per process
and runs inference on uploaded scan images. Kept out of views.py on purpose:
model loading and image preprocessing is a different concern from HTTP
handling, and this makes both easier to find, test, and swap out later
(e.g. a retrained model_v2.h5).
"""
import json
import logging
from pathlib import Path

import numpy as np
from django.conf import settings

logger = logging.getLogger(__name__)

IMG_SIZE = (224, 224)

# Maps the exact class label strings the model was trained on (see
# CLASS_FOLDER_MAP in ml-training/phase9_cnn_training.ipynb) to the
# (crop name, disease name) exactly as seeded in the database
# (crops/management/commands/seed_demo_data.py). Kept as an explicit table
# rather than parsed from the label string, so wording can differ between
# the training label and the DB disease name without breaking the lookup.
LABEL_TO_DISEASE = {
    "Pepper___Foot_Rot": ("Black Pepper", "Phytophthora Foot Rot (Quick Wilt)"),
    "Pepper___Pollu_Disease": ("Black Pepper", "Pollu Disease (Anthracnose)"),
    "Pepper___Slow_Decline": ("Black Pepper", "Slow Decline (Slow Wilt)"),
    "Rice___Bacterial_Leaf_Blight": ("Rice", "Bacterial Leaf Blight"),
    "Rice___Blast": ("Rice", "Blast"),
    "Rice___Brown_Spot": ("Rice", "Brown Spot"),
    "Rice___Tungro": ("Rice", "Tungro"),
}

_model = None
_labels = None


def _model_dir() -> Path:
    return settings.BASE_DIR.parent / "ml-training"


def is_model_available() -> bool:
    d = _model_dir()
    return (d / "model_v1.h5").exists() and (d / "labels_v1.json").exists()


def warm_up():
    """
    Loads the model eagerly (called from ScansConfig.ready() in a
    background thread) so the slow TensorFlow import + model load happens
    once at server startup, not on whichever request happens to be first.
    Safe to call even if the model files aren't present yet.
    """
    if not is_model_available():
        logger.warning("Phase 9 model files not found in ml-training/ -- skipping warm-up.")
        return
    try:
        _load()
    except Exception:
        logger.exception("Model warm-up failed -- predictions will be unavailable until fixed.")


def _load():
    global _model, _labels
    if _model is not None:
        return

    import tensorflow as tf  # imported lazily: heavy dependency, and some
    # environments (CI, or before Phase 9 has actually been run) may have
    # neither tensorflow installed nor a model file to load.

    d = _model_dir()
    _model = tf.keras.models.load_model(d / "model_v1.h5")
    with open(d / "labels_v1.json") as f:
        _labels = json.load(f)
    logger.info("Loaded Phase 9 CNN model with %d classes.", len(_labels))


def predict(image_path: str):
    """
    Runs the trained model against an already-saved scan image.

    Returns (label, confidence) on success, or (None, None) if the model
    isn't available or prediction fails for any reason. Callers should
    treat that as "prediction unavailable", not an error that blocks the
    upload -- the upload itself already succeeded by the time this runs.
    """
    if not is_model_available():
        return None, None

    try:
        import tensorflow as tf

        _load()

        img = tf.keras.utils.load_img(image_path, target_size=IMG_SIZE)
        arr = tf.keras.utils.img_to_array(img)
        arr = tf.keras.applications.mobilenet_v2.preprocess_input(arr)
        arr = np.expand_dims(arr, axis=0)

        preds = _model.predict(arr, verbose=0)[0]
        idx = int(np.argmax(preds))
        confidence = float(preds[idx])
        label = _labels[str(idx)]
        return label, confidence
    except Exception:
        logger.exception("Phase 9 model prediction failed for %s", image_path)
        return None, None


def disease_lookup(label):
    """Look up the DB Disease object for a predicted label string, if any."""
    if not label or label not in LABEL_TO_DISEASE:
        return None
    from crops.models import Disease

    crop_name, disease_name = LABEL_TO_DISEASE[label]
    return (
        Disease.objects.filter(crop__name=crop_name, name=disease_name)
        .select_related("crop", "recommendation")
        .first()
    )
