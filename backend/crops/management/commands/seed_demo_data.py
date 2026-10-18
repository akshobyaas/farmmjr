from django.core.management.base import BaseCommand
from crops.models import (
    Crop, CropStage, CropTask, Disease, DiseaseRiskRule, Recommendation, FertilizerSchedule, Lifecycle,
    OrganicManureMethod,
)
from accounts.models import User


# USP crop-tracker content: the recurring annual phenological cycle each
# perennial crop goes through, researched for the Dakshina Kannada/Udupi/
# Shivamogga belt specifically (see USP_FEATURES_DESIGN.md section 5 for the
# research brief). Rice instead reuses its own already-seeded Lifecycle day
# values verbatim (it's an annual crop tracked by days-since-planting, not by
# calendar month). Tuple shape: (name, day_start, day_end, month_start,
# month_end, order) -- a crop only populates the pair that applies to it.
#
# Arecanut -- ICAR-CPCRI Kasaragod's published arecanut operations calendar
# (calareca012.pdf, cpcri.gov.in) is the primary source: it ties fungicide
# spraying for inflorescence dieback to "opening of female flowers" starting
# February, with dieback risk running Feb-May; tender-nut drop April-July and
# fruit-rot risk June-September during nut development; "harvesting for
# chali may be started" in November, ripe-nut harvest/drying in December,
# and leftover ripe-nut harvest in January. Cross-checked against The
# Totagars' Co-Operative Sale Society, Sirsi, Uttara Kannada
# (tssindia.in/areca-in-karnataka) -- a farmers' cooperative based in Sirsi,
# Uttara Kannada (North Kanara district; an earlier version of this comment
# wrongly called it a "South Kanara processors' association" -- Uttara
# Kannada/Sirsi is a different district from South Kanara/Dakshina Kannada).
# It states malnad areas (matching Shivamogga) harvest December-January
# while plains areas harvest August-September.
#
# A prior version of this comment also cited DASD's arecanut page
# (dasd.gov.in/index.php/content/index/arecanut) for "~9 months flower to
# fully-ripe chali" and "6-7 months for kalipak" -- re-fetched live on
# 2026-10-18 for this fix and neither figure is actually on that page, and
# the term "kalipak" does not appear there at all. The DASD citation and
# those specific figures have been removed rather than kept in softened
# form. The only month-maturity figure the DASD page actually gives is, in
# its tender-nut-processing section: "harvesting green fruits at an
# appropriate stage of about six months maturity is essential" -- a rough,
# weak corroboration of the Apr-Jul tender-nut-drop window CPCRI documents
# when read against CPCRI's own February flowering onset, but not a
# flower-to-chali ripeness figure and not specific to "kalipak". "Vegetative
# growth" has no distinct month-specific documentation in any source
# (arecanut palms flower/fruit/flush near-continuously) -- Jan-Feb is used
# here as the defensible estimate for the quiet window between the tail of
# harvest and the documented February flowering onset, flagged explicitly as
# an estimate rather than a cited figure.
AREACANUT_STAGE_DEFS = [
    ("Vegetative growth", None, None, 1, 2, 1),
    ("Flowering", None, None, 2, 4, 2),
    ("Fruit development", None, None, 4, 9, 3),
    ("Harvest", None, None, 9, 12, 4),
]

# Black Pepper -- TNAU's horticulture extension page (agritech.tnau.ac.in,
# spice crops: pepper) states plainly "the vines flower in May-June" and that
# spikes/berries take about 6-8 months from flowering to ripen (turning
# green to yellow-red), with harvest "November-February in the plains" and
# "January-March in the hills".
#
# NOTE ON SOURCE (read this before trusting this as a Karnataka citation):
# TNAU is Tamil Nadu Agricultural University -- a TAMIL NADU source, not a
# Karnataka one. The brief asked specifically for Karnataka university
# extension material for pepper; a UAS Bangalore- or Shivamogga ZARS-
# authored bulletin with month-level pepper phenology data was searched for
# explicitly and not found (results were paywalled/irrelevant journal PDFs).
# TNAU is used here only as a stand-in for that unavailable Karnataka-
# specific source, not presented as Karnataka-specific itself -- see
# task-2-report.md for the full search record. Cross-checked against
# organicmandya.com's Karnataka-focused (Mandya) black pepper page, which
# independently gives 6-7 months from flowering to the same green-to-red
# color change used as the harvest cue, confirming the fruit-development
# window without adding a different number. Since this belt spans both
# coastal plains (Dakshina Kannada/Udupi) and malnad hills (Shivamogga), the
# Dec-Feb harvest window used below is a deliberate blend of TNAU's plains
# (Nov-Feb) and hills (Jan-Mar) figures rather than a single cited number --
# noted here as a judgment call.
# "Vegetative growth" (climbing growth before flowering) has no month-
# specific figure in either source -- Feb-May is used as the estimated
# lead-in window before the documented May flowering, flagged as an
# estimate.
BLACK_PEPPER_STAGE_DEFS = [
    ("Vegetative growth", None, None, 2, 5, 1),
    ("Flowering", None, None, 5, 6, 2),
    ("Fruit development", None, None, 6, 12, 3),
    ("Harvest", None, None, 12, 2, 4),
]

# Cocoa -- ICAR-CPCRI Kasaragod's cocoa operations calendar (two versions:
# CALENDAR_FOR_COCOA.pdf and cocoacal2012.pdf, both cpcri.gov.in) states pods
# take "150-170 days from pollination to attain the harvest stage" (~5-5.7
# months), names December as when "flowers will be available" for
# controlled pollination and January as having "newly emerged flowers", and
# gives the main harvest as starting "toward the end of May" and running
# through the "peak harvest in Karnataka: May to September" -- with
# Karnataka's harvest additionally "staggered October to December" as a
# secondary/extended flow not captured in the primary window below. These
# three figures are internally consistent: Dec/Jan pollination + ~5-5.7
# months of pod development lands almost exactly on the documented
# end-of-May harvest start. "Vegetative growth" has no month-specific figure
# in either CPCRI document (cocoa flowers near-continuously once mature) --
# Sep-Nov is used as the estimated window between the end of the May-Sep
# main harvest and the documented Nov/Dec flowering, flagged as an estimate.
COCOA_STAGE_DEFS = [
    ("Vegetative growth", None, None, 9, 11, 1),
    ("Flowering", None, None, 11, 1, 2),
    ("Fruit development", None, None, 1, 5, 3),
    ("Harvest", None, None, 5, 9, 4),
]

# Rice's trackable stages mirror its own already-seeded Lifecycle day values
# verbatim (Germination 5-10, Vegetative/Tillering 20-45, Flowering/Panicle
# 45-65, Harvest 100-140 days from planting) -- it's an annual crop tracked
# by days-since-planting rather than calendar month, so no new research is
# needed here; see USP_FEATURES_DESIGN.md section 1.
RICE_STAGE_DEFS = [
    ("Germination", 5, 10, None, None, 1),
    ("Vegetative growth / Tillering", 20, 45, None, None, 2),
    ("Flowering / Panicle stage", 45, 65, None, None, 3),
    ("Harvest", 100, 140, None, None, 4),
]

CROP_STAGE_DEFS = {
    "Arecanut": AREACANUT_STAGE_DEFS,
    "Black Pepper": BLACK_PEPPER_STAGE_DEFS,
    "Cocoa": COCOA_STAGE_DEFS,
    "Rice": RICE_STAGE_DEFS,
}


# Task 10 -- DiseaseRiskRule seed content (favouring-condition thresholds +
# advisories), researched per USP_FEATURES_DESIGN.md section 5. Every
# citation below names a document/page this implementer actually fetched
# live and can quote; none is written from training-data recall of "roughly
# what such an institute's advisory probably says" (see task-10-report.md
# for the full research record, including search queries that came up
# empty). Where a real source gives no numeric %/degree/mm figure -- which
# is the normal case for the Arecanut/Cocoa/Pepper fungal diseases below,
# every one of which CPCRI/KAU/ICAR describe only qualitatively ("high
# humidity", "low temperature", "monsoon season") -- the numeric threshold
# fields are either left as None, or set to a small, explicitly-flagged
# working estimate (never presented as the source's own number). Shared
# notation per entry below: "stage_names" is a list of this crop's
# CROP_STAGE_DEFS names to link via applicable_stages, or [] for "any
# stage" (a deliberate choice per disease, justified in its own comment --
# not just an omission).

# Arecanut -- primary source: ICAR-CPCRI Kasaragod, "Disease Management
# Strategies in Arecanut and Cocoa" (disease_management_strategies_in_
# arecanut_and_cocoa(eng)_1.pdf, cpcri.icar.gov.in), cross-checked against
# CPCRI's ext17.pdf (cpcri.gov.in) which is specifically about Koleroga/
# Mahali, and -- for Koleroga only -- against Deccan Herald's report of a
# real local outbreak.
AREACANUT_RISK_RULE_DEFS = [
    {
        # CPCRI's "Disease Management Strategies in Arecanut and Cocoa"
        # states YLD symptoms are "clearly discernible during months of
        # September to November" and disappear with summer; it is spread by
        # the plant-hopper Proutista moesta and is "not amenable to control
        # by conventional plant protection measures." No humidity/
        # temperature/rainfall figure is given anywhere in this source, so
        # every weather-threshold field below is left None rather than
        # invented -- this is a seasonal-monitoring + vector-management
        # rule, not a weather-triggered one. applicable_stages is left
        # empty: YLD is a chronic, systemic phytoplasma disease of the
        # whole palm (not tied to the annual flowering/fruiting cycle this
        # app's CropStage model tracks).
        "disease_name": "Yellow Leaf Disease (YLD)",
        "stage_names": [],
        "humidity_min_percent": None, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.MODERATE,
        "advisory_text": (
            "Watch for yellowing starting at the tips of older-frond leaflets between "
            "September and November, when CPCRI documents YLD symptoms as most clearly "
            "visible. There is no cure, so focus on slowing progression: manage the "
            "Proutista moesta plant-hopper vector, keep fields well drained, and feed palms "
            "CPCRI's recommended 100g N : 40g P : 140g K per palm/year (two splits) plus "
            "12kg organic manure and 12kg green leaf. Remove and destroy severely affected "
            "palms to limit further spread."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Disease Management Strategies in Arecanut and Cocoa\" "
            "(cpcri.icar.gov.in/filemgr/webfs/publication/disease_management_strategies_in_"
            "arecanut_and_cocoa(eng)_1.pdf): YLD symptoms are 'clearly discernible during "
            "months of September to November'; vector is the plant-hopper Proutista moesta; "
            "disease 'is not amenable to control by conventional plant protection measures.' "
            "No numeric weather threshold is given in this source."
        ),
    },
    {
        # Primary source CPCRI's ext17.pdf (cpcri.gov.in), specifically on
        # Koleroga/Mahali: favoured by "low temperature, high humidity,
        # alternating sunshine and heavy rainfall" during the SW monsoon --
        # no numeric figure given. CPCRI's other document separately places
        # bud rot's main window at SW monsoon (June-September) continuing
        # into the following winter (October-February) -- i.e. nearly 8 of
        # 12 months, spanning this crop's Flowering/Fruit development/
        # Harvest/Vegetative-growth CropStages almost entirely. Regionally,
        # Deccan Herald (deccanherald.com, Bengaluru -- a genuine Karnataka
        # English-language daily, not a generic pan-India site) reported a
        # real koleroga/fruit-rot outbreak in Sringeri (Malnad belt)
        # attributed to "heavy rainfall prevailing in the Malnad region for
        # the last one month" -- a locally-specific case directly
        # corroborating CPCRI's qualitative humidity/rainfall description.
        # Neither CPCRI document nor Deccan Herald gives a %, degree or mm
        # figure. humidity_min_percent (85) and consecutive_days_required
        # (3) below are this implementer's own working estimates
        # translating "high humidity" + "alternating sunshine and heavy
        # rainfall" into numeric form for a weather-matching engine --
        # neither number is stated by any source and both are flagged here
        # as estimates, not citations. applicable_stages is left empty
        # because, per the two CPCRI documents together, the risk window
        # itself spans nearly the whole year regardless of which annual
        # CropStage the tracker shows.
        #
        # Fix round 1 (reviewer finding, Important) -- disclosing an
        # identity nuance between the two cited CPCRI documents, the same
        # way the VSD entry above discloses its own tree-age nuance: ext17.pdf
        # is titled "KOLEROGA (MAHALI) OF ARECANUT", names the pathogen
        # Phytophthora areeae, and covers ONLY fruit symptoms ("the rotting
        # of arecanut fruits") -- it never uses the term "bud rot" and never
        # discusses the spindle/bud at all. The Disease row this rule
        # attaches to is named "Mahali / Koleroga (Bud Rot)" (seeded
        # earlier, out of scope to rename here), so that row's own name
        # doesn't match what our primary source actually documents. The
        # bud-rot framing instead comes from the cross-check document
        # ("Disease Management Strategies in Arecanut and Cocoa"), which
        # treats fruit rot, bud rot and crown rot as three separate
        # symptom-presentations (fruit, spindle, and leaf-sheath base
        # respectively) all attributed there to the same organism, which it
        # names Phytophthora meadii -- a different species name than
        # ext17.pdf's P. areeae for what both documents otherwise describe
        # as the same Koleroga/Mahali disease complex. Both the species-name
        # mismatch and the fruit-vs-bud framing mismatch are disclosed below
        # rather than silently resolved.
        "disease_name": "Mahali / Koleroga (Bud Rot)",
        "stage_names": [],
        "humidity_min_percent": 85, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 3,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Sustained high humidity with heavy monsoon rain over several days sharply "
            "raises koleroga/Mahali risk -- this is exactly the combination Deccan Herald "
            "reported behind a real 2018 outbreak in Sringeri's Malnad belt. Apply a "
            "prophylactic 1% Bordeaux mixture spray immediately after the first monsoon "
            "showers, repeat 40-45 days later, and add a third spray if the monsoon runs "
            "long. Scoop out any rotting spindle tissue, treat with 10% Bordeaux paste, and "
            "cover with an areca leaf sheath or polythene; collect and destroy fallen/"
            "infected nuts regularly."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, ext17.pdf (cpcri.gov.in), titled \"KOLEROGA (MAHALI) OF "
            "ARECANUT\": favoured by 'low temperature, high humidity, alternating sunshine "
            "and heavy rainfall' during the SW monsoon. Names the pathogen Phytophthora "
            "areeae and covers only fruit symptoms ('the rotting of arecanut fruits') -- it "
            "does not mention bud rot at all, even though the Disease row this rule attaches "
            "to is named 'Mahali / Koleroga (Bud Rot).' Cross-checked against CPCRI's "
            "\"Disease Management Strategies in Arecanut and Cocoa\" (cpcri.icar.gov.in), "
            "which places bud rot's main window at June-September plus the following "
            "October-February and attributes fruit rot, bud rot and crown rot to the same "
            "organism, which it names Phytophthora meadii -- a different species name than "
            "ext17.pdf's P. areeae for what both otherwise describe as the same disease "
            "complex; this naming discrepancy is disclosed rather than silently resolved. "
            "Regionally corroborated by Deccan Herald (deccanherald.com/india/karnataka/"
            "disease-affects-arecanut-685042.html, published 1 August 2018): a koleroga/"
            "fruit-rot outbreak in Sringeri (Malnad) was attributed to 'heavy rainfall "
            "prevailing in the Malnad region for the last one month.' "
            "humidity_min_percent=85 and consecutive_days_required=3 are this implementer's "
            "own working estimates, not figures from any of these sources."
        ),
    },
    {
        # CPCRI's bulletins describe foot rot/Anabe roga (Ganoderma
        # lucidum) with "wide occurrence in the Malnad and Maidan areas of
        # Karnataka" -- explicitly this project's own target belt -- but
        # give no humidity/temperature/rainfall figures at all; management
        # is purely soil/drainage-based (isolation trenches, root-feeding
        # with calixin, neem cake), not a weather-threshold response. No
        # numeric weather threshold is invented here. applicable_stages is
        # left empty: this is a basal/root disease unrelated to the annual
        # flowering-fruiting cycle.
        "disease_name": "Foot Rot (Anabe Roga)",
        "stage_names": [],
        "humidity_min_percent": None, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.MODERATE,
        "advisory_text": (
            "No specific weather trigger is documented for foot rot -- CPCRI's guidance is "
            "about soil management, not rainfall or humidity. Maintain field drainage and "
            "avoid injuring roots during intercultivation. For an infected palm, isolate it "
            "with a trench 30cm wide x 60cm deep, drench the basin with 1.5% calixin "
            "(repeat quarterly -- March, July, October, January -- for early-stage palms), "
            "and apply neem cake (1.5-2.0 kg/palm) across the whole affected garden "
            "alongside the recommended fertilizer dose."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, ext17.pdf / \"Disease Management Strategies in Arecanut "
            "and Cocoa\" (cpcri.gov.in, cpcri.icar.gov.in): foot rot/Anabe roga (Ganoderma "
            "lucidum) has 'wide occurrence in the Malnad and Maidan areas of Karnataka, "
            "parts of Tamil Nadu, Kerala and Assam.' No weather or soil-moisture numeric "
            "threshold is given in this source."
        ),
    },
]

# Black Pepper -- primary source: Kerala Agricultural University's celkau.in
# extension portal (Centre for e-Learning, KAU) and KAU's Journal of
# Tropical Agriculture, used as a disclosed Kerala stand-in -- a Karnataka
# university (UAS Bangalore/Dharwad/Shivamogga ZARS) bulletin giving pepper
# disease weather thresholds specifically was searched for and not found.
# Cross-checked against ICAR's Indian Journal of Agricultural Sciences for
# Pollu/anthracnose.
BLACK_PEPPER_RISK_RULE_DEFS = [
    {
        # celkau.in (KAU) states quick wilt/foot rot (Phytophthora capsici)
        # "occurs mainly during the southwest monsoon season," spreading
        # vine-to-vine "during intermittent showers due to rain splash,"
        # with humidity build-up around the vine base flagged as a concern
        # at monsoon onset. Cross-checked against KAU's Journal of Tropical
        # Agriculture 46(1-2):70-72 (2008, Mammootty, Abraham & Vijayaraghavan,
        # Pepper Research Station KAU Panniyur / College of Horticulture KAU
        # Thrissur), which separately confirms disease build-up is
        # "conducive... especially during the southwest monsoon season"
        # (citing Sarma et al. 1996). Neither source gives a numeric %,
        # degree or mm figure; humidity_min_percent (85) and
        # consecutive_days_required (3) below are this implementer's own
        # working estimates for "monsoon/high-humidity" risk, not cited
        # numbers. applicable_stages is left empty: this is a whole-vine
        # disease (base/collar rot spreading to the whole plant), not
        # reproductive-stage specific.
        "disease_name": "Phytophthora Foot Rot (Quick Wilt)",
        "stage_names": [],
        "humidity_min_percent": 85, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 3,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Rain-splash during the monsoon spreads quick wilt from vine to vine -- this is "
            "the single most destructive disease of black pepper. At monsoon onset, loop or "
            "prune the support-tree (arecanut) branches to let in sunlight and cut humidity "
            "build-up around the vine base, improve drainage, and avoid water stagnation. "
            "Drench the base with 1% Bordeaux mixture or copper oxychloride; remove and "
            "destroy severely affected vines promptly to stop it spreading to neighbours."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal "
            "(celkau.in/Crops/Spices/Pepper/diseases_mainfield.aspx): quick wilt/foot rot "
            "(Phytophthora capsici) 'occurs mainly during the southwest monsoon season,' "
            "spreading via 'intermittent showers due to rain splash.' Cross-checked against "
            "KAU's Journal of Tropical Agriculture 46(1-2):70-72 (2008, Mammootty et al., "
            "Pepper Research Station KAU Panniyur), which states disease build-up is "
            "'conducive... especially during the southwest monsoon season.' Both are Kerala "
            "(not Karnataka) sources, used as a disclosed stand-in -- no Karnataka-specific "
            "numeric bulletin for this disease was found. humidity_min_percent=85 and "
            "consecutive_days_required=3 are this implementer's own working estimates, not "
            "figures from either source."
        ),
    },
    {
        # celkau.in (KAU) states slow-wilt foliar yellowing "starts in
        # October, coinciding with depleted soil moisture" -- i.e. visible
        # symptoms are a DRY-season phenomenon, the opposite weather
        # direction from the other two pepper diseases here -- with some
        # vines recovering "with the southwest monsoon in May-June" before
        # symptoms return in later dry seasons. No humidity/rainfall-HIGH
        # threshold is set for this rule because that would contradict what
        # the source actually says. No numeric figure of any kind is given,
        # so none is invented. applicable_stages left empty: this is a
        # chronic, multi-year decline (nematode + fungal complex), not tied
        # to one annual CropStage.
        "disease_name": "Slow Decline (Slow Wilt)",
        "stage_names": [],
        "humidity_min_percent": None, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.MODERATE,
        "advisory_text": (
            "Unlike quick wilt and pollu, slow decline's visible symptoms (yellowing, "
            "defoliation) emerge as soil moisture drops after the monsoon ends -- monitor "
            "vines from October onward rather than during heavy rain. Use nematode-free "
            "planting material, apply organic amendments to support soil health and vine "
            "resilience against the underlying Radopholus similis/fungal complex, and "
            "improve drainage to reduce the secondary fungal pressure that worsens nematode "
            "damage."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal "
            "(celkau.in/Crops/Spices/Pepper/diseases_mainfield.aspx): slow wilt/slow decline "
            "foliar yellowing 'starts in October, coinciding with depleted soil moisture,' "
            "and some affected vines 'recover with the southwest monsoon in May-June.' A "
            "Kerala (not Karnataka) source, used as a disclosed stand-in -- no "
            "Karnataka-specific numeric bulletin was found. No numeric weather threshold is "
            "given in this source."
        ),
    },
    {
        # ICAR's Indian Journal of Agricultural Sciences paper "Epidemiological
        # studies of black pepper anthracnose" (epubs.icar.org.in) correlated
        # monthly disease incidence with weather and found "higher minimum
        # temperatures, rainfall, and number of rainy days were associated
        # with higher incidence" (higher maximum temperature correlated with
        # LOWER incidence), and separately identifies "newly emerged leaves
        # on runner shoots, orthotropic and plagiotropic shoots, and young
        # spikes" as the most vulnerable plant parts. Cross-checked against
        # celkau.in (KAU), which independently states Pollu "appears towards
        # the end of the monsoon" and times Bordeaux spray before flowering
        # (late June-early July) and at berry formation (late August) --
        # directly tying the disease to the flowering/young-fruit window.
        # Neither source gives an exact rainfall-mm or rainy-days-count
        # figure; consecutive_days_required (3) below is this implementer's
        # own working estimate for the "number of rainy days" factor the
        # ICAR paper names (not its exact count). applicable_stages is
        # genuinely stage-specific here, backed directly by both sources:
        # Flowering + Fruit development (young spikes/berries).
        "disease_name": "Pollu Disease (Anthracnose)",
        "stage_names": ["Flowering", "Fruit development"],
        "humidity_min_percent": None, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 3,
        "risk_level": DiseaseRiskRule.RiskLevel.MODERATE,
        "advisory_text": (
            "Risk rises with rainy, humid weather toward the end of the monsoon, "
            "concentrated on young spikes and newly emerged shoots -- which is why this "
            "rule is linked to the Flowering and Fruit development stages rather than left "
            "open to any stage. Regulate shade to around 40%, ensure adequate summer "
            "irrigation (4-5 times every 5-7 days), and remove/destroy fallen leaves and "
            "spikes to cut inoculum. Spray 1% Bordeaux mixture or carbendazim + mancozeb "
            "(0.1%) in the pre-monsoon/post-monsoon periods and again around berry "
            "formation."
        ),
        "source_citation": (
            "ICAR, \"Epidemiological studies of black pepper anthracnose (Colletotrichum "
            "gloeosporioides)\", Indian Journal of Agricultural Sciences "
            "(epubs.icar.org.in/index.php/IJAgS/article/view/34547): 'higher minimum "
            "temperatures, rainfall, and number of rainy days were associated with higher "
            "incidence'; 'newly emerged leaves... and young spikes' are the most vulnerable "
            "plant parts. Cross-checked against Kerala Agricultural University's celkau.in "
            "portal, which states Pollu 'appears towards the end of the monsoon' and times "
            "sprays to before flowering and at berry formation. consecutive_days_required=3 "
            "is this implementer's own estimate for the 'number of rainy days' factor named "
            "by the ICAR paper, not its exact figure."
        ),
    },
]

# Cocoa -- primary source: ICAR-CPCRI Kasaragod's "Disease Management
# Strategies in Arecanut and Cocoa" (same document cited for Arecanut
# above, which covers both crops).
COCOA_RISK_RULE_DEFS = [
    {
        # CPCRI states black pod (Phytophthora palmivora) "occurs in the
        # rainy season, June-September" and that "high humidity and low
        # temperature are favourable for disease development," with close
        # planting/excessive shade also favouring it and "pods of all ages"
        # susceptible. No numeric %/degree figure is given.
        # humidity_min_percent (85) and consecutive_days_required (3) below
        # are this implementer's own working estimates for "high humidity,"
        # explicitly flagged as not CPCRI's own numbers. applicable_stages
        # is left empty: per CPCRI's own "pods of all ages" statement, plus
        # this file's own COCOA_STAGE_DEFS comment that cocoa "flowers
        # near-continuously once mature," the disease isn't gated to one
        # annual CropStage.
        "disease_name": "Black Pod Disease",
        "stage_names": [],
        "humidity_min_percent": 85, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 3,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Because pods of all ages are susceptible and cocoa flowers/fruits near-"
            "continuously, treat high-humidity, rainy-season weather as risky regardless of "
            "which annual stage the tracker currently shows. Remove and cut out infected "
            "pods weekly, prune to open up air circulation and reduce excess shade, and "
            "spray 1% Bordeaux mixture or copper oxychloride on pods and bearing branches at "
            "frequent intervals through the wet season."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Disease Management Strategies in Arecanut and Cocoa\" "
            "(cpcri.icar.gov.in/filemgr/webfs/publication/disease_management_strategies_in_"
            "arecanut_and_cocoa(eng)_1.pdf): black pod (Phytophthora palmivora) 'occurs in "
            "the rainy season, June-September'; 'high humidity and low temperature are "
            "favourable for disease development'; pods of all ages are susceptible. "
            "humidity_min_percent=85 and consecutive_days_required=3 are this implementer's "
            "own working estimates, not CPCRI's own figures."
        ),
    },
    {
        # Fix round 1 (reviewer finding, Critical): the previous version of
        # this entry quoted CPCRI as saying VSD is "particularly damaging
        # to young cocoa plantings." Re-fetched the document live on
        # 2026-10-18 for this fix and that exact phrase, and any claim
        # ranking VSD's severity by planting age, does not appear anywhere
        # in it -- it was fabricated. What the document actually says,
        # verified by this re-fetch: VSD "has been recognised as the most
        # destructive disease of cocoa" in Papua New Guinea, Malaysia,
        # Indonesia and the Philippines; in India it has been "observed in
        # Thiruvananthapuram, Kottayam, Idukki, Kozhikode and Wynad
        # districts of Kerala State"; and it "has an incubation period of
        # 3-6 months or even longer period in infected seedlings to express
        # first visible symptoms," which is why the document recommends
        # preventing movement of vegetative planting material from diseased
        # to disease-free areas (undetected latent infection in seedlings
        # being the risk, not seedlings/young plants being more severely
        # damaged once infected). The wet-weather/white-crust fruiting-body
        # claim below is verbatim and was re-confirmed as real on this same
        # re-fetch. "Seedlings" here, like "young plantings" in the removed
        # claim, refers to tree AGE (tracked by this app's Lifecycle model),
        # not the annual CropStage cycle (Vegetative growth/Flowering/Fruit
        # development/Harvest) -- so applicable_stages is still left empty
        # rather than pattern-matched on the word "vegetative." No numeric
        # weather estimate is added -- CPCRI's "wet weather" cue is about
        # when fruiting bodies become visible, not a stated infection
        # threshold, so even a flagged humidity estimate would overstate
        # what this source supports.
        "disease_name": "Vascular Streak Dieback (VSD)",
        "stage_names": [],
        "humidity_min_percent": None, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Watch especially during and after wet weather, when white, crusty fruiting "
            "bodies may appear around leaf scars. Because infected seedlings can carry the "
            "fungus silently for 3-6 months or longer before symptoms show, never move "
            "planting material from a garden with VSD into a disease-free one. Split a "
            "suspect branch to check for brown streaking in the wood, then prune and destroy "
            "affected branches well below the last visible streak. Avoid excess humidity and "
            "overly dense shade. Pruned material does not need special disposal, since the "
            "fungus cannot survive in dead plant parts. No fully effective chemical "
            "treatment exists -- sanitation pruning and tolerant planting material are the "
            "primary controls."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Disease Management Strategies in Arecanut and Cocoa\" "
            "(cpcri.icar.gov.in/filemgr/webfs/publication/disease_management_strategies_in_"
            "arecanut_and_cocoa(eng)_1.pdf): VSD (Oncobasidium theobromae) 'has been "
            "recognised as the most destructive disease of cocoa' in Papua New Guinea, "
            "Malaysia, Indonesia and the Philippines, and in India has been observed in "
            "Thiruvananthapuram, Kottayam, Idukki, Kozhikode and Wynad districts of Kerala. "
            "It 'has an incubation period of 3-6 months or even longer period in infected "
            "seedlings to express first visible symptoms' -- hence the recommendation against "
            "moving planting material from diseased to disease-free gardens. In wet weather, "
            "fruiting bodies appear 'as a white crust around leaf scars.' No numeric weather "
            "threshold is given. (Fix round 1: this entry previously misquoted the document "
            "as calling VSD 'particularly damaging to young cocoa plantings' -- that phrase "
            "does not appear in it and has been removed; re-verified against a fresh fetch "
            "of the same document on 2026-10-18.)"
        ),
    },
]

# Rice -- primary source: Govt of India's Directorate of Plant Protection,
# Quarantine & Storage (ppqs.gov.in) for Blast, cross-checked against a
# genuine Karnataka field study (UAS Bangalore/GKVK with AICRP-Rice ZARS
# Mandya, published in the Mysore Journal of Agricultural Sciences); TNAU
# Agritech Portal for Bacterial Leaf Blight, Brown Spot and Tungro
# (disclosed Tamil Nadu stand-ins, cross-checked against the same UAS
# Bangalore/ZARS Mandya research group's own Karnataka-specific surveys and
# an ICAR ecology paper on the tungro vector).
RICE_RISK_RULE_DEFS = [
    {
        # ppqs.gov.in's Rice Blast Advisory (22 July 2022, Directorate of
        # Plant Protection, Quarantine & Storage, Ministry of Agriculture &
        # Farmers Welfare) states blast "thrives in low temperatures
        # (22-28C), high humidity (above 95%), dew, leaf wetness for over
        # 10 hours, high nitrogen use, and aerobic soils," and that it "can
        # infect rice at every growth stage." Cross-checked against
        # Jayashree, Nagaraja, Prasanna Kumar & Chethana, "Influence of
        # weather parameters on rice blast severity," Mysore Journal of
        # Agricultural Sciences 56(2):152-160 (2022) -- UAS Bangalore/GKVK
        # Dept. of Plant Pathology with AICRP-Rice ZARS Mandya, a real field
        # study at ZARS V.C. Farm Mandya (kharif 2019-20) -- which cites
        # prior work that blast reproduction is greatest at "high humidity
        # (>90%) and comparatively low temperature (21-24C)" and
        # independently found maximum temperature (26.75-29.50C) and
        # evening relative humidity (60.10-80.50%) as its strongest severity
        # predictors (both negatively correlated with severity, i.e. milder/
        # cooler and more humid evenings raised severity) -- genuinely
        # corroborating the national advisory's numbers from Karnataka's own
        # Cauvery-command rice belt. The 10-hour leaf-wetness figure is a
        # within-day duration, not a multi-day count, so
        # consecutive_days_required is left at its default (1) rather than
        # being misconverted into a day count. applicable_stages is left
        # empty, matching ppqs's own explicit "every growth stage"
        # statement.
        "disease_name": "Blast",
        "stage_names": [],
        "humidity_min_percent": 95, "temp_min_celsius": 22, "temp_max_celsius": 28,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Cool, humid, dewy weather -- not hot, dry weather -- drives blast risk, per "
            "both the national PPQS advisory and a real Mandya (Karnataka) field study. "
            "Blast can strike at any growth stage, but leaf and especially neck infections "
            "are the most damaging. Keep fields clean, remove and burn infected debris after "
            "harvest, avoid excess nitrogen (especially late top-dressing), maintain "
            "recommended water levels, treat seed/seedlings with Pseudomonas fluorescens, "
            "and apply fungicide at first symptom onset."
        ),
        "source_citation": (
            "Directorate of Plant Protection, Quarantine & Storage, Govt of India, Rice "
            "Blast Advisory (22 July 2022, ppqs.gov.in/sites/default/files/"
            "rice_blast_advisory.pdf): blast 'thrives in low temperatures (22-28C), high "
            "humidity (above 95%), dew, leaf wetness for over 10 hours...' and 'can infect "
            "rice at every growth stage.' Cross-checked against Jayashree et al., \"Influence "
            "of weather parameters on rice blast severity\", Mysore Journal of Agricultural "
            "Sciences 56(2):152-160 (2022), UAS Bangalore/GKVK with AICRP-Rice ZARS Mandya "
            "(field study at ZARS V.C. Farm, Mandya, kharif 2019-20): cites prior work that "
            "blast reproduction is greatest at 'high humidity (>90%) and comparatively low "
            "temperature (21-24C)', and independently found max. temperature "
            "(26.75-29.50C) and evening RH (60.10-80.50%) as the strongest severity "
            "predictors."
        ),
    },
    {
        # TNAU Agritech Portal (agritech.tnau.ac.in/crop_protection/
        # rice_diseases/rice_23.html), Tamil Nadu Agricultural University,
        # lists bacterial leaf blight (Xanthomonas oryzae pv. oryzae)
        # favouring conditions as "temperature of 25-30C," heavy rain, heavy
        # dew, flooding/deep irrigation water, severe wind, clipped seedling
        # tips at transplanting, and excess/late nitrogen. This is a Tamil
        # Nadu (not Karnataka) source, used as a disclosed stand-in -- no
        # Karnataka-specific bulletin with numeric BLB thresholds was found
        # in this search -- but cross-checked against a genuine Karnataka
        # source: Bijoy, Chethana, Prasanna Kumar, Deepak & Benherlal,
        # "An Overview of Bacterial Diseases of Rice in Cauvery Command Area
        # of Karnataka" (fix round 1: re-verified this exact title live on
        # 2026-10-18 -- a prior version of this comment/citation gave the
        # wrong title, "Survey of bacterial diseases of rice"), Mysore
        # Journal of Agricultural Sciences 55(4):70-75 (2021), AICRP-Rice
        # ZARS Mandya,
        # which documents recurring BLB/bacterial leaf streak in the Cauvery
        # command area (Mysuru, Mandya, Chamarajanagar districts) and
        # attributes it to "weather conditions in the region... becoming "
        # "more congenial for disease development" -- confirming BLB is a
        # real, recurring issue in Karnataka's own rice belt even though
        # that paper gives no numeric figures of its own. No RH% or
        # rainfall-mm figure is given by either source, so none is
        # invented. applicable_stages left empty -- TNAU does not restrict
        # BLB to one growth stage.
        "disease_name": "Bacterial Leaf Blight",
        "stage_names": [],
        "humidity_min_percent": None, "temp_min_celsius": 25, "temp_max_celsius": 30,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Heavy rain, heavy dew, and standing/flooded water raise bacterial leaf blight "
            "risk, especially with excess or late nitrogen top-dressing -- matching the "
            "recurring BLB documented in Karnataka's own Cauvery-command rice belt. Avoid "
            "clipping seedling tips at transplanting, drain excess standing water, keep "
            "nitrogen balanced rather than front- or back-loaded, and spray a copper-based "
            "bactericide if symptoms appear."
        ),
        "source_citation": (
            "TNAU Agritech Portal (agritech.tnau.ac.in/crop_protection/rice_diseases/"
            "rice_23.html), Tamil Nadu Agricultural University: bacterial leaf blight "
            "favoured by 'temperature of 25-30 C', heavy rain, heavy dew, flooding/deep "
            "irrigation water, severe wind. A Tamil Nadu (not Karnataka) source, used as a "
            "disclosed stand-in. Cross-checked against Bijoy et al., \"An Overview of "
            "Bacterial Diseases of Rice in Cauvery Command Area of Karnataka\", Mysore "
            "Journal of Agricultural Sciences 55(4):70-75 (2021), AICRP-Rice ZARS Mandya: "
            "documents recurring BLB in Karnataka's Cauvery command "
            "area (Mysuru, Mandya, Chamarajanagar), attributed to the region's weather "
            "'becoming more congenial for disease development' (no numeric figure given)."
        ),
    },
    {
        # TNAU Agritech Portal expert-system page (agritech.tnau.ac.in/
        # expert_system/paddy/cpdisbrownspot.html), Tamil Nadu Agricultural
        # University, states brown spot (Cochliobolus miyabeanus) is
        # favoured by "25-30C" temperature, relative humidity "above 80
        # percent," and leaf wetness of "8-24 hours"; it also names
        # nutrient-deficient, unflooded, low-plant-available-silicon soil
        # and excess nitrogen as contributing factors. A Tamil Nadu (not
        # Karnataka) source, used as a disclosed stand-in -- no
        # Karnataka-specific numeric source for brown spot specifically was
        # found, though the same UAS Bangalore/ZARS Mandya rice-pathology
        # group cited above for Blast and BLB is, per its own publication
        # record, actively tracking rice disease-weather relationships in
        # Karnataka's own Cauvery-command belt. The 8-24 hour leaf-wetness
        # figure is a within-day duration, not a multi-day count, so
        # consecutive_days_required is left at its default (1) rather than
        # being misconverted into a day count. applicable_stages left
        # empty -- not stage-restricted per TNAU.
        "disease_name": "Brown Spot",
        "stage_names": [],
        "humidity_min_percent": 80, "temp_min_celsius": 25, "temp_max_celsius": 30,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.MODERATE,
        "advisory_text": (
            "Warm (25-30C), humid (above 80% RH) weather with 8+ hours of continuous leaf "
            "wetness favours brown spot, especially on nutrient-poor or unflooded soil. Keep "
            "soil fertility balanced (avoid excess nitrogen; don't let potash/silicon run "
            "short), keep fields properly flooded rather than left dry, treat seed with hot "
            "water before sowing, and spray propiconazole or azoxystrobin if infection "
            "appears."
        ),
        "source_citation": (
            "TNAU Agritech Portal expert system (agritech.tnau.ac.in/expert_system/paddy/"
            "cpdisbrownspot.html), Tamil Nadu Agricultural University: brown spot favoured "
            "by '25-30C' temperature, relative humidity 'above 80 percent', and leaf "
            "wetness of '8-24 hours'; common in nutrient-deficient, unflooded, low-silicon "
            "soils. A Tamil Nadu (not Karnataka) source, used as a disclosed stand-in -- no "
            "Karnataka-specific numeric source for brown spot was found."
        ),
    },
    {
        # TNAU Agritech Portal (agritech.tnau.ac.in/crop_protection/
        # rice_diseases/another methods_rice_23.html), Tamil Nadu
        # Agricultural University, states tungro spread depends on
        # synchronised virus source + vector + "host age and susceptibility,"
        # explicitly naming "the vegetative stage of the rice plant" as
        # "especially vulnerable," with the green leafhopper (Nephotettix
        # virescens) as the most efficient vector and spread aided by
        # irrigation water and rainstorms. Cross-checked against ICAR's
        # Indian Journal of Agricultural Sciences paper on green-leafhopper
        # ecology (epubs.icar.org.in/index.php/IJAgS/article/view/29839),
        # which found leafhopper numbers "positively linked" to relative
        # humidity and negatively linked to minimum temperature across
        # multiple seasons -- i.e. humid, cooler conditions build up the
        # vector population that carries tungro, even though that paper
        # studies the leafhopper directly rather than tungro incidence. No
        # exact %/mm figure for either weather or vector buildup is given by
        # either source, so none is invented. applicable_stages is
        # genuinely stage-specific here, backed directly by the TNAU quote:
        # Vegetative growth / Tillering.
        "disease_name": "Tungro",
        "stage_names": ["Vegetative growth / Tillering"],
        "humidity_min_percent": None, "temp_min_celsius": None, "temp_max_celsius": None,
        "rainfall_min_mm": None, "consecutive_days_required": 1,
        "risk_level": DiseaseRiskRule.RiskLevel.HIGH,
        "advisory_text": (
            "Tungro itself isn't directly weather-triggered -- it rides on the green "
            "leafhopper vector, whose population builds up in humid, cooler weather per "
            "ICAR's ecology study. The vegetative/tillering stage is the plant's most "
            "vulnerable window per TNAU, which is why this rule is linked to that stage "
            "rather than left open. Synchronize planting dates with neighbouring fields, "
            "observe at least a month's fallow after harvest to break the vector/virus "
            "cycle, use leafhopper-resistant varieties, and remove and destroy infected "
            "plants early; insecticide against the leafhopper vector only helps if applied "
            "while the crop is still in this vulnerable stage."
        ),
        "source_citation": (
            "TNAU Agritech Portal (agritech.tnau.ac.in/crop_protection/rice_diseases/"
            "another methods_rice_23.html), Tamil Nadu Agricultural University: tungro "
            "spread depends on synchronisation of virus source, vector and 'host age and "
            "susceptibility', naming 'the vegetative stage of the rice plant' as 'especially "
            "vulnerable'; vector is the green leafhopper Nephotettix virescens. Cross-"
            "checked against ICAR, \"Ecological factors favouring green leafhopper "
            "(Nephotettix virescens) population in rice\", Indian Journal of Agricultural "
            "Sciences (epubs.icar.org.in/index.php/IJAgS/article/view/29839): leafhopper "
            "numbers were 'positively linked' to relative humidity and negatively linked to "
            "minimum temperature. A Tamil Nadu (not Karnataka) source for the TNAU page, "
            "used as a disclosed stand-in; the ICAR paper is a national source."
        ),
    },
]

DISEASE_RISK_RULE_DEFS = {
    "Arecanut": AREACANUT_RISK_RULE_DEFS,
    "Black Pepper": BLACK_PEPPER_RISK_RULE_DEFS,
    "Cocoa": COCOA_RISK_RULE_DEFS,
    "Rice": RICE_RISK_RULE_DEFS,
}


# Task 16 -- CropTask seed content (irrigation/fertilizer/spraying/pruning/
# other guidance tied to a specific CropStage), researched per
# USP_FEATURES_DESIGN.md section 5 under the same standard as Task 10: every
# citation below names a document/page this implementer actually fetched
# live on 2026-10-18 and can quote, never written from training-data recall
# of "roughly what such a calendar probably says." Where a non-Karnataka
# source is used as a stand-in (TNAU for Rice and part of Black Pepper, KAU/
# celkau.in for Black Pepper), that is disclosed both in the comment and in
# the source_citation text itself, matching this file's existing convention
# for *_RISK_RULE_DEFS. Shared notation: "stage_name" is the single
# CROP_STAGE_DEFS name (for this crop) this task is linked to -- CropTask.stage
# is a required FK, so a task conceptually relevant to more than one stage is
# simply repeated as separate CropTask rows rather than left unlinked.

# Arecanut -- primary source: ICAR-CPCRI Kasaragod, "Calendar of Operations
# for Arecanut" (cpcri.gov.in/page/article/farmers_corner_crop_advice_
# arecanut), a month-by-month operations calendar, fetched live 2026-10-18.
# Cross-checked against CPCRI's "Arecanut Cultivation Practices"
# (cpcri.gov.in/filemgr/webfs/publication/arecanut_cultivation_practices
# (eng).pdf), also fetched live the same day. Both documents are the same
# family of source already used for this crop's AREACANUT_STAGE_DEFS month
# ranges above, so irrigation/fertilizer/spray timing lines up with those
# same months by construction.
AREACANUT_CROP_TASK_DEFS = [
    {
        "stage_name": "Vegetative growth",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "In January, hose-irrigate once every 4-7 days at 175 litres per application "
            "(or 20 litres/palm/day by drip). Through February's dry spell, irrigate "
            "established gardens once every six days (young gardens once every five days, "
            "or daily by drip at 20 litres/palm/day)."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- January: 'Hose irrigation may be given once in 4 to 7 days at the "
            "rate of 175 litres of water per application' (old garden) / '20 litres of water/"
            "palm/day may be applied through drip irrigation system'; February: 'Irrigate "
            "during the dry spell in west coast once in six days' (old garden) / 'Drip "
            "irrigation on daily basis @ 20 litres/palm/day' and hose irrigation 'once in "
            "five days' (young garden). Cross-checked against CPCRI's \"Arecanut Cultivation "
            "Practices\" (arecanut_cultivation_practices(eng).pdf), which separately gives "
            "'every 6 days during January-February' and states '175 litres of water should be "
            "applied per palm' at each irrigation."
        ),
    },
    {
        "stage_name": "Vegetative growth",
        "category": CropTask.Category.OTHER,
        "instruction": (
            "Protect the south-west-facing trunk from sun scorch by wrapping the exposed "
            "green stem, and mulch the base with organic material (dried forest leaves, "
            "areca husk, or farmyard manure) to conserve soil moisture through the dry "
            "season."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- February (old garden): 'South west side of arecanut garden may be "
            "protected from sun scorch by wrapping the green portions of the stem,' and "
            "'Application of organic mulches, green/dried forest leaves, areca husk etc to "
            "the base of the palm.' March (old garden) adds: 'Severe sun scorching and stem "
            "breaking may be noticed and control measures may be taken up'; March (young "
            "garden): 'Mulching with green leaves/coir compost/5 kg FYM will conserve the "
            "moisture in the young garden during summer.'"
        ),
    },
    {
        "stage_name": "Flowering",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "In irrigated gardens, apply the first fertilizer dose at the end of April -- "
            "fork the basin and apply, then irrigate afterward for efficient uptake."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- April (old garden): 'Forking and application of first dose of "
            "fertilizers at the end of April in the irrigated garden.'"
        ),
    },
    {
        "stage_name": "Flowering",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "Watch for and control mites, pentatomid bugs and scale insects as flowering "
            "gets underway in April."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- April: 'Control mites, pentatomid bugs and scale insects.' The "
            "source does not name a specific chemical or dose for this entry."
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "In rainfed gardens, apply the first fertilizer dose once the monsoon has given "
            "a few soaking showers, supplying 35g N, 15g P2O5 and 50g K2O per adult palm "
            "(irrigated gardens can bring this dose forward to February instead)."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- May (old garden): 'Application of first dose of fertilizers to "
            "supply 35g N, 15g P2O5 and 50g K2O per palm.' Cross-checked against \"Arecanut "
            "Cultivation Practices\" (arecanut_cultivation_practices(eng).pdf): 'Under "
            "irrigated conditions the April-May dose can be applied in February.'"
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "Spray 1% Bordeaux mixture as a prophylactic in May, repeat in June to protect "
            "the developing bunches, apply a second round 40-45 days after the first (around "
            "July), and add a third round in August if the monsoon runs long -- this is a "
            "fixed preventive spray schedule, not a response to visible disease."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- May: '1% Bordeaux mixture may be sprayed as a prophylactic measure "
            "to avoid Phytophthora related problems'; June: 'Prophylactic spraying with 1% "
            "Bordeaux mixture will provide adequate protection to the bunches'; July: 'Second "
            "round of spraying with 1% Bordeaux mixture may be taken up 40-45 days after the "
            "first spraying'; August: 'third round of spray with 1% Bordeaux mixture against "
            "the incidence of fruit rot disease' if the monsoon continues."
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.PRUNING,
        "instruction": (
            "Just before the south-west monsoon breaks, remove dried leaves and diseased "
            "palms from the garden to reduce inoculum going into the wet season."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- May (pre-monsoon): 'Before the onset of south-west monsoon, dried "
            "leaves and diseased palms should be removed.'"
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "Apply the second fertilizer dose in September-October, supplying 65g N, 25g "
            "P2O5 and 90g K2O per adult palm, plus 12kg organic manure (green-leaf compost or "
            "farmyard manure) per palm; on acid soils, apply 1kg lime per palm 15 days before "
            "the fertilizer (once every two years is enough for the lime)."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- September: 'the second round of fertilizers application may be "
            "taken up to supply 65g N, 25g of P2O5 and 90g K2O per adult palm'; 'Application "
            "of 12 kg organic manure as green leaf compost/farm yard manure is recommended "
            "per palm'; 'In acid soils, 15 days prior to application of fertilizers apply "
            "lime @ 1 kg per palm'; 'Lime can be applied once in two years.'"
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "As the monsoon recedes, resume irrigation once a week (175 litres per "
            "application), and start fertigation from December through the end of summer."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- November: 'Irrigation of areca gardens and nursery may be started "
            "on receding of monsoon showers'; December: 'commence irrigation once in a week "
            "at the rate of 175 liters of water per application' and 'Fertigation should be "
            "started from this month onwards up to completion of summer.'"
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.OTHER,
        "instruction": (
            "Complete tender-nut harvest by November and begin chali (dry-nut) harvest; for "
            "fully ripe nuts, harvest and dry through December. On very tall palms or hard "
            "ground, rope-harvest the seed nuts instead of climbing."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Arecanut\" "
            "(cpcri.gov.in/page/article/farmers_corner_crop_advice_arecanut), fetched live "
            "2026-10-18 -- November: 'Harvesting for tender nut may be completed and for dry "
            "nut (chali) may be started'; 'Rope harvest of seed nuts is recommended from the "
            "trees that are very tall and in places where the ground is hard'; December: "
            "'Harvesting and drying of ripe nuts.'"
        ),
    },
]

# Cocoa -- primary source: ICAR-CPCRI Kasaragod, "Calendar of Operations for
# Cocoa" (cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), a
# month-by-month operations calendar, fetched live 2026-10-18. Cross-checked
# against CPCRI's "Cocoa Cultivation Practices"
# (cpcri.gov.in/filemgr/webfs/publication/cocoa_cultivation_practices(eng).pdf)
# and CALENDAR_FOR_COCOA.pdf (cpcri.gov.in/filemgr/webfs/publication/
# CALENDAR_FOR_COCOA.pdf, the same document already cited for this crop's
# COCOA_STAGE_DEFS pollination/harvest-window research above), both also
# fetched live the same day.
COCOA_CROP_TASK_DEFS = [
    {
        "stage_name": "Vegetative growth",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "Apply the second (September-October) split of the annual fertilizer dose -- "
            "roughly half of 100g N, 40g P2O5 and 140g K2O per tree per year -- if it wasn't "
            "already applied in September."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- September (old garden): 'Forking and fertilizer application "
            "(second dose)'; October (young garden): 'Forking and fertilizer application "
            "(second dose if not applied during September).' Cross-checked against CPCRI's "
            "\"Cocoa Cultivation Practices\" (cocoa_cultivation_practices(eng).pdf) and "
            "CALENDAR_FOR_COCOA.pdf, both stating: 'An annual application of 100g N, 40g "
            "P2O5 and 140g K2O per tree in two equal splits is recommended,' with 'the first "
            "dose in April-May and the second dose in September-October' -- so the "
            "September-October split works out to roughly 50g N, 20g P2O5 and 70g K2O per "
            "tree (this implementer's own halving of the cited annual figure, not a number "
            "stated directly by either source)."
        ),
    },
    {
        "stage_name": "Vegetative growth",
        "category": CropTask.Category.PRUNING,
        "instruction": (
            "After the main harvest finishes, carry out structural pruning (shaping the "
            "permanent framework) and sanitary pruning (removing dead/diseased wood) on "
            "mature trees."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- September (old garden): 'Pruning in matured trees both structural "
            "and sanitary pruning after main harvest.' Cross-checked against "
            "CALENDAR_FOR_COCOA.pdf: 'Pruning is usually done annually in August-September' "
            "and 'Generally pruning is done after harvesting.'"
        ),
    },
    {
        "stage_name": "Flowering",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "In young gardens, irrigate once a week through November and December (flood or "
            "drip -- daily if using drip)."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- November (young garden): 'Irrigation once in a week'; December "
            "(young garden): 'Irrigation once a week, drip daily basis.'"
        ),
    },
    {
        "stage_name": "Flowering",
        "category": CropTask.Category.PRUNING,
        "instruction": (
            "Remove chupons (vigorous upright shoots from the main stem), along with dead "
            "wood and dried-up cherelles (small aborted pods), from mature trees in "
            "December."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- December (old garden): 'Removal of chupons, dead woods and dried "
            "cherelles.'"
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "In young gardens, keep up flood irrigation once every five days (175 litres per "
            "application) or daily drip irrigation at 20 litres/tree/day through "
            "January-March."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- January (young garden): 'Irrigation: Once in five days with 175 "
            "litres of water with flood irrigation' / '20 liters of water/day/tree with drip "
            "irrigation'; February and March (young garden): 'Flood irrigation may be given "
            "once in five days, drip- daily basis.'"
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "In irrigated gardens, apply the first (April-May) split of the annual "
            "fertilizer dose -- about 50g N, 20g P2O5 and 70g K2O per tree, half of the "
            "100:40:140 g/tree/year recommendation -- at the end of April, and irrigate well "
            "afterward so the nutrients are absorbed."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- April (old garden): 'Fertilizer application: First dose at the end "
            "of April in the irrigated garden'; 'Irrigate sufficiently after fertilizer "
            "application for efficient absorption.' Cross-checked against CPCRI's \"Cocoa "
            "Cultivation Practices\" (cocoa_cultivation_practices(eng).pdf): 'An annual "
            "application of 100g N, 40g P2O5 and 140g K2O per tree in two equal splits is "
            "recommended... the first dose in April-May.' The 50:20:70g half-split is this "
            "implementer's own halving of that annual figure, not a number stated directly "
            "by either source."
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "Spray 1% Bordeaux mixture as a prophylactic in May; through March, also watch "
            "for and treat canker, charcoal pod rot, mealy bugs and tea mosquito bugs."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Calendar of Operations for Cocoa\" "
            "(cpcri.gov.in/page/article/farmers-corner-crop-advice-cocoa), fetched live "
            "2026-10-18 -- May (old garden): '1% Bordeaux mixture may be sprayed as a "
            "prophylactic measure'; March (old garden): 'Take control measures for diseases "
            "like canker, charcoal pod rot and pests like mealy bugs and tea mosquito bugs.'"
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.OTHER,
        "instruction": (
            "Cocoa pods take roughly 150-170 days (about 5-5.5 months) from pollination to "
            "reach harvestable maturity, so track pod age rather than relying on calendar "
            "date alone when judging readiness."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, CALENDAR_FOR_COCOA.pdf "
            "(cpcri.gov.in/filemgr/webfs/publication/CALENDAR_FOR_COCOA.pdf), fetched live "
            "2026-10-18: 'Cocoa pods take 150-170 days from pollination to attain the harvest "
            "stage.'"
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "At the onset of the south-west monsoon, spray 1% Bordeaux mixture against black "
            "pod, and repeat at least twice more during the monsoon at monthly intervals; "
            "through July, also watch for pod rot, white thread blight and vascular streak "
            "dieback."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, \"Cocoa Cultivation Practices\" "
            "(cpcri.gov.in/filemgr/webfs/publication/cocoa_cultivation_practices(eng).pdf), "
            "fetched live 2026-10-18: black pod control is by 'spraying one per cent Bordeaux "
            "mixture at the onset of south-west monsoon rains,' repeated 'at least twice "
            "during the monsoon season at monthly intervals.' Cross-checked against CPCRI's "
            "\"Calendar of Operations for Cocoa\" (cpcri.gov.in/page/article/farmers-corner-"
            "crop-advice-cocoa), July (old garden): 'Take control measures for pod rot, white "
            "thread blight, vascular streak dieback etc.'"
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.PRUNING,
        "instruction": (
            "Carry out the main annual pruning in August-September, after harvest -- "
            "formation-pruning young seedlings/grafts, and a lighter structural prune on "
            "mature trees to let in sunlight and air."
        ),
        "source_citation": (
            "ICAR-CPCRI Kasaragod, CALENDAR_FOR_COCOA.pdf "
            "(cpcri.gov.in/filemgr/webfs/publication/CALENDAR_FOR_COCOA.pdf), fetched live "
            "2026-10-18: 'Pruning is usually done annually in August-September'; 'Generally "
            "pruning is done after harvesting.' Cross-checked against CPCRI's \"Calendar of "
            "Operations for Cocoa\" (cpcri.gov.in/page/article/farmers-corner-crop-advice-"
            "cocoa) -- August: 'Formation pruning in young seedlings and grafted plants' (new "
            "garden) and 'Slight pruning may be done to ensure sunlight and aeration in the "
            "garden' (old garden)."
        ),
    },
]

# Black Pepper -- primary source: Kerala Agricultural University's celkau.in
# extension portal, same disclosed-Kerala-stand-in convention already used
# for this crop's BLACK_PEPPER_RISK_RULE_DEFS above (a Karnataka
# university bulletin with this level of operational detail was searched
# for and not found). Pages fetched live 2026-10-18: Cultivation Practices
# (celkau.in/crops/Spices/Pepper/cultivation_practices.aspx), Manuring
# (celkau.in/crops/spices/pepper/manuring.php), Diseases in the Main Field
# (celkau.in/Crops/Spices/Pepper/diseases_mainfield.aspx -- the same page
# already cited for the Pollu DiseaseRiskRule above), and Harvesting
# (celkau.in/crops/spices/pepper/harvesting.php).
BLACK_PEPPER_CROP_TASK_DEFS = [
    {
        "stage_name": "Vegetative growth",
        "category": CropTask.Category.PRUNING,
        "instruction": (
            "Prune and train the support trees (standards) in March-April each year, "
            "removing excessive overgrowth to give proper shape and limiting their "
            "effective height to about 6m so the vine gets enough light."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Cultivation "
            "Practices page (celkau.in/crops/Spices/Pepper/cultivation_practices.aspx), "
            "fetched live 2026-10-18: 'Prune and train the standards in March-April every "
            "year to remove excessive overgrowth and to give them a proper shape'; 'The "
            "effective height of the standard is to be limited to about 6 m.' A Kerala (not "
            "Karnataka) source, used as a disclosed stand-in -- no Karnataka-specific "
            "bulletin with this level of operational detail was found."
        ),
    },
    {
        "stage_name": "Vegetative growth",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "Withhold irrigation after March until the monsoon breaks -- continuing to water "
            "through this dry window actually reduces yield, per KAU's own Panniyur-1 trial."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Cultivation "
            "Practices page (celkau.in/crops/Spices/Pepper/cultivation_practices.aspx), "
            "fetched live 2026-10-18: 'withholding irrigation thereafter till monsoon break, "
            "increases pepper yield by about 50%' (following irrigation from November/"
            "December through the end of March). A Kerala (not Karnataka) source, used as a "
            "disclosed stand-in."
        ),
    },
    {
        "stage_name": "Flowering",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "Apply the first split of the annual fertilizer dose in May-June, as soon as the "
            "first soaking monsoon showers arrive -- in a circle 30cm out from the base, for "
            "vines trained on live support trees."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Manuring page "
            "(celkau.in/crops/spices/pepper/manuring.php), fetched live 2026-10-18: 'The "
            "fertilizers may be applied in two split doses, the first in May-June with the "
            "receipt of a few soaking rains and the second in August-September'; 'Apply "
            "fertilizers in a circle of radius 30 cm around the vine.' Recommended annual "
            "dose (3 years+) is 50:50:150 g N:P2O5:K2O per vine generally, rising to 50:50:200 "
            "or 140:55:275 in some tracts -- this implementer uses the general 50:50:150 "
            "figure since the brief doesn't name a specific sub-region. A Kerala (not "
            "Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Flowering",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "Spray 1% Bordeaux mixture once before flowering starts, in late June to early "
            "July, as a preventive against Pollu disease (anthracnose)."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Diseases in the "
            "Main Field page (celkau.in/Crops/Spices/Pepper/diseases_mainfield.aspx), fetched "
            "live 2026-10-18: 'spray 1% Bordeaux mixture, once before flowering starts (late "
            "June and early July)...'. A Kerala (not Karnataka) source, used as a disclosed "
            "stand-in -- the same page already cited for this crop's Pollu DiseaseRiskRule."
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.FERTILIZER,
        "instruction": "Apply the second split of the annual fertilizer dose in August-September.",
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Manuring page "
            "(celkau.in/crops/spices/pepper/manuring.php), fetched live 2026-10-18: '...the "
            "second [split] in August-September.' A Kerala (not Karnataka) source, used as a "
            "disclosed stand-in."
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.PRUNING,
        "instruction": (
            "If the garden has become overly shaded, give the support trees a second, "
            "lighter pruning in July-August."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Cultivation "
            "Practices page (celkau.in/crops/Spices/Pepper/cultivation_practices.aspx), "
            "fetched live 2026-10-18: 'A second pruning of the standards may be done in "
            "July-August, if there is excessive shade in the garden.' A Kerala (not "
            "Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Fruit development",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "Give a second 1% Bordeaux mixture spray at the berry-formation stage, in late "
            "August, to continue protecting against Pollu disease."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Diseases in the "
            "Main Field page (celkau.in/Crops/Spices/Pepper/diseases_mainfield.aspx), fetched "
            "live 2026-10-18: '...and then at berry formation stage (late August).' A Kerala "
            "(not Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "From November/December through the end of March, irrigate at about 100 litres "
            "per application (a 10mm depth) every 8-10 days, applied to a basin 75cm out from "
            "the vine."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Cultivation "
            "Practices page (celkau.in/crops/Spices/Pepper/cultivation_practices.aspx), "
            "fetched live 2026-10-18: 'Irrigating pepper plants of Panniyur-1 variety at "
            "IW/CPE ratio of 0.25 from November/December till the end of March'; 'The depth "
            "of irrigation recommended is 10 mm (100 litres of water per irrigation' 'at an "
            "interval of about 8-10 days'; 'The water is to be applied in basins taken around "
            "the plants at a radius of 75 cm.' A Kerala (not Karnataka) source, used as a "
            "disclosed stand-in."
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.OTHER,
        "instruction": (
            "Harvest when berries are fully mature but still unripe (green), pile the "
            "harvested spikes to initiate browning, thresh to separate berries from the "
            "stalk, then sun-dry for 3-5 days -- raking regularly to avoid mould -- until "
            "moisture drops to 10-12%, before cleaning, grading and packing."
        ),
        "source_citation": (
            "Kerala Agricultural University, celkau.in extension portal, Harvesting page "
            "(celkau.in/crops/spices/pepper/harvesting.php), fetched live 2026-10-18: 'Black "
            "pepper of commerce is produced from whole, unripe but fully mature berries'; "
            "'The harvested berries are piled up in a heap to initiate browning'; 'Then "
            "berries are detached from the stalk by threshing'; 'During sundrying, berries "
            "are raked to ensure uniform drying and to avoid mould development'; 'Drying the "
            "berries for 3-5 days reduces the moisture content to 10-12 per cent'; 'The dried "
            "berries are cleaned, graded and packed.' A Kerala (not Karnataka) source, used "
            "as a disclosed stand-in."
        ),
    },
]

# Rice -- primary source: TNAU Agritech Portal's per-topic pages for
# transplanted, puddled lowland rice (irrigation management, nutrient
# management, weed management, harvesting), fetched live 2026-10-18. Same
# disclosed Tamil-Nadu-not-Karnataka stand-in already used for this crop's
# Bacterial Leaf Blight/Brown Spot/Tungro RICE_RISK_RULE_DEFS entries above
# (a Karnataka-specific source giving this level of day-after-sowing/
# transplanting operational detail was not found). "Planting" in this app's
# day-range CropStage model corresponds to transplanting for this crop (per
# RICE_STAGE_DEFS's own comment), so TNAU's DAT (days-after-transplanting)
# figures map directly onto it; TNAU's DAS (days-after-sowing) figures are
# used where DAT isn't given, flagged as an approximation since DAS counts
# from a slightly earlier point (pre-transplant nursery sowing).
RICE_CROP_TASK_DEFS = [
    {
        "stage_name": "Germination",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "At transplanting, keep a shallow 2cm of standing water in the field, and "
            "maintain that 2cm depth for the first week after transplanting."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Irrigation Management -- Transplanted Puddled Lowland "
            "Rice (agritech.tnau.ac.in/agriculture/agri_irrigationmgt_rice_"
            "transplantedpuddled.html), fetched live 2026-10-18: 'At the time of "
            "transplanting, a shallow depth of 2cm of water is adequate'; 'Maintain 2 cm of "
            "water up to seven days of transplanting.' A Tamil Nadu (not Karnataka) source, "
            "used as a disclosed stand-in, consistent with this file's existing Rice disease "
            "citations from the same portal."
        ),
    },
    {
        "stage_name": "Germination",
        "category": CropTask.Category.SPRAYING,
        "instruction": (
            "Apply a pre-emergence herbicide (e.g. Pretilachlor @ 750g/ha or Butachlor @ "
            "1kg a.i./ha) 3 days after transplanting, mixed with 50kg of dry sand and spread "
            "uniformly over a thin film of standing water; don't drain or re-irrigate for the "
            "following 2 days."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Weed Management -- Transplanted Puddled Lowland Rice "
            "(agritech.tnau.ac.in/agriculture/agri_cropproduction_cereals_rice_tranpudlow_"
            "mainfield_weed_mgmt.html), fetched live 2026-10-18: 'Pre emergence application "
            "of Pretilachlor @ 750 g/ha at 3 DAT'; 'Pre emergence application of Butachlor @ "
            "1.0 kg ai/ha on 3 DAT'; 'Any herbicide has to be mixed with 50kg of dry sand on "
            "the day of application (3-4 DAT) and applied uniformly to the field with thin "
            "film water on the 3rd DAT.' Day-count here is DAT (days after transplanting), "
            "which this app's Germination CropStage (5-10 days from planting) approximates "
            "-- flagged as an approximation since the source doesn't itself use this app's "
            "day-range framing. A Tamil Nadu (not Karnataka) source, used as a disclosed "
            "stand-in."
        ),
    },
    {
        "stage_name": "Vegetative growth / Tillering",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "Apply the tillering split of nitrogen and potash now -- TNAU's recommended "
            "split is four equal doses across basal, active tillering, panicle initiation and "
            "heading, with active tillering falling around 35-50 days after sowing depending "
            "on variety duration."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Nutrient Management (Inorganic) -- Transplanted Puddled "
            "Lowland Rice (agritech.tnau.ac.in/agriculture/agri_cropproduction_cereals_rice_"
            "tranpudlow_mainfield_nutrient_mgmt_inorganic.html), fetched live 2026-10-18: "
            "'Apply N and K in four equal splits viz., basal, tillering, panicle initiation "
            "and heading stages'; 'Tillering and Panicle initiation periods are crucial and "
            "should not be reduced with the recommended quantity.' Active tillering falls at "
            "35-40 DAS for a short-duration (105-day) crop per the same page's DAS table -- "
            "close to this app's Vegetative growth/Tillering CropStage (20-45 days). Blanket "
            "dose for short-duration, dry-season rice is 150-50-50 kg/ha N-P2O5-K2O (Cauvery "
            "delta/Coimbatore tract) or 120-40-40 elsewhere; the page itself advises testing "
            "soil first. A Tamil Nadu (not Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Vegetative growth / Tillering",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "Don't let the field dry out during tillering -- moisture stress now causes poor "
            "root growth. Once standing water disappears, re-irrigate after 1 day in summer / "
            "3 days in winter on loamy soil (clay soil can go a little longer), and keep "
            "cycling water this way through the rest of the crop."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Irrigation Management -- Transplanted Puddled Lowland "
            "Rice (agritech.tnau.ac.in/agriculture/agri_irrigationmgt_rice_"
            "transplantedpuddled.html), fetched live 2026-10-18: 'Moisture stress due to "
            "inadequate water at rooting and tillering stage causes poor root growth'; loamy "
            "soil 'gets irrigation after 1 day in summer and 3 days in winter'; 'This cyclic "
            "5cm submergence has to be continued throughout the crop period.' A Tamil Nadu "
            "(not Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Vegetative growth / Tillering",
        "category": CropTask.Category.OTHER,
        "instruction": (
            "If you used a pre-emergence herbicide, follow up with one round of hand weeding "
            "around 45 days after transplanting."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Weed Management -- Transplanted Puddled Lowland Rice "
            "(agritech.tnau.ac.in/agriculture/agri_cropproduction_cereals_rice_tranpudlow_"
            "mainfield_weed_mgmt.html), fetched live 2026-10-18: pre-emergence herbicide "
            "treatments are each 'followed by hand weeding on 45 DAT.' A Tamil Nadu (not "
            "Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Flowering / Panicle stage",
        "category": CropTask.Category.FERTILIZER,
        "instruction": (
            "Apply the panicle-initiation nitrogen/potash split now (around 45-50 days after "
            "sowing for a short-duration crop), and the heading split shortly after -- don't "
            "skip or shrink either, since TNAU flags both as the most yield-critical splits."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Nutrient Management (Inorganic) -- Transplanted Puddled "
            "Lowland Rice (agritech.tnau.ac.in/agriculture/agri_cropproduction_cereals_rice_"
            "tranpudlow_mainfield_nutrient_mgmt_inorganic.html), fetched live 2026-10-18: "
            "'Apply N and K in four equal splits viz., basal, tillering, panicle initiation "
            "and heading stages'; 'Tillering and Panicle initiation periods are crucial and "
            "should not be reduced with the recommended quantity.' Panicle initiation falls "
            "at 45-50 DAS and heading at 70-75 DAS for a short-duration (105-day) crop per "
            "the same page's table -- PI aligns with this app's Flowering/Panicle CropStage "
            "(45-65 days); heading runs slightly past its upper bound. A Tamil Nadu (not "
            "Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Flowering / Panicle stage",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "Panicle initiation, booting, heading and flowering are the most water-sensitive "
            "stages of the whole crop -- don't let the irrigation interval run longer than "
            "scheduled during this window, and avoid continuous flooding above 5cm, which "
            "encourages root decay."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Irrigation Management -- Transplanted Puddled Lowland "
            "Rice (agritech.tnau.ac.in/agriculture/agri_irrigationmgt_rice_"
            "transplantedpuddled.html), fetched live 2026-10-18: panicle initiation, booting, "
            "heading and flowering are named as critical stages where 'the irrigation "
            "interval should not exceed the stipulated time'; 'During booting and maturity "
            "stages continuous inundation of 5cm and above leads to advancement in root "
            "decay.' A Tamil Nadu (not Karnataka) source, used as a disclosed stand-in."
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.IRRIGATION,
        "instruction": (
            "Give the last irrigation about 15 days before the expected harvest date, then "
            "drain the field 7-10 days before harvest so it's dry enough to work."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Irrigation Management -- Transplanted Puddled Lowland "
            "Rice (agritech.tnau.ac.in/agriculture/agri_irrigationmgt_rice_"
            "transplantedpuddled.html), fetched live 2026-10-18: 'Last irrigation may be 15 "
            "days ahead of harvest.' Cross-checked against TNAU's Harvesting page "
            "(agritech.tnau.ac.in/agriculture/agri_cropproduction_cereals_rice_tranpudlow_"
            "harvesting.html): 'drain the water from the field 7 to 10 days before the "
            "expected harvest date.' A Tamil Nadu (not Karnataka) source, used as a disclosed "
            "stand-in."
        ),
    },
    {
        "stage_name": "Harvest",
        "category": CropTask.Category.OTHER,
        "instruction": (
            "Harvest once about 80% of panicles have turned straw-colored and most grains at "
            "the panicle base are in the hard dough stage (clear and firm when checked) -- "
            "don't go by leaf colour alone, since some varieties stay green even when the "
            "grain is ready. Thresh and winnow right after cutting, then dry the grain down "
            "to about 12% moisture for storage."
        ),
        "source_citation": (
            "TNAU Agritech Portal, Harvesting -- Transplanted Puddled Lowland Rice "
            "(agritech.tnau.ac.in/agriculture/agri_cropproduction_cereals_rice_tranpudlow_"
            "harvesting.html), fetched live 2026-10-18: 'When 80% of the panicles turn straw "
            "colour, the crop is ready for harvest'; 'Even at this stage, the leaves of some "
            "of the varieties may remain green'; 'If the rice is clear and firm, it is in "
            "hard dough stage'; 'At this stage harvest the crop, thresh and winnow the "
            "grains'; 'Dry the grains to 12% moisture level for storage.' A Tamil Nadu (not "
            "Karnataka) source, used as a disclosed stand-in."
        ),
    },
]

CROP_TASK_DEFS = {
    "Arecanut": AREACANUT_CROP_TASK_DEFS,
    "Black Pepper": BLACK_PEPPER_CROP_TASK_DEFS,
    "Cocoa": COCOA_CROP_TASK_DEFS,
    "Rice": RICE_CROP_TASK_DEFS,
}


class Command(BaseCommand):
    help = (
        "Seeds the database with real crop/disease data for the Dakshina Kannada-Udupi-Shivamogga "
        "belt's arecanut-based mixed-cropping system (Arecanut, Black Pepper, Cocoa, Rice), plus "
        "test accounts for development/demo purposes."
    )

    def handle(self, *args, **options):
        # Test accounts are seeded unconditionally (each individually
        # idempotent via its own existence check) so they always exist even
        # on a database that already has crop data. Previously this call was
        # placed after the crop-exists early return below, which meant any
        # account added to _seed_test_accounts() after the first-ever seed
        # run would silently never be created on an existing database -- the
        # exact bug that caused the admin_expert demo account to go missing.
        self._seed_test_accounts()

        if Crop.objects.exists():
            self._backfill_usp_content_for_existing_crops()
            self.stdout.write(self.style.WARNING("Crops already exist — skipping seed to avoid duplicates."))
            return

        data = [
            {
                "name": "Arecanut",
                "name_kn": "ಅಡಿಕೆ",
                "name_hi": "सुपारी",
                "soil_type": "Laterite, well-drained loamy soil",
                "soil_type_kn": "ಜಂಬಿಟ್ಟಿಗೆ, ಚೆನ್ನಾಗಿ ಬಸಿಯುವ ಗೋಡು ಮಣ್ಣು",
                "soil_type_hi": "लैटेराइट, अच्छी जल निकासी वाली दोमट मिट्टी",
                "climate": "Hot and humid, heavy monsoon (Malnad/coastal Karnataka), 14-36°C",
                "climate_kn": "ಬಿಸಿ ಮತ್ತು ಆರ್ದ್ರ ಹವಾಮಾನ, ಭಾರೀ ಮಳೆಗಾಲ (ಮಲೆನಾಡು/ಕರಾವಳಿ ಕರ್ನಾಟಕ), 14-36°C",
                "climate_hi": "गर्म और आर्द्र जलवायु, भारी मानसून (मलनाड/तटीय कर्नाटक), 14-36°C",
                "planting_method": "Seedlings raised from selected mother palms, transplanted at 2.7m spacing",
                "planting_method_kn": "ಆಯ್ದ ತಾಯಿ ಮರಗಳಿಂದ ಬೆಳೆಸಿದ ಸಸಿಗಳನ್ನು 2.7 ಮೀ ಅಂತರದಲ್ಲಿ ನಾಟಿ ಮಾಡಲಾಗುತ್ತದೆ",
                "planting_method_hi": "चयनित मातृ वृक्षों से उगाए गए पौधों को 2.7 मीटर की दूरी पर रोपा जाता है",
                "diseases": [
                    {
                        "name": "Yellow Leaf Disease (YLD)",
                        "symptoms": "Yellowing and drying of leaves starting from older fronds, stunted growth, reduced nut size",
                        "description": "Caused by a phytoplasma spread by insect vectors; one of the most economically damaging arecanut diseases in Karnataka",
                        "prevention": "Use disease-free planting material, maintain balanced nutrition, remove and destroy severely affected palms to limit spread",
                        "treatment": "No complete cure exists; biocontrol agents and eco-friendly fungicides help manage progression and reduce vector spread",
                    },
                    {
                        "name": "Mahali / Koleroga (Bud Rot)",
                        "symptoms": "Yellowing and drooping of the central spindle leaf, foul smell from the rotting bud, can kill the palm within weeks if untreated",
                        "description": "Caused by the fungus Phytophthora meadii; spreads rapidly during the monsoon in poorly drained gardens",
                        "prevention": "Ensure good drainage, avoid water stagnation at the base, remove and burn affected tissue",
                        "treatment": "Apply 1% Bordeaux mixture to the crown before monsoon onset; remove and destroy rotted spindle tissue immediately",
                    },
                    {
                        "name": "Foot Rot (Anabe Roga)",
                        "symptoms": "Wilting and yellowing of leaves, visible rot at the base of the palm, eventual death of the palm",
                        "description": "A fungal disease affecting the root and collar region, worsened by poor drainage and mechanical injury",
                        "prevention": "Maintain proper field drainage and sanitation, avoid injuring roots during intercultivation",
                        "treatment": "Drench soil around the base with a recommended fungicide; remove severely affected palms to prevent spread",
                    },
                ],
                "lifecycle": [
                    ("Nursery / Seedling", "1-2 years"),
                    ("Vegetative growth", "3-5 years"),
                    ("First flowering & bearing", "5-7 years from planting"),
                    ("Full bearing", "8+ years, productive for 40-60 years"),
                ],
            },
            {
                "name": "Black Pepper",
                "name_kn": "ಕರಿಮೆಣಸು",
                "name_hi": "काली मिर्च",
                "soil_type": "Well-drained laterite or red loamy soil, rich in organic matter",
                "soil_type_kn": "ಚೆನ್ನಾಗಿ ಬಸಿಯುವ ಜಂಬಿಟ್ಟಿಗೆ ಅಥವಾ ಕೆಂಪು ಗೋಡು ಮಣ್ಣು, ಸಾವಯವ ಪದಾರ್ಥ ಸಮೃದ್ಧ",
                "soil_type_hi": "अच्छी जल निकासी वाली लैटेराइट या लाल दोमट मिट्टी, जैविक पदार्थ से भरपूर",
                "climate": "Warm, humid tropical climate, 10-40°C — traditionally grown as a shade-loving vine",
                "climate_kn": "ಬೆಚ್ಚಗಿನ, ಆರ್ದ್ರ ಉಷ್ಣವಲಯದ ಹವಾಮಾನ, 10-40°C — ಸಾಂಪ್ರದಾಯಿಕವಾಗಿ ನೆರಳು ಇಷ್ಟಪಡುವ ಬಳ್ಳಿಯಾಗಿ ಬೆಳೆಯಲಾಗುತ್ತದೆ",
                "climate_hi": "गर्म, आर्द्र उष्णकटिबंधीय जलवायु, 10-40°C — पारंपरिक रूप से छाया-प्रिय बेल के रूप में उगाई जाती है",
                "planting_method": "Rooted cuttings planted at the base of live support trees, most commonly Arecanut palms",
                "planting_method_kn": "ಬೇರೂರಿದ ಕತ್ತರಿಸಿದ ಗಿಡಗಳನ್ನು ಜೀವಂತ ಆಧಾರ ಮರಗಳ ಬುಡದಲ್ಲಿ ನೆಡಲಾಗುತ್ತದೆ, ಸಾಮಾನ್ಯವಾಗಿ ಅಡಿಕೆ ಮರಗಳು",
                "planting_method_hi": "जड़दार कलमों को जीवित सहारा देने वाले पेड़ों के आधार पर लगाया जाता है, सामान्यतः सुपारी के पेड़",
                "diseases": [
                    {
                        "name": "Phytophthora Foot Rot (Quick Wilt)",
                        "symptoms": "Sudden wilting and yellowing of leaves and shoots, blackening of nodes near the ground, the whole vine can collapse within days in severe cases",
                        "description": "Caused by Phytophthora capsici; the single most destructive disease of black pepper, spreads fast in waterlogged conditions during monsoon",
                        "prevention": "Improve drainage around the vine base, avoid water stagnation, use certified disease-free planting material",
                        "treatment": "Drench the base with Bordeaux mixture or copper oxychloride at monsoon onset; remove and destroy severely affected vines",
                    },
                    {
                        "name": "Slow Decline (Slow Wilt)",
                        "symptoms": "Gradual yellowing, defoliation, and dieback of the vine over months to years, with steadily reducing yield before eventual death",
                        "description": "A disease complex involving the burrowing nematode Radopholus similis together with fungal pathogens",
                        "prevention": "Use nematode-free planting material, maintain soil health with organic matter to support vine resilience",
                        "treatment": "Soil application of nematicides combined with organic amendments; improve drainage to reduce fungal pressure",
                    },
                    {
                        "name": "Pollu Disease (Anthracnose)",
                        "symptoms": "Brown sunken patches on berries that progress to cross-splitting, blackening, and drying; brownish leaf lesions with a yellow halo",
                        "description": "Caused by the fungus Colletotrichum gloeosporioides, spread by wind and rain splash during spike emergence; worsened by high humidity and rain",
                        "prevention": "Regulate shade to around 40%, ensure adequate summer irrigation (4-5 times every 5-7 days), remove and destroy fallen leaves and spikes",
                        "treatment": "Spray 1% Bordeaux mixture or carbendazim + mancozeb (0.1%) during pre-monsoon and post-monsoon periods",
                    },
                ],
                "lifecycle": [
                    ("Rooting / establishment", "0-6 months"),
                    ("Vegetative climbing growth", "1-3 years"),
                    ("First flowering & fruiting", "3-4 years from planting"),
                    ("Full bearing", "4+ years, productive for 30+ years"),
                ],
            },
            {
                "name": "Cocoa",
                "name_kn": "ಕೋಕೋ",
                "name_hi": "कोको",
                "soil_type": "Deep, well-drained loamy soil rich in organic matter",
                "soil_type_kn": "ಆಳವಾದ, ಚೆನ್ನಾಗಿ ಬಸಿಯುವ, ಸಾವಯವ ಪದಾರ್ಥ ಸಮೃದ್ಧ ಗೋಡು ಮಣ್ಣು",
                "soil_type_hi": "गहरी, अच्छी जल निकासी वाली, जैविक पदार्थ से भरपूर दोमट मिट्टी",
                "climate": "Warm, humid climate, 21-32°C — requires shade, commonly grown beneath Arecanut canopy",
                "climate_kn": "ಬೆಚ್ಚಗಿನ, ಆರ್ದ್ರ ಹವಾಮಾನ, 21-32°C — ನೆರಳು ಅಗತ್ಯ, ಸಾಮಾನ್ಯವಾಗಿ ಅಡಿಕೆ ಮೇಲ್ಛಾವಣಿಯ ಕೆಳಗೆ ಬೆಳೆಯಲಾಗುತ್ತದೆ",
                "climate_hi": "गर्म, आर्द्र जलवायु, 21-32°C — छाया आवश्यक, आमतौर पर सुपारी की छतरी के नीचे उगाई जाती है",
                "planting_method": "Grafted or seedling saplings planted as an understorey crop within established Arecanut gardens",
                "planting_method_kn": "ಕಸಿ ಮಾಡಿದ ಅಥವಾ ಸಸಿ ಗಿಡಗಳನ್ನು ಸ್ಥಾಪಿತ ಅಡಿಕೆ ತೋಟಗಳಲ್ಲಿ ಉಪ ಬೆಳೆಯಾಗಿ ನೆಡಲಾಗುತ್ತದೆ",
                "planting_method_hi": "कलम या पौध रोपों को स्थापित सुपारी बागानों में निचली फसल के रूप में लगाया जाता है",
                "diseases": [
                    {
                        "name": "Black Pod Disease",
                        "symptoms": "Dark brown to black lesions on pods that spread rapidly, pods rot and become unusable; can also affect leaves and stems",
                        "description": "Caused by Phytophthora palmivora; confirmed in Indian cocoa-growing regions and one of the most damaging cocoa diseases worldwide",
                        "prevention": "Remove and destroy infected pods promptly, prune to improve air circulation, avoid excess shade",
                        "treatment": "Spray copper-based fungicides (e.g. copper oxychloride) at regular intervals through the wet season",
                    },
                    {
                        "name": "Vascular Streak Dieback (VSD)",
                        "symptoms": "Yellowing of leaves with characteristic green islands, dieback of branches starting from the tip, dark streaks visible in the wood when cut open",
                        "description": "A fungal disease that spreads through wind-dispersed spores, particularly damaging to young cocoa plantings",
                        "prevention": "Prune and destroy affected branches well below visible streaking, avoid excess humidity and overly dense shade",
                        "treatment": "Sanitation pruning is the primary control; no fully effective chemical treatment exists — use tolerant planting material where possible",
                    },
                ],
                "lifecycle": [
                    ("Nursery", "3-6 months"),
                    ("Vegetative growth", "1-3 years"),
                    ("First flowering & pod set", "3-4 years from planting"),
                    ("Full bearing", "5+ years, productive for 25-30 years"),
                ],
            },
            {
                "name": "Rice",
                "name_kn": "ಭತ್ತ",
                "name_hi": "चावल",
                "soil_type": "Clayey soil with good water retention",
                "soil_type_kn": "ಉತ್ತಮ ನೀರು ಹಿಡಿದಿಟ್ಟುಕೊಳ್ಳುವ ಜೇಡಿ ಮಣ್ಣು",
                "soil_type_hi": "अच्छी जल धारण क्षमता वाली चिकनी मिट्टी",
                "climate": "Hot and humid, 20-35°C",
                "climate_kn": "ಬಿಸಿ ಮತ್ತು ಆರ್ದ್ರ, 20-35°C",
                "climate_hi": "गर्म और आर्द्र, 20-35°C",
                "planting_method": "Transplanting seedlings into flooded paddy fields in the valley areas between plantation gardens",
                "planting_method_kn": "ತೋಟಗಳ ನಡುವಿನ ಕಣಿವೆ ಪ್ರದೇಶಗಳಲ್ಲಿನ ಜಲಾವೃತ ಗದ್ದೆಗಳಲ್ಲಿ ಸಸಿಗಳನ್ನು ನಾಟಿ ಮಾಡಲಾಗುತ್ತದೆ",
                "planting_method_hi": "बागानों के बीच घाटी क्षेत्रों में जलमग्न धान के खेतों में पौधों की रोपाई की जाती है",
                "diseases": [
                    {
                        "name": "Blast",
                        "symptoms": "Diamond-shaped lesions with gray centers on leaves",
                        "description": "Caused by the fungus Magnaporthe oryzae, one of the most destructive rice diseases",
                        "prevention": "Use resistant varieties, avoid excess nitrogen, maintain proper water levels",
                        "treatment": "Fungicide application at early symptom onset",
                    },
                    {
                        "name": "Bacterial Leaf Blight",
                        "symptoms": "Water-soaked stripes on leaf margins that turn yellow to white, wilting of seedlings in severe cases",
                        "description": "Caused by the bacterium Xanthomonas oryzae, spreads rapidly in warm, humid, wet-season conditions",
                        "prevention": "Use resistant varieties, avoid excess nitrogen, maintain field sanitation",
                        "treatment": "Copper-based bactericide spray; drain excess standing water from the field",
                    },
                    {
                        "name": "Brown Spot",
                        "symptoms": "Circular to oval brown spots with a yellow halo and gray centers on leaves and grains; affected leaves wilt and grain filling is disrupted",
                        "description": "Caused by the fungus Cochliobolus miyabeanus (Bipolaris oryzae); seed-borne, spreads via airborne spores especially under high humidity and prolonged leaf wetness",
                        "prevention": "Use resistant varieties, treat seeds with hot water before sowing, maintain balanced soil nutrition, keep fields weed-free",
                        "treatment": "Fungicide sprays such as propiconazole or azoxystrobin; remove and burn severely infected plants",
                    },
                    {
                        "name": "Tungro",
                        "symptoms": "Yellow-to-orange, mottled, stunted leaves; irregular patches of stunted plants scattered across the field",
                        "description": "Caused by two viruses (RTBV and RTSV) transmitted exclusively by the green leafhopper — not spread through soil, water, or seed",
                        "prevention": "Plant leafhopper-resistant varieties, synchronize planting within the community to limit vector buildup, destroy crop stubble and observe a fallow period after harvest",
                        "treatment": "No direct cure — control the green leafhopper vector with selective insecticide use only when needed; remove and destroy infected plants early",
                    },
                ],
                "lifecycle": [
                    ("Germination", "5-10 days"),
                    ("Vegetative growth / Tillering", "20-45 days"),
                    ("Flowering / Panicle stage", "45-65 days"),
                    ("Harvest", "100-140 days from planting"),
                ],
            },
        ]

        crops_by_name = {}
        for crop_data in data:
            crop = Crop.objects.create(
                name=crop_data["name"], soil_type=crop_data["soil_type"],
                climate=crop_data["climate"], planting_method=crop_data["planting_method"],
                name_kn=crop_data.get("name_kn", ""), name_hi=crop_data.get("name_hi", ""),
                soil_type_kn=crop_data.get("soil_type_kn", ""), soil_type_hi=crop_data.get("soil_type_hi", ""),
                climate_kn=crop_data.get("climate_kn", ""), climate_hi=crop_data.get("climate_hi", ""),
                planting_method_kn=crop_data.get("planting_method_kn", ""),
                planting_method_hi=crop_data.get("planting_method_hi", ""),
            )
            crops_by_name[crop_data["name"]] = crop
            for d in crop_data["diseases"]:
                disease = Disease.objects.create(
                    crop=crop, name=d["name"], symptoms=d["symptoms"],
                    description=d["description"], prevention=d["prevention"]
                )
                Recommendation.objects.create(
                    disease=disease, treatment_info=d["treatment"], preventive_measures=d["prevention"]
                )
            for order, (stage, duration) in enumerate(crop_data["lifecycle"], start=1):
                Lifecycle.objects.create(crop=crop, stage=stage, duration_description=duration, order=order)

            stage_defs = CROP_STAGE_DEFS.get(crop_data["name"])
            if stage_defs:
                self._seed_crop_stages(crop, stage_defs)

            # A light, generic fertilizer/irrigation guidance placeholder per crop —
            # perennial plantation crops (Arecanut, Pepper, Cocoa) don't follow the
            # same simple seedling->flowering schedule as an annual crop like Rice,
            # so these are intentionally general; a full nutrient calendar per crop
            # is a reasonable Phase 21 (UI Polish / content depth) follow-up.
            FertilizerSchedule.objects.create(
                crop=crop, growth_stage="Establishment", fertilizer_guidance="Balanced starter feed with organic base",
                irrigation_guidance="Regular light watering, avoid waterlogging", order=1
            )
            FertilizerSchedule.objects.create(
                crop=crop, growth_stage="Bearing / Productive stage", fertilizer_guidance="Balanced NPK feed per crop-specific recommendation",
                irrigation_guidance="Consistent watering through dry spells, ensured drainage during monsoon", order=2
            )

        # Task 10 -- real, cited DiseaseRiskRule content for every disease
        # seeded above (see the *_RISK_RULE_DEFS constants for the full
        # research/citation record). Called once here, after every crop's
        # diseases and CropStage rows already exist from the loop above.
        self._seed_risk_rules(crops_by_name)

        # Task 16 -- real, cited CropTask content (irrigation/fertilizer/
        # spraying/pruning/other guidance) for every CropStage seeded above
        # (see the *_CROP_TASK_DEFS constants for the full research/citation
        # record). Called once here, after every crop's CropStage rows
        # already exist from the loop above.
        self._seed_crop_tasks(crops_by_name)

        # Real, regionally-authentic intercropping relationships — this is the
        # actual mixed-cropping system of the Dakshina Kannada-Udupi-Shivamogga
        # belt: Black Pepper is trellised up Arecanut palms, Cocoa is grown in
        # the shade beneath both. Rice is grown separately in valley paddies,
        # so it is deliberately NOT linked here.
        arecanut = crops_by_name["Arecanut"]
        pepper = crops_by_name["Black Pepper"]
        cocoa = crops_by_name["Cocoa"]
        arecanut.intercropped_with.add(pepper, cocoa)
        pepper.intercropped_with.add(cocoa)

        # Organic manure methods — Vermicompost is a generally applicable
        # method; Arecanut husk compost is specific and authentic to this
        # region, where husk/leaf-sheath waste from arecanut processing is a
        # real, commonly used local input.
        vermicompost = OrganicManureMethod.objects.create(
            name="Vermicompost", materials="Kitchen waste, cow dung, earthworms",
            steps="Layer organic waste, introduce earthworms, maintain moisture, wait 60 days"
        )
        vermicompost.crops.set(Crop.objects.all())

        husk_compost = OrganicManureMethod.objects.create(
            name="Arecanut Husk Compost",
            materials="Arecanut husk and leaf sheath waste, cow dung slurry, water",
            steps=(
                "Shred husk and leaf sheath waste, stack in alternating layers with cow dung slurry, "
                "keep moist and turn every 3-4 weeks, ready to use after 4-6 months"
            ),
        )
        husk_compost.crops.set([arecanut, pepper, cocoa])

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {Crop.objects.count()} crops, {Disease.objects.count()} diseases, "
            f"{Recommendation.objects.count()} recommendations, "
            f"{OrganicManureMethod.objects.count()} organic manure methods."
        ))

    def _seed_crop_stages(self, crop, stage_defs):
        """
        Creates the farmer-trackable CropStage rows for one crop from its
        stage_defs list (see the *_STAGE_DEFS constants above for the
        researched source/reasoning behind each crop's month ranges).
        """
        for name, day_start, day_end, month_start, month_end, order in stage_defs:
            CropStage.objects.create(
                crop=crop, name=name,
                day_range_start=day_start, day_range_end=day_end,
                typical_month_start=month_start, typical_month_end=month_end,
                order=order,
            )

    def _seed_risk_rules(self, crops_by_name):
        """
        Creates the researched DiseaseRiskRule rows for every disease
        seeded above, from the *_RISK_RULE_DEFS constants (see those for
        the full research/citation record behind each threshold, advisory
        and applicable_stages choice).
        """
        for crop_name, rule_defs in DISEASE_RISK_RULE_DEFS.items():
            crop = crops_by_name[crop_name]
            for rule_def in rule_defs:
                disease = Disease.objects.get(crop=crop, name=rule_def["disease_name"])
                rule = DiseaseRiskRule.objects.create(
                    disease=disease,
                    humidity_min_percent=rule_def["humidity_min_percent"],
                    temp_min_celsius=rule_def["temp_min_celsius"],
                    temp_max_celsius=rule_def["temp_max_celsius"],
                    rainfall_min_mm=rule_def["rainfall_min_mm"],
                    consecutive_days_required=rule_def["consecutive_days_required"],
                    risk_level=rule_def["risk_level"],
                    advisory_text=rule_def["advisory_text"],
                    source_citation=rule_def["source_citation"],
                )
                if rule_def["stage_names"]:
                    stages = CropStage.objects.filter(crop=crop, name__in=rule_def["stage_names"])
                    rule.applicable_stages.set(stages)

    def _seed_crop_tasks(self, crops_by_name):
        """
        Creates the researched CropTask rows for every CropStage seeded
        above, from the *_CROP_TASK_DEFS constants (see those for the full
        research/citation record behind each task's category, instruction
        and stage link). CropTask.stage is a required FK, so each def names
        exactly one stage_name to attach to.
        """
        for crop_name, task_defs in CROP_TASK_DEFS.items():
            crop = crops_by_name[crop_name]
            for task_def in task_defs:
                stage = CropStage.objects.get(crop=crop, name=task_def["stage_name"])
                CropTask.objects.create(
                    crop=crop,
                    stage=stage,
                    category=task_def["category"],
                    instruction=task_def["instruction"],
                    source_citation=task_def["source_citation"],
                )

    def _backfill_usp_content_for_existing_crops(self):
        """
        On a database that already had Crop rows before the USP feature
        (CropStage/DiseaseRiskRule/CropTask) existed, the early return just
        above this call means the first-time-only `data` loop in handle()
        -- the only place that ever created those three tables' content --
        never runs again. That silently leaves the USP feature's tracker,
        risk-alert, and task-reminder UI permanently empty on any such
        database: the exact bug class _seed_test_accounts() was already
        pulled out of the early return to avoid, just not yet applied to
        this content too. Found via a real user's existing database, not
        by any test -- every test runs seed_demo_data() against a brand
        new, empty test database, so this gap was invisible to the whole
        suite (see SeedDemoDataBackfillTests for the regression test).

        Each content type gets its own existence check, so this is safe
        to call on every run of this command, matching every other
        _seed_* method's idempotency -- it's a genuine no-op once the
        content is present, whether this was the run that created it or
        the first-time `data` loop did.
        """
        crops_by_name = {crop.name: crop for crop in Crop.objects.all()}

        if not CropStage.objects.exists():
            for crop_name, stage_defs in CROP_STAGE_DEFS.items():
                crop = crops_by_name.get(crop_name)
                if crop:
                    self._seed_crop_stages(crop, stage_defs)

        if not DiseaseRiskRule.objects.exists():
            self._seed_risk_rules(crops_by_name)

        if not CropTask.objects.exists():
            self._seed_crop_tasks(crops_by_name)

    def _seed_test_accounts(self):
        """
        Ensures the 3 demo accounts exist, independent of crop-seeding state.
        Each check is individually idempotent, so this is always safe to
        call on every run of this command -- including on a database that
        already has crops and would otherwise skip the rest of handle().
        """
        created = []

        if not User.objects.filter(username="farmer_ravi").exists():
            User.objects.create_user(
                username="farmer_ravi", password="FarmerPass#123",
                role="farmer", preferred_language="kn", email="ravi@test.com",
                is_verified=True,  # pre-verified so demo login works immediately
            )
            created.append("farmer_ravi")
        if not User.objects.filter(username="farmer_asha").exists():
            User.objects.create_user(
                username="farmer_asha", password="FarmerPass#123",
                role="farmer", preferred_language="hi", email="asha@test.com",
                is_verified=True,
            )
            created.append("farmer_asha")
        if not User.objects.filter(username="admin_expert").exists():
            # Phase 17 -- an admin/expert demo account so advisory answering
            # can actually be tested/demoed without needing a superuser login.
            User.objects.create_user(
                username="admin_expert", password="AdminPass#123",
                role="admin", preferred_language="en", email="expert@test.com",
                is_verified=True,
            )
            created.append("admin_expert")

        if created:
            self.stdout.write(self.style.SUCCESS(
                f"Seeded test accounts: {', '.join(created)}."
            ))
        else:
            self.stdout.write("Test accounts already present -- nothing to seed.")
