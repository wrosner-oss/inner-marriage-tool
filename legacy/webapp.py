#!/usr/bin/env python3
"""
Local single-person UI for generating one natal chart at a time.

Usage:
    .venv/bin/python webapp.py
    then open http://127.0.0.1:5000 in a browser

Fills in one form (name, date, time, birthplace), drives the same
cafeastrology automation as fetch_charts.py, and shows the planetary
positions + chart wheel right in the page, with a ready-to-copy Markdown
block for pasting into a workshop document or email.
"""
import base64

from flask import Flask, render_template_string, request
from playwright.sync_api import sync_playwright

from fetch_charts import ChartError, Person, generate_chart, to_markdown

app = Flask(__name__)

PAGE = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Natal Chart Generator</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.4rem; }
  label { display: block; margin-top: 0.9rem; font-weight: 600; font-size: 0.9rem; }
  input[type=text], input[type=date], input[type=time] { width: 100%; padding: 0.5rem; font-size: 1rem; box-sizing: border-box; }
  button { margin-top: 1.2rem; padding: 0.6rem 1.4rem; font-size: 1rem; cursor: pointer; }
  .hint { color: #666; font-size: 0.82rem; margin-top: 0.2rem; }
  .error { background: #fdecea; border: 1px solid #f5c6cb; color: #611a15; padding: 0.8rem; border-radius: 4px; white-space: pre-wrap; margin-top: 1rem; }
  table { border-collapse: collapse; margin-top: 0.5rem; }
  td, th { border: 1px solid #ccc; padding: 0.25rem 0.6rem; font-size: 0.9rem; }
  textarea { width: 100%; height: 220px; font-family: ui-monospace, monospace; font-size: 0.82rem; margin-top: 0.4rem; }
  img.wheel { max-width: 100%; margin-top: 0.8rem; border: 1px solid #ddd; }
  .checkrow { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.6rem; }
  .checkrow label { margin: 0; font-weight: normal; }
</style>
</head>
<body>
<h1>Natal Chart Generator</h1>
<form method="post" action="/generate">
  <label>Name</label>
  <input type="text" name="name" value="{{ name }}" required>

  <label>Birth date</label>
  <input type="date" name="date" value="{{ date }}" required>

  <div class="checkrow">
    <input type="checkbox" id="unknown_time" name="unknown_time" {{ 'checked' if unknown_time else '' }} onchange="document.getElementById('time_field').disabled = this.checked;">
    <label for="unknown_time">Birth time unknown</label>
  </div>
  <label>Birth time (local, 24h)</label>
  <input type="time" name="time" id="time_field" value="{{ time }}" {{ 'disabled' if unknown_time else '' }}>

  <label>Birthplace</label>
  <input type="text" name="place" value="{{ place }}" placeholder="City, State/Country" required>
  <div class="hint">Be specific enough to be unambiguous, e.g. "Denver, Colorado, United States". If it's ambiguous you'll get a list of matching cities to choose from.</div>

  <button type="submit">Generate chart</button>
</form>

{% if error %}
<div class="error">{{ error }}</div>
{% endif %}

{% if result %}
<hr>
<h2>{{ name }}</h2>

{% if result.positions %}
<h3>Planetary Positions</h3>
<table>
<tr><th>Planet</th><th>Sign</th><th>Degree</th><th></th></tr>
{% for planet, sign, degree, retro in result.positions %}
<tr><td>{{ planet }}</td><td>{{ sign }}</td><td>{{ degree }}</td><td>{{ retro }}</td></tr>
{% endfor %}
</table>
{% endif %}

{% if result.houses %}
<h3>Ascendant &amp; Houses</h3>
<table>
<tr><th>House</th><th>Sign</th><th>Degree</th></tr>
{% for house, sign, degree in result.houses %}
<tr><td>{{ house }}</td><td>{{ sign }}</td><td>{{ degree }}</td></tr>
{% endfor %}
</table>
{% endif %}

{% if result.image_data_uri %}
<img class="wheel" src="{{ result.image_data_uri }}" alt="{{ name }} chart wheel">
{% endif %}

<h3>Markdown (copy into your document)</h3>
<textarea readonly onclick="this.select()">{{ result.markdown }}</textarea>
{% endif %}

</body>
</html>
"""


def render(**kwargs):
    defaults = dict(name="", date="", time="", place="", unknown_time=False, error=None, result=None)
    defaults.update(kwargs)
    return render_template_string(PAGE, **defaults)


@app.route("/", methods=["GET"])
def index():
    return render()


@app.route("/generate", methods=["POST"])
def generate():
    name = request.form.get("name", "").strip()
    date = request.form.get("date", "").strip()
    unknown_time = bool(request.form.get("unknown_time"))
    time_val = "" if unknown_time else request.form.get("time", "").strip()
    place = request.form.get("place", "").strip()

    form_state = dict(name=name, date=date, time=time_val, place=place, unknown_time=unknown_time)

    if not (name and date and place):
        return render(**form_state, error="Name, date, and birthplace are required.")

    person = Person(name=name, date=date, time=time_val, place=place)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=False)
            page = browser.new_page()
            result = generate_chart(page, person)
            browser.close()
    except ChartError as e:
        return render(**form_state, error=str(e))
    except Exception as e:
        return render(**form_state, error=f"Something went wrong talking to cafeastrology.com: {e}")

    if not result["positions"]:
        return render(**form_state, error="Couldn't find a positions table in the report. The site's layout may have changed, or try again.")

    image_data_uri = None
    if result["image_bytes"]:
        b64 = base64.b64encode(result["image_bytes"]).decode("ascii")
        image_data_uri = f"data:image/png;base64,{b64}"

    markdown = to_markdown(person, result["positions"], result["houses"], result["planet_houses"], "chart-wheel.png" if result["image_bytes"] else None)

    return render(
        **form_state,
        result={
            "positions": result["positions"],
            "houses": result["houses"],
            "image_data_uri": image_data_uri,
            "markdown": markdown,
        },
    )


if __name__ == "__main__":
    print("Open http://127.0.0.1:5000 in your browser")
    app.run(debug=False, port=5000)
