# Phase 16 -- curated keyword/intent knowledge set for the basic chatbot.
# Deliberately NOT an LLM integration (per the phase plan) -- this is
# straightforward substring matching against a fixed set of intents, each
# with a fixed canned response. Order matters: entries are checked top to
# bottom, so more specific intents are listed before more generic ones to
# avoid an early, wrong match (e.g. "scan" should win before a generic
# greeting check that might also contain common words).
#
# Each entry: (intent_name, [keywords...], response_text)
# A message matches an intent if ANY of its keywords appears as a
# substring of the sanitized, lowercased message.

FAQ_ENTRIES = [
    (
        "greeting",
        ["hello", "hi", "hey", "namaskara", "namaste"],
        "Hello! I can help with questions about scanning crops, weather, "
        "crop guidance, learning videos, or nearby agri services. What do "
        "you need?",
    ),
    (
        "thanks",
        ["thank", "thanks", "dhanyavada"],
        "You're welcome! Let me know if you have any other questions.",
    ),
    (
        "scan_help",
        ["scan", "upload photo", "disease detect", "identify disease", "sick leaf", "leaf photo"],
        "To check a crop for disease: go to 'Scan a Crop' from the "
        "dashboard, take or upload a clear photo of the affected leaf, "
        "and you'll get an instant prediction with treatment guidance.",
    ),
    (
        "scan_history",
        ["past scan", "scan history", "previous result", "old scan"],
        "You can review all your past scans and their results under "
        "'Scan History' on the dashboard.",
    ),
    (
        "weather_help",
        ["weather", "rain", "forecast", "temperature", "climate today"],
        "You can check the current weather for your location from the "
        "'Weather' section on the dashboard -- it supports both your "
        "device location and typing a place name.",
    ),
    (
        "video_help",
        ["video", "learning", "youtube", "tutorial", "watch"],
        "You'll find farming tutorial videos under 'Learning Videos' on "
        "the dashboard -- search by crop name or topic, or open them "
        "directly from a crop's guidance page.",
    ),
    (
        "locator_help",
        ["nearby", "mandi", "market", "agri shop", "fertilizer shop", "agriculture office"],
        "The 'Nearby Services' section on the dashboard can show you "
        "agri shops, markets, and agriculture offices close to you, on "
        "a map or as a list.",
    ),
    (
        "fertilizer_help",
        ["fertilizer", "manure", "organic", "compost", "irrigation", "watering schedule"],
        "Fertilizer, irrigation, and organic manure guidance for each "
        "crop is available on that crop's page under 'Crop Guidance'.",
    ),
    (
        "arecanut_info",
        ["arecanut", "areca nut", "betel nut"],
        "Arecanut is the backbone crop of this region's intercropping "
        "system. Open 'Crop Guidance' > Arecanut for soil, climate, "
        "lifecycle, and fertilizer details.",
    ),
    (
        "pepper_info",
        ["black pepper", "pepper vine", "pollu"],
        "Black Pepper is typically trellised up Arecanut palms in this "
        "region. See 'Crop Guidance' > Black Pepper for full details, "
        "including Pollu Disease prevention and treatment.",
    ),
    (
        "cocoa_info",
        ["cocoa", "cacao"],
        "Cocoa is usually grown as a shade crop beneath Arecanut and "
        "Pepper here. Check 'Crop Guidance' > Cocoa for growing details.",
    ),
    (
        "rice_info",
        ["rice", "paddy"],
        "Rice is grown in the valley paddies in this region. See "
        "'Crop Guidance' > Rice for lifecycle, fertilizer, and disease "
        "information.",
    ),
    (
        "account_help",
        ["password", "forgot", "reset", "login", "log in", "sign in", "verify email"],
        "For login issues, use 'Forgot Password' on the login screen to "
        "reset your password, or 'Resend Verification' if your email "
        "isn't verified yet.",
    ),
]

FALLBACK_RESPONSE = "I'm not sure — would you like to ask our expert instead?"
