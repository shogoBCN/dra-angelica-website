#!/usr/bin/env python3
"""
Generate slideshow scene stills via Gemini image API.

Legacy entry point for the **8-scene video slideshow** (Aug-26 campaign).
Scene-specific prompts and copy rules live in ``SCENE_PROMPTS`` and
``SCENE_TEXT_EXACT`` below — not yet migrated to YAML. New static Google Ads
work should use ``gemini_batch.py`` + a campaign YAML under ``configs/`` (e.g.
``configs/08-aug-26-google-ads-aspects.yaml``).

Outputs
-------
Writes ``scene_<N>.png`` under ``ads/GoogleAds/08-aug-26/video/{1x1,9x16,16x9}/`` by default.

Usage
-----
::

    cd scripts/ads-maker-scripts
    python generate_scene.py 7 --aspects 1:1 9:16 16:9 --pro

API client is ``lib.gemini.generate_image``; reference images come from
``ads/GoogleAds/08-aug-26/video/initials/`` (storyboard panels + patient identity).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lib.paths import (
    ASPECT_FOLDER,
    BRAND_LOGO,
    DEFAULT_CAMPAIGN,
    INITIALS_DIR,
    REPO_ROOT,
)
from lib.gemini import (
    format_usage,
    generate_image,
    image_size_for,
    load_env,
    model_cost_usd,
    resolve_model,
)

ROOT = REPO_ROOT
VIDEO = DEFAULT_CAMPAIGN
INITIALS = INITIALS_DIR

ASPECT_FOLDERS = ASPECT_FOLDER

# ---------------------------------------------------------------------------
# SCENE_TEXT_EXACT — copy + placement rules injected into every prompt via
# {text_exact}. Scenes without narrative text (3, 6) omit an entry; their
# prompts rely on visual-only instructions in SCENE_PROMPTS.
#
# Brand colors: navy #1e3a5f, teal accent #4aada8, teal underline under
# accent word only. Text floats ON the photo — never a header strip or split
# layout (common Gemini failure mode).
# ---------------------------------------------------------------------------
SCENE_TEXT_EXACT = {
    1: """TEXT EXACT COPY — the ONLY text allowed anywhere in the output image:
Line 1 (navy #1e3a5f serif): ¿Tres especialistas,
Line 2 (navy): tres tratamientos…
Line 3 (navy "y " + teal #4aada8 "tú" + navy " en el medio?"):
Short teal underline under "tú" only.

TEXT PLACEMENT: upper-left on kitchen wall/cabinets inside the photo, left-aligned, 6% from left, 5% from top. Cap height ≈ 4.5% per line. Must NOT cover patient's face. No box, no banner, no solid background behind text.

REFERENCE IMAGE RULE: Attached images are for faces, poses, and room layout ONLY. IGNORE and DO NOT copy any text visible in reference images.

FORBIDDEN: text header strip, gray/white banner bar, split screen (text block on top + photo below), text boxes, scene numbers.""",
    2: """TEXT EXACT COPY — the ONLY text allowed anywhere in the output image:
Line 1 (navy #1e3a5f serif): Solo ve
Line 2 (navy "tu " + teal #4aada8 "corazón."):
Short teal underline under "corazón." only.

TEXT PLACEMENT: upper-left wall, left-aligned, 6% from left, 5% from top. Cap height ≈ 5.5% per line. Text block top 18–22% of frame. Must NOT cover faces.

REFERENCE IMAGE RULE: Attached images are for faces, poses, and room layout ONLY. IGNORE and DO NOT copy any text visible in reference images.

FORBIDDEN: duplicate text blocks, white sidebar, scene numbers, banners.""",
    4: """TEXT EXACT COPY — the ONLY text allowed anywhere in the output image:
Line 1 (navy #1e3a5f serif): Solo ve
Line 2 (navy "tus " + teal #4aada8 "articulaciones."):
  tus articulaciones.
Spell articulaciones exactly: a-r-t-i-c-u-l-a-c-i-o-n-e-s
Short teal underline under "articulaciones." only.

TEXT PLACEMENT: upper-left wall, left-aligned, 6% from left, 5% from top. Cap height ≈ 5.5% per line. Text block top 18–22% of frame. Must NOT cover faces.

REFERENCE IMAGE RULE: Attached images are for faces, poses, and room layout ONLY. IGNORE and DO NOT copy any text visible in reference images (no "Tres especialistas", no "tratamientos", no panel captions).

FORBIDDEN: Any other words, misspellings (not "tratamianos"), second text blocks, scene numbers, banners.""",
    5: """TEXT EXACT COPY — the ONLY text allowed anywhere in the output image:
Line 1 (navy #1e3a5f serif): Tres mundos
Line 2 (navy): que no se hablan.
Line 3 (navy "Y " + teal #4aada8 "tú" + navy " en el pasillo, " + teal "sola."):
Short teal underline under "sola." only.

TEXT PLACEMENT: upper-left on hallway wall/ceiling inside the photo, left-aligned, 6% from left, 5% from top. Cap height ≈ 5% per line. Must NOT cover patient's face. No box, no banner, no solid background behind text.

REFERENCE IMAGE RULE: Attached images are for faces, poses, and room layout ONLY. IGNORE and DO NOT copy any text visible in reference images.

FORBIDDEN: text header strip, gray/white banner bar, split screen, duplicate text blocks, scene numbers, misspellings.""",
    6: """TEXT EXACT COPY — the ONLY narrative text allowed in the output image:
Line 1 (navy #1e3a5f serif): ¿Cuál plan sigo?
Line 2 (navy): Los tres advierten
Line 3 (teal #4aada8 "interacción."):
Short teal underline under "interacción." only.

TEXT PLACEMENT: upper-left on wall inside the photo, left-aligned, 6% from left, 5% from top. Cap height ≈ 5% per line. Must NOT cover patient's face. No box, no banner.

REFERENCE IMAGE RULE: Attached images are for faces, poses, and layout ONLY. IGNORE text in reference images.

FORBIDDEN: text header strip, split screen, scene numbers, removing red warnings.""",
    7: """TEXT EXACT COPY — the ONLY headline text allowed in the output image:
Line 1 (navy #1e3a5f serif): Un médico que
Line 2 (navy): ve el cuadro completo
Line 3 (navy "y habla con " + teal #4aada8 "todos."):
Short teal underline under "todos." only.

COAT EMBROIDERY — exact text on white coat chest (spell perfectly):
Line 1: Dra. Angélica
Line 2: Medicina de Familia
Use "Dra." with period — NOT "Drau", NOT "Dr", NOT "Doctora". Accent on Angélica: é.

COLOR: Dra. Angélica herself must be FULL COLOR — natural skin tones, dark hair, white coat, stethoscope. She must NOT be grayscale or desaturated.

TEXT PLACEMENT: headline upper-left on wall inside the photo, left-aligned, 6% from left, 5% from top. Must NOT cover her face. No box, no banner.

REFERENCE IMAGE RULE: Attached images are for faces, poses, and layout ONLY. IGNORE wrong text in reference images (no "enocram", no "atta", no "Drau").

FORBIDDEN: grayscale on Angélica, wrong coat text, gibberish embroidery, text header strip, split screen, scene numbers, shrinking/removing care diagram.""",
    8: """TEXT EXACT COPY — headline + CTA (only allowed text in image):

HEADLINE (upper-left, navy #1e3a5f serif):
Line 1: Un plan.
Line 2 (navy "Una " + teal #4aada8 "vida mejor."):
Short teal underline under "vida mejor." only.

CTA BUTTON (teal rounded rectangle #4aada8, white sans-serif text):
Line 1: Llámame ahora:
Line 2: 310 770 0625
Phone must read exactly: 3-1-0 space 7-7-0 space 0-6-2-5

BRANDING (bottom-right on subtle white gradient):
- Use attached logo-teal.png EXACTLY — family-of-three inside stethoscope, teal gradient. NOT a letter "A", NOT an invented monogram.
- Beside logo: "Dra. Angélica" (navy serif) + "Medicina de Familia · La Mesa" (smaller navy sans-serif)

TEXT PLACEMENT: headline upper-left on sky/trees, must NOT cover faces. No box behind headline.

FORBIDDEN: grayscale, scene numbers, wrong phone number, white sidebar on headline, invented "A" logo, generic monogram logo.""",
}

# ---------------------------------------------------------------------------
# SCENE_PROMPTS — per-scene, per-aspect Gemini prompts.
#
# Keys: scene number → aspect ratio ("1:1", "9:16", "16:9").
# Not every scene has every aspect — only combinations we've needed so far.
#
# Attachment order (see reference_images()):
#   storyboard panel → patient ref → approved 1:1 (for non-1:1) → logo (scene 8)
#
# 16:9 prompts extend LEFT wall only (bookshelf, plant) — never stretch the desk.
# 9:16 prompts forbid split-screen text banners (full-bleed photo only).
# ---------------------------------------------------------------------------
SCENE_PROMPTS: dict[int, dict[str, str]] = {
    1: {
        "9:16": """TASK: Photorealistic 9:16 vertical kitchen scene — scene 1, FULL-BLEED single photograph.

ATTACHMENTS: (1) storyboard panel 1 — layout only, ignore text (2) patient reference (3) approved 1:1 scene 1 — match patient, table, props; ignore text in reference

PATIENT IDENTITY LOCK: Colombian woman late 50s–early 60s, slightly chubby, dark wavy hair with gray streaks, light gray cardigan. Same face as references.

KEEP EXACTLY:
- Patient stressed, both hands on head, eyes closed
- Kitchen table with pill bottles, blister packs, weekly pill organizer
- Three appointment cards: CITA CARDIOLOGÍA, CITA ENDOCRINOLOGÍA, CITA REUMATOLOGÍA
- Grayscale only — no color in photo

COMPOSITION — CRITICAL:
- ONE continuous full-bleed photo edge to edge — NO separate text header, NO gray/white banner strip at top, NO split layout (text panel above + image below)
- Text floats directly on kitchen upper cabinets/wall INSIDE the photograph (same style as 1:1)
- Patient + table in lower/mid frame; text in upper-left on wall/cabinets
- Natural vertical crop of same kitchen as 1:1
- TABLE FRAMING: slight pull-back so the full table width fits — all three appointment cards FULLY visible with readable text, none cropped at left or right edge
- Three cards in a row on table, evenly spaced, at least 5% margin from frame sides: "CITA CARDIOLOGÍA" | "CITA ENDOCRINOLOGÍA" | "CITA REUMATOLOGÍA" — every letter visible

{text_exact}

DO NOT: text block on top, banner bar, split screen, cropped/cut-off appointment cards, new face, color, scene numbers.""",
    },
    2: {
        "16:9": """TASK: Photorealistic 16:9 cardiologist office — full-bleed, natural left wall extension.

ATTACHMENTS: (1) storyboard panel 2 — layout only, ignore text (2) patient reference (3) approved 1:1 scene 2 — center composition, ignore text in reference

PATIENT IDENTITY LOCK: Patient from behind — dark hair in bun, gray sweater, slightly chubby build. Same as references.

KEEP EXACTLY:
- Cardiologist: mid-30s man, short dark hair, neat beard, black rectangular glasses, white coat, stethoscope, gesturing hands
- Poster "ANATOMÍA DEL CORAZÓN" on wall, heart model on desk, silver clipboard on desk
- Grayscale only — no color in photo

COMPOSITION — CRITICAL:
- Approved 1:1 scene centered — doctor, patient, desk, heart model unchanged in size
- Desk ends where it ends in 1:1 — do NOT extend, stretch, or autofill desk to the left
- Extra width on LEFT = realistic office wall only: wooden bookshelf with medical books, small potted plant, framed diploma or neutral wall art, subtle baseboard, soft shadow — makes the room feel real and lived-in
- Left wall must NOT be empty flat gray — add depth (shelf, plant, frame, wall corner)
- Text on upper-left wall in the extended area — NOT on desk, NOT on white sidebar
- ONE text block only

{text_exact}

DO NOT: wider desk, desk autofill/smeared wood, empty blank left wall, white sidebar, split layout, new faces, color, scene numbers.""",
    },
    4: {
        "1:1": """TASK: Photorealistic 1:1 rheumatology slide from storyboard panel 4.

ATTACHMENTS (in order): (1) storyboard panel 4 — layout/faces only, ignore its text (2) patient identity reference — ignore its text

PATIENT IDENTITY LOCK: Patient from behind/side — same woman as patient reference: dark wavy hair in bun, gray sweater, slightly chubby build.

KEEP EXACTLY:
- Rheumatologist man's face, white coat, pen in hand writing on clipboard on desk
- Metal clipboard or patient chart folder flat on desk in front of doctor (pen must have something to write on)
- Knee joint model on desk beside clipboard, X-rays on lightbox behind doctor
- Grayscale only — no color in photo

{text_exact}

DO NOT: change faces, add color, scene numbers, text boxes, split layout, copy text from references, pen without clipboard on desk.""",
        "9:16": """TASK: Photorealistic 9:16 vertical rheumatology office — scene 4, FULL-BLEED single photograph.

ATTACHMENTS: (1) storyboard panel 4 — layout only, ignore text (2) patient reference (3) approved 1:1 scene 4 — match people and props, ignore any wrong text in it

PATIENT IDENTITY LOCK: Same patient as references — do not substitute a different woman.

KEEP EXACTLY:
- Same rheumatologist + patient, clipboard with pen on desk, knee joint model, X-ray lightbox behind doctor
- Grayscale only — no color in photo

COMPOSITION — CRITICAL:
- ONE continuous full-bleed photo edge to edge — NO separate text header, NO gray/white banner strip at top, NO split layout
- Text floats directly on upper-left wall INSIDE the photograph (same style as 1:1)
- Consultation scene fills frame; knee model and clipboard fully visible, not cropped at edges

{text_exact}

DO NOT: text block on top, banner bar, split screen, new faces, color, extra text blocks, scene numbers, pen without clipboard.""",
        "16:9": """TASK: Photorealistic 16:9 rheumatology office — full-bleed, natural left wall extension.

ATTACHMENTS: (1) storyboard panel 4 — layout only, ignore text (2) patient reference (3) approved 1:1 scene 4 — center composition, ignore text in reference

PATIENT IDENTITY LOCK: Same patient as references.

KEEP EXACTLY:
- Same rheumatologist + patient, clipboard with pen on desk, knee joint model, X-ray lightbox behind doctor
- Grayscale only — no color in photo

COMPOSITION — CRITICAL:
- Approved 1:1 scene centered — doctor, patient, desk, knee model unchanged in size
- Desk ends where it ends in 1:1 — do NOT extend, stretch, or autofill desk left or right
- Extra width on LEFT = realistic office wall: wooden bookshelf with medical books, small potted plant, framed diploma or neutral wall art, subtle baseboard, soft shadow
- Left wall must NOT be empty flat gray — add depth (shelf, plant, frame)
- X-ray lightbox stays on right wall in extended area
- Text on upper-left wall only — NOT on desk, NOT on white sidebar
- ONE text block only

{text_exact}

DO NOT: wider desk, desk autofill, empty blank left wall, white sidebar, duplicate text blocks, new faces, color, scene numbers, pen without clipboard.""",
    },
    5: {
        "1:1": """TASK: Photorealistic 1:1 hospital hallway scene — storyboard panel 5.

ATTACHMENTS (in order): (1) storyboard panel 5 — layout/faces only, ignore its text (2) patient identity reference — ignore its text

PATIENT IDENTITY LOCK: Colombian woman late 50s–early 60s, slightly chubby, dark wavy hair with gray streaks, light gray cardigan. Same face as patient reference. Do not substitute a different woman.

KEEP EXACTLY:
- Patient alone in hospital hallway, worried/confused expression, looking up
- Three doors with signs: Cardiología, Endocrinología, Reumatología (one on each side + one ahead or three visible)
- Manila folders and medical papers clutched in arms, pill bottle or blister pack visible
- Three question marks floating above her head (above single head only — one face, one head)
- Grayscale only — no color in photo

{text_exact}

DO NOT: change her face, add doctors/nurses in hallway, add color, scene numbers, text boxes, split layout, copy text from references.""",
        "9:16": """TASK: Photorealistic 9:16 vertical hospital hallway — scene 5, FULL-BLEED single photograph.

ATTACHMENTS: (1) storyboard panel 5 — layout only, ignore text (2) patient reference (3) approved 1:1 scene 5 — match patient and hallway, ignore text in reference

PATIENT IDENTITY LOCK: Same patient as references — identical face, hair, gray cardigan.

KEEP EXACTLY:
- Same patient alone, three specialty doors (Cardiología, Endocrinología, Reumatología), folders and pills in arms, question marks above head
- Grayscale only — no color in photo

COMPOSITION — CRITICAL:
- ONE continuous full-bleed photo edge to edge — NO separate text header, NO gray/white banner strip, NO split layout
- Deep hallway one-point perspective; patient centered in corridor
- Text floats on upper-left wall/ceiling INSIDE the photograph
- All three door signs fully readable, not cropped at frame edges

{text_exact}

DO NOT: text block on top, banner bar, split screen, new face, color, doctors in hallway, cropped door signs, scene numbers, duplicate heads, surreal double face, extra faces.""",
        "16:9": """TASK: Photorealistic 16:9 hospital corridor — wide hallway, natural depth extension.

ATTACHMENTS: (1) storyboard panel 5 — layout only, ignore text (2) patient reference (3) approved 1:1 scene 5 — center composition, ignore text in reference

PATIENT IDENTITY LOCK: Same patient as references.

KEEP EXACTLY:
- Same patient alone, three doors (Cardiología, Endocrinología, Reumatología), folders and pill bags, subtle question marks above head
- Grayscale only — no color in photo

COMPOSITION — CRITICAL:
- Approved 1:1 scene centered — patient and doors unchanged in size
- Wide corridor with one-point perspective; extra width = continued hallway walls, ceiling lights, floor tiles, handrails — NOT stretched doors or patient
- Left and right walls show realistic hospital details: wall sconces, exit signs, bulletin board, depth down corridor
- Text on upper-left wall/ceiling along corridor — part of architecture, NOT white sidebar
- ONE text block only

{text_exact}

DO NOT: white sidebar, split screen, empty flat walls, stretched hallway, new face, color, doctors in hallway, scene numbers.""",
    },
    6: {
        "1:1": """TASK: Photorealistic 1:1 home scene — patient overwhelmed by three treatment plans (panel 6).

ATTACHMENTS: (1) storyboard panel 6 — layout only, ignore text (2) patient reference — ignore its text

PATIENT IDENTITY LOCK: Colombian woman late 50s–early 60s, slightly chubby, dark wavy hair with gray streaks, light gray cardigan. Same face as patient reference.

KEEP EXACTLY:
- Patient at home table, worried expression, looking at three plan documents
- Three documents labeled PLAN TRATAMIENTO A, B, C — each with vivid RED triangle warning + RED text "INTERACCIÓN MEDICAMENTOSA"
- Pill bottles on table, wall clock, calendar labeled "Citas Médicas"
- Photo GRAYSCALE except the red warnings (red must pop)

{text_exact}

DO NOT: change her face, remove/dim red warnings, add color elsewhere in photo, scene numbers, text boxes, split layout.""",
        "9:16": """TASK: Photorealistic 9:16 vertical home scene — scene 6, FULL-BLEED single photograph.

ATTACHMENTS: (1) storyboard panel 6 — layout only (2) patient reference (3) approved 1:1 scene 6 — match patient and props, ignore text in reference

PATIENT IDENTITY LOCK: Same patient as references — identical face, hair, gray cardigan.

KEEP EXACTLY:
- Same patient, three PLAN TRATAMIENTO A/B/C with vivid RED "INTERACCIÓN MEDICAMENTOSA" warnings, pill bottles, clock, Citas Médicas calendar
- Grayscale photo EXCEPT red warnings

COMPOSITION — CRITICAL:
- ONE continuous full-bleed photo — NO text header strip, NO split layout
- Text on upper-left wall inside photo
- TABLE FRAMING: slight pull-back / wider crop so the full table width fits — all three plan notebooks FULLY visible with readable text, none cropped at left or right edge
- Three notebooks in a row on table, evenly spaced, at least 5% margin from frame sides: "PLAN TRATAMIENTO A" | "PLAN TRATAMIENTO B" | "PLAN TRATAMIENTO C" — every letter visible including full red "INTERACCIÓN MEDICAMENTOSA" on each

{text_exact}

DO NOT: banner bar, split screen, new face, drop red warnings, cropped/cut-off plan notebooks, scene numbers.""",
        "16:9": """TASK: Photorealistic 16:9 home scene — table ends in frame, natural wall extension.

ATTACHMENTS: (1) storyboard panel 6 — layout only (2) patient reference (3) approved 1:1 scene 6 — center composition, ignore text in reference

PATIENT IDENTITY LOCK: Same patient as references.

KEEP EXACTLY:
- Same patient, three plan cards A/B/C with vivid RED INTERACCIÓN MEDICAMENTOSA, pill bottles, clock, Citas Médicas calendar
- Grayscale + red warnings only

COMPOSITION — CRITICAL:
- Approved 1:1 centered — same table and three cards; table does NOT span wide frame
- Table ends in frame; extra width = wall, sofa edge, window, lamp — natural home details
- Clock and calendar on back wall; text upper-left on wall inside photo
- ONE text block, no white sidebar

{text_exact}

DO NOT: wider table, table autofill, white sidebar, split layout, new face, drop red warnings, scene numbers.""",
    },
    7: {
        "1:1": """TASK: Photorealistic 1:1 — Dra. Angélica in FULL COLOR with circular care diagram (panel 7). This defines her face.

ATTACHMENTS: (1) storyboard panel 7 — layout/faces only, ignore its text and wrong coat embroidery

DOCTOR IDENTITY LOCK: Dra. Angélica — warm professional woman, dark hair in neat bun, white coat, stethoscope, warm smile. Match panel 7 face exactly.

KEEP EXACTLY:
- Dra. Angélica seated at desk, warm expression — FULL COLOR (natural skin, hair, white coat — NOT grayscale)
- White coat chest embroidery exactly: "Dra. Angélica" / "Medicina de Familia" (two lines, legible)
- LARGE circular care diagram behind her with teal connecting lines
- Diagram labels readable: PACIENTE (top), CARDIOLOGÍA, ENDOCRINOLOGÍA, REUMATOLOGÍA, NUTRICIÓN, SALUD MENTAL, FAMILIA
- Office background softly desaturated is OK — but Angélica must remain in full color

{text_exact}

DO NOT: grayscale Angélica, wrong coat text (not "Drau", not "enocram atta"), substitute different doctor face, shrink/remove diagram, scene numbers, text boxes, split layout.""",
        "9:16": """TASK: Photorealistic 9:16 vertical — Dra. Angélica in FULL COLOR + care diagram, FULL-BLEED.

ATTACHMENTS: (1) storyboard panel 7 — layout only, ignore wrong text (2) approved 1:1 scene 7 — match Angélica face, color, coat text, and diagram; ignore wrong embroidery in reference

DOCTOR IDENTITY LOCK: Same Dra. Angélica face as 1:1 and panel 7 — FULL COLOR, not grayscale.

KEEP EXACTLY:
- Same Angélica face, white coat, stethoscope — FULL COLOR
- Coat embroidery: "Dra. Angélica" / "Medicina de Familia"
- FULL circular diagram with all labels: PACIENTE, CARDIOLOGÍA, ENDOCRINOLOGÍA, REUMATOLOGÍA, NUTRICIÓN, SALUD MENTAL, FAMILIA

COMPOSITION — CRITICAL:
- ONE continuous full-bleed photo — NO text header strip, NO split layout
- Text on upper wall/ceiling inside photo; diagram fully visible below

{text_exact}

DO NOT: grayscale Angélica, wrong coat text, banner bar, split screen, new face, remove/shrink diagram, scene numbers.""",
        "16:9": """TASK: Photorealistic 16:9 — Dra. Angélica in FULL COLOR with care diagram, natural left wall extension.

ATTACHMENTS: (1) storyboard panel 7 — layout only, ignore wrong text (2) approved 1:1 scene 7 — match Angélica color and coat text, ignore wrong embroidery in reference

DOCTOR IDENTITY LOCK: Same Dra. Angélica face as approved 1:1 — FULL COLOR, not grayscale.

KEEP EXACTLY:
- Same Angélica face, coat, stethoscope — FULL COLOR
- Coat embroidery exactly: "Dra. Angélica" / "Medicina de Familia"
- LARGE circular diagram fully visible with all labels readable

COMPOSITION — CRITICAL:
- Approved 1:1 centered — desk same size, ends in frame; does NOT get wider
- Extra width LEFT = office wall with bookshelf, plant, framed certificate — natural depth
- Diagram arcs across upper half; Angélica seated center-right at desk
- Text upper-left on wall inside photo — no white sidebar

{text_exact}

DO NOT: grayscale Angélica, wrong coat text (not "Drau"), wider desk, desk autofill, empty left wall, white sidebar, shrink diagram, new face, scene numbers.""",
    },
    8: {
        "1:1": """TASK: Photorealistic 1:1 full-color CTA — happy family in park (panel 8).

ATTACHMENTS: (1) storyboard panel 8 — layout/faces only, ignore its text (2) patient reference — same woman smiling (3) logo-teal.png — EXACT logo for bottom-right branding

PATIENT IDENTITY LOCK: Same Colombian woman as patient reference but SMILING. Husband, young boy, teenage girl — match faces/hair/clothing from panel 8. Do not substitute different people.

KEEP EXACTLY:
- Patient woman smiling, husband, young boy, teenage girl — outdoor park, golden hour, FULL COLOR
- Clipboard: "PLAN DE TRATAMIENTO INTEGRAL" + green checkmark + "COHERENTE · PERSONALIZADO · SEGURO"
- Checklist card with green checks: "Menos citas", "Menos interacciones", "Más calidad de vida"
- Bottom-right: attached logo-teal.png exactly + "Dra. Angélica" + "Medicina de Familia · La Mesa"

{text_exact}

DO NOT: change any family member's face, grayscale this scene, invented "A" logo, scene numbers, white sidebar on headline.""",
        "9:16": """TASK: Photorealistic 9:16 vertical full-color CTA — scene 8, FULL-BLEED.

ATTACHMENTS: (1) storyboard panel 8 — layout only (2) patient reference (3) approved 1:1 scene 8 — match people and props, IGNORE wrong logo in reference (4) logo-teal.png — EXACT logo for bottom-right

PATIENT IDENTITY LOCK: Same smiling patient + same husband, boy, girl as approved 1:1.

KEEP EXACTLY:
- Same 4 people — identical faces to 1:1
- Integral plan clipboard, checklist card, golden hour park, FULL COLOR
- Bottom-right: attached logo-teal.png exactly — family-in-stethoscope teal icon, NOT letter "A"

COMPOSITION — CRITICAL:
- ONE continuous full-bleed photo — NO text header strip, NO split layout
- Family upper/middle; CTA button lower third; real logo bottom-right on subtle gradient

{text_exact}

DO NOT: banner bar, split screen, new faces, remove clipboard or CTA, grayscale, wrong phone number, invented "A" logo, scene numbers.""",
        "16:9": """TASK: Photorealistic 16:9 golden-hour park CTA — full-bleed, text in sky.

ATTACHMENTS: (1) storyboard panel 8 — layout only (2) patient reference (3) approved 1:1 scene 8 — match family and props, IGNORE wrong logo in reference (4) logo-teal.png — EXACT logo for bottom-right

PATIENT IDENTITY LOCK: Same smiling patient + husband, boy, girl as approved 1:1.

KEEP EXACTLY:
- Same 4 people (exact faces), integral plan clipboard with green checkmark, checklist card
- Full color golden hour — trees, path, soft skyline
- Bottom-right: attached logo-teal.png exactly + "Dra. Angélica" + "Medicina de Familia · La Mesa"

COMPOSITION — CRITICAL:
- Family across wide park frame; patient foreground-left holding clipboard, family behind in warm bokeh
- Headline on soft sky/trees upper-left — embedded in scene, NOT white panel
- Teal CTA button mid-left: "Llámame ahora: 310 770 0625"
- Real logo bottom-right on subtle white gradient — NOT invented "A" monogram
- Extra width = more park/trees/sky — natural outdoor extension

{text_exact}

DO NOT: white sidebar, split layout, new faces, grayscale, wrong phone number, invented "A" logo, scene numbers.""",
    },
}


def reference_images(scene: int, aspect: str) -> list[Path]:
    """
    Ordered reference paths sent to Gemini before the text prompt.

    Do not attach REFERENCE_text-style.png — it contains scene 1 copy and
    causes wrong/duplicate on-image text. Scene 7 (Dra. Angélica) skips patient
    ref; scene 8 appends brand logo for bottom-right CTA block.
    """
    paths: list[Path] = [INITIALS / f"scene{scene}.png"]
    if scene != 7:
        paths.append(INITIALS / "REFERENCE_patient.png")
    if aspect != "1:1":
        paths.append(VIDEO / "1x1" / f"scene_{scene}.png")
    if scene == 8:
        paths.append(BRAND_LOGO)
    return paths


def build_prompt(scene: int, aspect: str) -> str:
    """Merge SCENE_PROMPTS template with SCENE_TEXT_EXACT for *scene* / *aspect*."""
    template = SCENE_PROMPTS[scene][aspect]
    text_exact = SCENE_TEXT_EXACT.get(scene, "")
    return template.format(text_exact=text_exact)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate scene images via Gemini API")
    parser.add_argument("scene", type=int, help="Scene number (e.g. 4)")
    parser.add_argument(
        "--aspects",
        nargs="+",
        default=["1:1", "9:16", "16:9"],
        help="Aspect ratios to generate",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model override (default: GEMINI_IMAGE_MODEL from .env.local)",
    )
    parser.add_argument(
        "--pro",
        action="store_true",
        help="Use GEMINI_IMAGE_MODEL_PRO (Nano Banana Pro, ~$0.13/img)",
    )
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set")

    if args.model:
        model = args.model
    elif args.pro:
        model = resolve_model(pro=True)
    else:
        model = resolve_model()
    image_size = image_size_for(model)
    prompts = SCENE_PROMPTS.get(args.scene)
    if not prompts:
        raise SystemExit(f"No prompts configured for scene {args.scene}")

    total_cost = 0.0
    cost_known = False

    for aspect in args.aspects:
        folder = VIDEO / ASPECT_FOLDERS[aspect]
        folder.mkdir(parents=True, exist_ok=True)
        out = folder / f"scene_{args.scene}.png"
        prompt = build_prompt(args.scene, aspect)
        refs = reference_images(args.scene, aspect)

        print(f"Generating scene {args.scene} {aspect} → {out}")
        print(f"  model: {model}")
        print(f"  refs: {[p.name for p in refs]}")
        image_bytes, usage = generate_image(
            api_key=api_key,
            model=model,
            prompt=prompt,
            reference_paths=refs,
            aspect_ratio=aspect,
            image_size=image_size,
        )
        out.write_bytes(image_bytes)
        unit_cost = model_cost_usd(model)
        if unit_cost is not None:
            total_cost += unit_cost
            cost_known = True
        print(f"  saved {len(image_bytes) // 1024} KB")
        print(f"  usage: {format_usage(usage, model)}")

    if cost_known:
        print(f"Done. Session est. cost: ${total_cost:.2f} ({len(args.aspects)} image(s))")
    else:
        print("Done.")


if __name__ == "__main__":
    main()
