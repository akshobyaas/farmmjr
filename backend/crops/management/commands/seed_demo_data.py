from django.core.management.base import BaseCommand
from crops.models import Crop, Disease, Recommendation, FertilizerSchedule, Lifecycle, OrganicManureMethod
from accounts.models import User


class Command(BaseCommand):
    help = (
        "Seeds the database with real crop/disease data for the Dakshina Kannada-Udupi-Shivamogga "
        "belt's arecanut-based mixed-cropping system (Arecanut, Black Pepper, Cocoa, Rice), plus "
        "test accounts for development/demo purposes."
    )

    def handle(self, *args, **options):
        if Crop.objects.exists():
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

        if not User.objects.filter(username="farmer_ravi").exists():
            User.objects.create_user(
                username="farmer_ravi", password="FarmerPass#123",
                role="farmer", preferred_language="kn", email="ravi@test.com",
                is_verified=True,  # pre-verified so demo login works immediately
            )
        if not User.objects.filter(username="farmer_asha").exists():
            User.objects.create_user(
                username="farmer_asha", password="FarmerPass#123",
                role="farmer", preferred_language="hi", email="asha@test.com",
                is_verified=True,
            )
        if not User.objects.filter(username="admin_expert").exists():
            # Phase 17 -- an admin/expert demo account so advisory answering
            # can actually be tested/demoed without needing a superuser login.
            User.objects.create_user(
                username="admin_expert", password="AdminPass#123",
                role="admin", preferred_language="en", email="expert@test.com",
                is_verified=True,
            )

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {Crop.objects.count()} crops, {Disease.objects.count()} diseases, "
            f"{Recommendation.objects.count()} recommendations, "
            f"{OrganicManureMethod.objects.count()} organic manure methods, "
            f"2 test farmer accounts, 1 test admin/expert account."
        ))
