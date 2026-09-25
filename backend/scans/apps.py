import sys
import threading

from django.apps import AppConfig


class ScansConfig(AppConfig):
    name = 'scans'

    def ready(self):
        # Only warm up for the actual dev server -- not for migrate,
        # seed_demo_data, tests, etc., which don't need the (slow to
        # import) TensorFlow model loaded at all.
        if 'runserver' not in sys.argv:
            return

        def _warm_up():
            from . import ml_model
            ml_model.warm_up()

        # Load in a background thread so `runserver` still starts
        # instantly. Without this, TensorFlow's ~30-60s first-time load
        # happens lazily on whichever farmer's upload request happens to
        # be first -- which is exactly what caused the "could not reach
        # the server" timeout during testing (the browser gave up
        # waiting before Django finished loading the model).
        threading.Thread(target=_warm_up, daemon=True).start()
