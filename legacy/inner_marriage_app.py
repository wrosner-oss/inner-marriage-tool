#!/usr/bin/env python3
"""
Multi-person "Inner Marriage" email assembler, organized by class (a 10-week
workshop's cohort of participants).

Flow: select or create a class -> edit its participant roster -> generate
(reusing previously computed readings unless birth data changed or a
regenerate was requested) -> review/edit text -> export PDFs. Everything for
a class (roster, last-generated text, PDFs) lives in classes/<slug>/ via
class_store.py. The reading copy library (content_library.json, editable via
/library) is global, shared across all classes.

Usage:
    .venv/bin/python inner_marriage_app.py
    open http://127.0.0.1:5050
"""
from __future__ import annotations

from flask import Flask, redirect, render_template_string, request, send_from_directory, url_for
from playwright.sync_api import sync_playwright

from fetch_charts import ChartError, Person, generate_chart, slugify
from assemble_email import assemble_email, extract_signs
from content_store import load_library, save_library, sign_is_complete, SIGN_NAMES, STRUCTURAL_FIELDS
from pdf_export import render_html, render_pdf_bytes
from class_store import (
    list_classes, create_class, load_class, save_class, pdf_dir, new_participant_id,
)

app = Flask(__name__)

MAX_PEOPLE = 15
INITIAL_ROWS = 3

# Shared visual language across every page — warm plum/gold/cream palette
# matching the PDF output, so the tool and its deliverable feel like one thing.
BASE_CSS = """
  :root {
    --plum: #4a2545; --plum-light: #7a3f56;
    --gold: #a97d4a; --gold-light: #ddc9a3;
    --cream: #faf6ef; --card: #fffdfb;
    --text: #3a2f35; --muted: #8a7a82; --border: #e8ddc7;
    --error-bg: #fbe9e7; --error-border: #e3b3a8; --error-text: #8c3a2b;
    --warn-bg: #fdf3e0; --warn-border: #e8c078; --warn-text: #8a5a1f;
    --success-bg: #eef3e4; --success-border: #b9cf9a; --success-text: #4a5c2e;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    background: var(--cream);
    color: var(--text);
    line-height: 1.55;
    margin: 0;
    padding: 2.5rem 1.5rem 4rem;
  }
  .page { max-width: 780px; margin: 0 auto; }
  .page.wide { max-width: 1180px; }
  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400; font-size: 1.9rem; color: var(--plum);
    margin: 0 0 0.35rem 0;
  }
  h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400; font-size: 1.2rem; color: var(--plum);
    margin-top: 2.2rem; border-top: 1px solid var(--border); padding-top: 1.2rem;
  }
  .subhead {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400; font-size: 1.05rem; color: var(--plum);
    margin: 1.8rem 0 0.7rem;
  }
  a { color: var(--plum-light); }
  .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.2rem; }
  .meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 0.6rem; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 1rem 1.2rem; margin-bottom: 0.8rem;
    box-shadow: 0 1px 3px rgba(74, 37, 69, 0.07);
  }
  label {
    display: block; font-size: 0.7rem; font-weight: 600; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.25rem;
  }
  input[type=text], input[type=date], input[type=time], select, textarea {
    width: 100%; padding: 0.5rem 0.6rem; font-size: 0.92rem;
    border: 1px solid var(--border); border-radius: 6px;
    background: #fff; color: var(--text); font-family: inherit;
  }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(169, 125, 74, 0.15);
  }
  button {
    font-family: inherit; border-radius: 8px; border: none; cursor: pointer;
    font-size: 0.92rem; padding: 0.65rem 1.4rem;
    background: var(--plum); color: #fff; transition: background 0.15s;
  }
  button:hover { background: var(--plum-light); }
  button.secondary { background: #fff; color: var(--plum); border: 1px solid var(--border); }
  button.secondary:hover { background: var(--cream); }
  .banner { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.88rem; margin-bottom: 1rem; }
  .banner.error { background: var(--error-bg); border: 1px solid var(--error-border); color: var(--error-text); white-space: pre-wrap; }
  .banner.warn { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); white-space: pre-wrap; }
  .banner.success { background: var(--success-bg); border: 1px solid var(--success-border); color: var(--success-text); }
  .back-links { margin-top: 1.5rem; }
  .back-links a { display: inline-block; margin-right: 1.2rem; font-size: 0.85rem; text-decoration: none; }
  .back-links a:hover { text-decoration: underline; }
"""

CLASS_LIST_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Inner Marriage — Classes</title>
<style>
""" + BASE_CSS + """
  .class-list { list-style: none; padding: 0; margin: 0.3rem 0 1.5rem; }
  .class-list li a { display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: var(--text); }
  .class-list li a .name { font-weight: 600; }
  .class-list li a:hover .name { color: var(--plum); }
  .count { color: var(--muted); font-size: 0.85rem; }
  .new-class-form { display: flex; gap: 0.6rem; }
  .new-class-form input { flex: 1; }
</style>
</head>
<body>
<div class="page">
  <h1>Inner Marriage</h1>

  {% if error %}<div class="banner error">{{ error }}</div>{% endif %}

  {% if classes %}
  <div class="subhead">Open an existing class</div>
  <ul class="class-list">
  {% for c in classes %}
    <li class="card"><a href="/class/{{ c.slug }}/entry"><span class="name">{{ c.name }}</span><span class="count">{{ c.participant_count }} participant{{ '' if c.participant_count == 1 else 's' }}</span></a></li>
  {% endfor %}
  </ul>
  {% else %}
  <p class="hint">No classes yet — create your first one below.</p>
  {% endif %}

  <div class="subhead">Create a new class</div>
  <form class="new-class-form" method="post" action="/classes/new">
    <input type="text" name="name" placeholder="e.g. Spring 2026 Level One" required>
    <button type="submit">Create</button>
  </form>

  <div class="back-links"><a href="/library">Edit the reading library &rarr;</a></div>
</div>
</body>
</html>
"""

ENTRY_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{{ class_name }} — Inner Marriage</title>
<style>
""" + BASE_CSS + """
  .person-row {
    display: grid;
    grid-template-columns: minmax(110px,1fr) minmax(150px,max-content) minmax(125px,max-content) minmax(180px,1.6fr) minmax(85px,max-content) minmax(100px,max-content) minmax(30px,max-content);
    gap: 0.7rem; align-items: end;
  }
  .regen-wrap { display: flex; align-items: center; height: 2.1rem; }
  .regen-wrap label.check { font-size: 0.78rem; color: var(--muted); font-weight: normal; display: flex; align-items: center; gap: 0.35rem; white-space: nowrap; text-transform: none; letter-spacing: normal; }
  .regen-wrap input[type=checkbox] { width: auto; accent-color: var(--plum); }
  .remove-row {
    background: none; border: 1px solid var(--border); color: var(--muted);
    width: 30px; height: 30px; border-radius: 50%; font-size: 1rem; line-height: 1;
    padding: 0; display: flex; align-items: center; justify-content: center;
  }
  .remove-row:hover { background: var(--error-bg); border-color: var(--error-border); color: var(--error-text); }
  #add-row { margin-top: 0.3rem; }
  #generate-btn { margin-top: 1.2rem; }
</style>
</head>
<body>
<div class="page wide">
  <div class="back-links"><a href="/">&larr; All classes</a></div>
  <h1>{{ class_name }}</h1>
  <p class="hint">Enter up to {{ max_people }} people. Leave time blank if unknown. Birthplace needs enough detail to be unambiguous (city + state/country). Previously generated readings are reused as-is unless you check "Regenerate" or change that person's birth info. &middot; <a href="/library">Edit the reading library</a></p>

  {% if error %}
  <div class="banner error">{{ error }}</div>
  {% endif %}

  <form method="post" action="/class/{{ slug }}/generate">
  <div id="rows">
  {% for row in rows %}
    <div class="card person-row">
      <input type="hidden" name="id[]" value="{{ row.id }}">
      <div class="field"><label>Name</label><input type="text" name="name[]" value="{{ row.name }}"></div>
      <div class="field"><label>Birth date</label><input type="date" name="date[]" value="{{ row.date }}"></div>
      <div class="field"><label>Birth time</label><input type="time" name="time[]" value="{{ row.time }}"></div>
      <div class="field"><label>Birthplace</label><input type="text" name="place[]" value="{{ row.place }}" placeholder="City, State/Country"></div>
      <div class="field"><label>Pronoun</label>
        <select name="gender[]">
          <option value="They" {{ "selected" if row.gender == "They" else "" }}>They</option>
          <option value="She" {{ "selected" if row.gender == "She" else "" }}>She</option>
          <option value="He" {{ "selected" if row.gender == "He" else "" }}>He</option>
        </select>
      </div>
      <span class="regen-wrap">
        <input type="hidden" name="regenerate[]" value="">
        {% if row.has_text %}
        <label class="check"><input type="checkbox" onchange="this.parentElement.previousElementSibling.value = this.checked ? '1' : ''"> Regenerate</label>
        {% endif %}
      </span>
      <button type="button" class="remove-row" onclick="this.closest('.person-row').remove()" title="Remove">&times;</button>
    </div>
  {% endfor %}
  </div>
  <button type="button" id="add-row" class="secondary">+ Add another person</button>
  <br>
  <button type="submit" id="generate-btn">Generate readings</button>
  </form>

  <template id="row-template">
    <div class="card person-row">
      <input type="hidden" name="id[]" value="">
      <div class="field"><label>Name</label><input type="text" name="name[]"></div>
      <div class="field"><label>Birth date</label><input type="date" name="date[]"></div>
      <div class="field"><label>Birth time</label><input type="time" name="time[]"></div>
      <div class="field"><label>Birthplace</label><input type="text" name="place[]" placeholder="City, State/Country"></div>
      <div class="field"><label>Pronoun</label>
        <select name="gender[]">
          <option value="They" selected>They</option>
          <option value="She">She</option>
          <option value="He">He</option>
        </select>
      </div>
      <span class="regen-wrap"><input type="hidden" name="regenerate[]" value=""></span>
      <button type="button" class="remove-row" onclick="this.closest('.person-row').remove()" title="Remove">&times;</button>
    </div>
  </template>

  <script>
    const maxPeople = {{ max_people }};
    document.getElementById('add-row').addEventListener('click', () => {
      const rows = document.getElementById('rows');
      if (rows.children.length >= maxPeople) {
        alert('Maximum of ' + maxPeople + ' people at a time.');
        return;
      }
      const tpl = document.getElementById('row-template');
      rows.appendChild(tpl.content.cloneNode(true));
    });
  </script>
</div>
</body>
</html>
"""

REVIEW_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{{ class_name }} — Review</title>
<style>
""" + BASE_CSS + """
  .reused { color: var(--muted); font-size: 0.78rem; font-style: italic; }
  textarea { height: 380px; font-family: ui-monospace, monospace; font-size: 0.82rem; }
  .next-phase { margin-top: 2.5rem; padding: 1rem; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 0.88rem; }
  #export-btn { margin-top: 1.5rem; }
</style>
</head>
<body>
<div class="page">
  <h1>{{ class_name }}</h1>
  <p class="meta">Edit any text below before generating PDFs — this is your last chance to tweak wording.</p>

  <form method="post" action="/class/{{ slug }}/export-pdf">
  {% for r in results %}
  <h2>{{ r.name }}</h2>
  <div class="meta">{{ r.date }} {{ r.time or '(time unknown)' }} — {{ r.place }}{% if r.venus_sign %} · Venus in {{ r.venus_sign }}, Mars in {{ r.mars_sign }}{% endif %}{% if r.reused %} <span class="reused">(reused from before)</span>{% endif %}</div>

  {% if r.error %}
  <div class="banner error">Couldn't generate this one: {{ r.error }}</div>
  {% else %}
    {% if r.gaps %}
    <div class="banner warn">⚠️ This reading has {{ r.gaps|length }} spot(s) needing your input before sending:
{% for g in r.gaps %}
  - {{ g }}
{% endfor %}</div>
    {% endif %}
    <input type="hidden" name="id[]" value="{{ r.id }}">
    <input type="hidden" name="name[]" value="{{ r.name }}">
    <input type="hidden" name="date[]" value="{{ r.date }}">
    <input type="hidden" name="time[]" value="{{ r.time }}">
    <input type="hidden" name="place[]" value="{{ r.place }}">
    <input type="hidden" name="venus_sign[]" value="{{ r.venus_sign }}">
    <input type="hidden" name="mars_sign[]" value="{{ r.mars_sign }}">
    <textarea name="text[]">{{ r.text }}</textarea>
  {% endif %}
  {% endfor %}
  <button type="submit" id="export-btn">Generate PDFs</button>
  </form>

  <div class="next-phase">Next up (not built yet): sending each PDF to the person.</div>
  <div class="back-links"><a href="/class/{{ slug }}/entry">&larr; Back to roster</a><a href="/">All classes</a></div>
</div>
</body>
</html>
"""

PDF_RESULTS_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{{ class_name }} — PDFs Ready</title>
<style>
""" + BASE_CSS + """
  .pdf-list { list-style: none; padding: 0; }
  .pdf-list li { display: flex; justify-content: space-between; align-items: center; }
  a.view { text-decoration: none; color: var(--plum); font-weight: 600; }
  .next-phase { margin-top: 2rem; padding: 1rem; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 0.88rem; }
</style>
</head>
<body>
<div class="page">
  <h1>{{ class_name }} — PDFs ready</h1>
  <ul class="pdf-list">
  {% for r in results %}
    <li class="card"><span>{{ r.name }}</span><a class="view" href="/class/{{ slug }}/pdfs/{{ r.filename }}" target="_blank">View / Download &rarr;</a></li>
  {% endfor %}
  </ul>
  <div class="next-phase">Next up (not built yet): sending each of these to the person.</div>
  <div class="back-links"><a href="/class/{{ slug }}/entry">&larr; Back to roster</a><a href="/">All classes</a></div>
</div>
</body>
</html>
"""

LIBRARY_LIST_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Inner Marriage — Reading Library</title>
<style>
""" + BASE_CSS + """
  .sign-list { list-style: none; padding: 0; }
  .sign-list li a { display: flex; justify-content: space-between; text-decoration: none; color: var(--text); }
  .sign-list li a:hover { color: var(--plum); }
  .status { font-size: 0.8rem; }
  .status.ok { color: var(--success-text); }
  .status.gap { color: var(--warn-text); }
</style>
</head>
<body>
<div class="page">
  <h1>Reading Library</h1>
  <p class="hint">These are the copy blocks each assembled email is built from. Edit a sign to fill in a gap or tweak wording — changes apply to the next reading you generate, no restart needed.</p>

  {% if saved %}<div class="banner success">Saved.</div>{% endif %}

  <p><a href="/library/structural">Edit shared blocks</a> (opening, closing, "Small note," Right Relationship, reflection questions template)</p>

  <ul class="sign-list">
  {% for name in sign_names %}
    <li class="card"><a href="/library/sign/{{ name }}"><span>{{ name }}</span>
      {% if complete[name] %}<span class="status ok">complete</span>{% else %}<span class="status gap">has a gap</span>{% endif %}
    </a></li>
  {% endfor %}
  </ul>

  <div class="back-links"><a href="/">&larr; Back to classes</a></div>
</div>
</body>
</html>
"""

SIGN_EDIT_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Edit {{ sign }} — Inner Marriage Library</title>
<style>
""" + BASE_CSS + """
  textarea { font-family: ui-monospace, monospace; font-size: 0.85rem; }
  textarea.tall { height: 160px; }
  textarea.short { height: 90px; }
  .field-hint { color: var(--muted); font-size: 0.78rem; margin-bottom: 0.3rem; text-transform: none; letter-spacing: normal; }
</style>
</head>
<body>
<div class="page">
  <h1>{{ sign }}</h1>
  <form method="post">
    <label>Element</label>
    <input type="text" name="element" value="{{ data.element or '' }}">

    <label style="margin-top:1.1rem;">Identity paragraph ("I am {{ sign }}...")</label>
    <div class="field-hint">Used verbatim for both Venus and Mars. Leave blank if you don't have one yet — the app will flag it as a gap instead of guessing.</div>
    <textarea name="identity" class="tall">{{ data.identity or '' }}</textarea>

    <label style="margin-top:1.1rem;">Fragment (only if there's no full identity paragraph yet)</label>
    <textarea name="identity_fragment" class="short">{{ data.identity_fragment or '' }}</textarea>

    <label style="margin-top:1.1rem;">Descriptive line</label>
    <textarea name="descriptive" class="short">{{ data.descriptive or '' }}</textarea>

    <label style="margin-top:1.1rem;">Feminine archetypes (one per line)</label>
    <textarea name="feminine_archetypes" class="short">{{ (data.feminine_archetypes or [])|join('\\n') }}</textarea>

    <label style="margin-top:1.1rem;">Masculine archetypes (one per line)</label>
    <textarea name="masculine_archetypes" class="short">{{ (data.masculine_archetypes or [])|join('\\n') }}</textarea>

    <label style="margin-top:1.1rem;">Sun-sign fuel keywords (optional, used in the "Small note" line)</label>
    <input type="text" name="fuel_keywords" value="{{ data.fuel_keywords or '' }}">

    <button type="submit" style="margin-top:1.4rem;">Save</button>
  </form>
  <div class="back-links"><a href="/library">&larr; Back to library</a></div>
</div>
</body>
</html>
"""

STRUCTURAL_EDIT_PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Edit shared blocks — Inner Marriage Library</title>
<style>
""" + BASE_CSS + """
  textarea { font-family: ui-monospace, monospace; font-size: 0.85rem; height: 120px; }
  code { background: var(--card); border: 1px solid var(--border); padding: 0.1rem 0.35rem; border-radius: 4px; }
</style>
</head>
<body>
<div class="page">
  <h1>Shared blocks</h1>
  <p class="hint">These appear in every email, not tied to a specific sign. Keep the <code>{placeholders}</code> — they get filled in automatically.</p>
  <form method="post">
    <label style="margin-top:1.1rem;">Opening &mdash; uses <code>{name}</code></label>
    <textarea name="opening">{{ s.opening }}</textarea>

    <label style="margin-top:1.1rem;">Small note (with fuel keywords) &mdash; uses <code>{sun_sign}</code>, <code>{keywords}</code></label>
    <textarea name="small_note_with_keywords">{{ s.small_note_with_keywords }}</textarea>

    <label style="margin-top:1.1rem;">Small note (no fuel keywords on file) &mdash; uses <code>{sun_sign}</code></label>
    <textarea name="small_note_without_keywords">{{ s.small_note_without_keywords }}</textarea>

    <label style="margin-top:1.1rem;">Small note echo (Venus/Mars also in Sun sign) &mdash; uses <code>{planet}</code>, <code>{sun_sign}</code></label>
    <textarea name="small_note_echo">{{ s.small_note_echo }}</textarea>

    <label style="margin-top:1.1rem;">Section header &mdash; uses <code>{venus_sign}</code>, <code>{mars_sign}</code></label>
    <textarea name="section_header">{{ s.section_header }}</textarea>

    <label style="margin-top:1.1rem;">Double-sign framing (Venus == Mars) &mdash; uses <code>{sign}</code>, <code>{element}</code></label>
    <textarea name="double_sign_framing">{{ s.double_sign_framing }}</textarea>

    <label style="margin-top:1.1rem;">Right Relationship</label>
    <textarea name="right_relationship">{{ s.right_relationship }}</textarea>

    <label style="margin-top:1.1rem;">Right Relationship — male-bodied add-on</label>
    <textarea name="right_relationship_male_addon">{{ s.right_relationship_male_addon }}</textarea>

    <label style="margin-top:1.1rem;">Closing</label>
    <textarea name="closing">{{ s.closing }}</textarea>

    <button type="submit" style="margin-top:1.4rem;">Save</button>
  </form>
  <div class="back-links"><a href="/library">&larr; Back to library</a></div>
</div>
</body>
</html>
"""


@app.route("/library", methods=["GET"])
def library_list():
    library = load_library()
    complete = {name: sign_is_complete(library["signs"][name]) for name in SIGN_NAMES}
    return render_template_string(LIBRARY_LIST_PAGE, sign_names=SIGN_NAMES, complete=complete,
                                   saved=request.args.get("saved"))


@app.route("/library/sign/<name>", methods=["GET", "POST"])
def library_edit_sign(name):
    if name not in SIGN_NAMES:
        return f"Unknown sign: {name}", 404

    library = load_library()

    if request.method == "POST":
        data = library["signs"][name]
        data["element"] = request.form.get("element", "").strip()
        data["identity"] = request.form.get("identity", "").strip() or None
        data["identity_fragment"] = request.form.get("identity_fragment", "").strip() or None
        data["descriptive"] = request.form.get("descriptive", "").strip() or None
        data["fuel_keywords"] = request.form.get("fuel_keywords", "").strip() or None
        for field_name in ("feminine_archetypes", "masculine_archetypes"):
            lines = [line.strip() for line in request.form.get(field_name, "").splitlines() if line.strip()]
            data[field_name] = lines or None
        save_library(library)
        return redirect(url_for("library_list", saved="1"))

    return render_template_string(SIGN_EDIT_PAGE, sign=name, data=library["signs"][name])


@app.route("/library/structural", methods=["GET", "POST"])
def library_edit_structural():
    library = load_library()

    if request.method == "POST":
        for field_name in STRUCTURAL_FIELDS:
            library["structural"][field_name] = request.form.get(field_name, "")
        save_library(library)
        return redirect(url_for("library_list", saved="1"))

    return render_template_string(STRUCTURAL_EDIT_PAGE, s=library["structural"])


# ---------------------------------------------------------------------------
# Classes
# ---------------------------------------------------------------------------

def _row_from_participant(p: dict) -> dict:
    return {
        "id": p.get("id", ""),
        "name": p.get("name", ""),
        "date": p.get("date", ""),
        "time": p.get("time", ""),
        "place": p.get("place", ""),
        "gender": p.get("gender", "They"),
        "has_text": bool(p.get("text")),
    }


def _blank_row() -> dict:
    return {"id": "", "name": "", "date": "", "time": "", "place": "", "gender": "They", "has_text": False}


def _rows_from_submitted_form(form) -> list[dict]:
    ids = form.getlist("id[]")
    names = form.getlist("name[]")
    dates = form.getlist("date[]")
    times = form.getlist("time[]")
    places = form.getlist("place[]")
    genders = form.getlist("gender[]")
    return [
        {"id": pid, "name": name, "date": date, "time": time_, "place": place, "gender": gender, "has_text": bool(pid)}
        for pid, name, date, time_, place, gender in zip(ids, names, dates, times, places, genders)
    ]


@app.route("/", methods=["GET"])
def class_list():
    return render_template_string(CLASS_LIST_PAGE, classes=list_classes(), error=None)


@app.route("/classes/new", methods=["POST"])
def classes_new():
    name = request.form.get("name", "").strip()
    if not name:
        return render_template_string(CLASS_LIST_PAGE, classes=list_classes(), error="Give the class a name.")
    slug = create_class(name)
    return redirect(url_for("class_entry", slug=slug))


@app.route("/class/<slug>/entry", methods=["GET"])
def class_entry(slug):
    cls = load_class(slug)
    if cls is None:
        return f"Unknown class: {slug}", 404

    rows = [_row_from_participant(p) for p in cls["participants"]]
    while len(rows) < INITIAL_ROWS:
        rows.append(_blank_row())

    return render_template_string(ENTRY_PAGE, class_name=cls["name"], slug=slug, rows=rows,
                                   max_people=MAX_PEOPLE, error=None)


@app.route("/class/<slug>/generate", methods=["POST"])
def class_generate(slug):
    cls = load_class(slug)
    if cls is None:
        return f"Unknown class: {slug}", 404

    ids = request.form.getlist("id[]")
    names = request.form.getlist("name[]")
    dates = request.form.getlist("date[]")
    times = request.form.getlist("time[]")
    places = request.form.getlist("place[]")
    genders = request.form.getlist("gender[]")
    regenerate_flags = request.form.getlist("regenerate[]")

    raw_rows = [
        {"id": pid, "name": name.strip(), "date": date.strip(), "time": time_.strip(),
         "place": place.strip(), "gender": gender, "regenerate": bool(regen)}
        for pid, name, date, time_, place, gender, regen in
        zip(ids, names, dates, times, places, genders, regenerate_flags)
    ]

    def _reentry_error(msg):
        echo_rows = [{**r, "has_text": bool(r["id"])} for r in raw_rows] or [_blank_row()]
        return render_template_string(ENTRY_PAGE, class_name=cls["name"], slug=slug, rows=echo_rows,
                                       max_people=MAX_PEOPLE, error=msg)

    filled_rows = [r for r in raw_rows if r["name"] or r["date"] or r["place"]]
    if not filled_rows:
        return _reentry_error("Enter at least one person's birth info.")

    invalid = [r["name"] or "(unnamed row)" for r in filled_rows if not (r["name"] and r["date"] and r["place"])]
    if invalid:
        return _reentry_error(f"These rows are missing name, date, or place: {', '.join(invalid)}")

    existing_by_id = {p["id"]: p for p in cls["participants"] if p.get("id")}

    new_participants: list[dict | None] = [None] * len(filled_rows)
    to_generate = []

    for i, row in enumerate(filled_rows):
        existing = existing_by_id.get(row["id"]) if row["id"] else None
        can_reuse = (
            existing is not None
            and not row["regenerate"]
            and existing.get("date") == row["date"]
            and existing.get("time", "") == row["time"]
            and existing.get("place") == row["place"]
            and existing.get("gender", "They") == row["gender"]
            and existing.get("text")
            and not existing.get("error")
        )
        if can_reuse:
            participant = dict(existing)
            participant["name"] = row["name"]  # allow renaming even when reusing computed data
            new_participants[i] = participant
        else:
            pid = row["id"] or new_participant_id()
            new_participants[i] = {
                "id": pid, "name": row["name"], "date": row["date"], "time": row["time"],
                "place": row["place"], "gender": row["gender"],
                "venus_sign": None, "mars_sign": None, "sun_sign": None,
                "text": None, "gaps": [], "error": None, "pdf_filename": None,
            }
            to_generate.append(i)

    if to_generate:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page()

            for i in to_generate:
                row = filled_rows[i]
                participant = new_participants[i]
                person = Person(name=row["name"], date=row["date"], time=row["time"], place=row["place"])
                try:
                    chart = generate_chart(page, person)
                    signs = extract_signs(chart["positions"])
                    venus_sign, mars_sign, sun_sign = signs.get("Venus"), signs.get("Mars"), signs.get("Sun")
                    if not (venus_sign and mars_sign):
                        participant["error"] = "Couldn't find Venus/Mars in the chart results."
                    else:
                        assembled = assemble_email(
                            row["name"], venus_sign, mars_sign, sun_sign=sun_sign,
                            male_bodied=(row["gender"] == "He"),
                        )
                        participant.update(venus_sign=venus_sign, mars_sign=mars_sign, sun_sign=sun_sign,
                                            text=assembled.text, gaps=assembled.gaps, error=None)
                except ChartError as e:
                    participant["error"] = str(e)
                except Exception as e:
                    participant["error"] = f"Unexpected error: {e}"

            browser.close()

    cls["participants"] = new_participants
    save_class(slug, cls)

    results = [
        {**p, "reused": (i not in to_generate)}
        for i, p in enumerate(new_participants)
    ]
    return render_template_string(REVIEW_PAGE, class_name=cls["name"], slug=slug, results=results)


def _format_meta_line(date: str, time_: str, place: str, venus_sign: str, mars_sign: str) -> str:
    bits = [date, time_ if time_ else "time unknown", place]
    if venus_sign and mars_sign:
        bits.append(f"Venus in {venus_sign}, Mars in {mars_sign}")
    return " &middot; ".join(b for b in bits if b)


@app.route("/class/<slug>/export-pdf", methods=["POST"])
def class_export_pdf(slug):
    cls = load_class(slug)
    if cls is None:
        return f"Unknown class: {slug}", 404

    ids = request.form.getlist("id[]")
    names = request.form.getlist("name[]")
    dates = request.form.getlist("date[]")
    times = request.form.getlist("time[]")
    places = request.form.getlist("place[]")
    venus_signs = request.form.getlist("venus_sign[]")
    mars_signs = request.form.getlist("mars_sign[]")
    texts = request.form.getlist("text[]")

    if not names:
        return "No readings to export — go back and generate at least one reading first.", 400

    by_id = {p["id"]: p for p in cls["participants"] if p.get("id")}
    out_dir = pdf_dir(slug)

    results = []
    used_slugs: dict[str, int] = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()

        for pid, name, date, time_, place, venus_sign, mars_sign, text in zip(
            ids, names, dates, times, places, venus_signs, mars_signs, texts
        ):
            meta_line = _format_meta_line(date, time_, place, venus_sign, mars_sign)
            html = render_html(name, meta_line, text)
            pdf_bytes = render_pdf_bytes(page, html)

            slug_name = slugify(name)
            used_slugs[slug_name] = used_slugs.get(slug_name, 0) + 1
            if used_slugs[slug_name] > 1:
                slug_name = f"{slug_name}-{used_slugs[slug_name]}"
            filename = f"{slug_name}.pdf"
            (out_dir / filename).write_bytes(pdf_bytes)
            results.append({"name": name, "filename": filename})

            if pid in by_id:
                by_id[pid]["text"] = text
                by_id[pid]["pdf_filename"] = filename

        browser.close()

    save_class(slug, cls)
    return render_template_string(PDF_RESULTS_PAGE, class_name=cls["name"], slug=slug, results=results)


@app.route("/class/<slug>/pdfs/<path:filename>")
def serve_class_pdf(slug, filename):
    return send_from_directory(pdf_dir(slug), filename)


if __name__ == "__main__":
    print("Open http://127.0.0.1:5050 in your browser")
    app.run(debug=False, port=5050)
