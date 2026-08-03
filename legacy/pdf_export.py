"""
Turns an (edited) assembled reading into a nicely formatted PDF.

Renders the reading as styled HTML and prints it to PDF via a headless
Chromium page (Playwright is already a dependency for chart scraping, so
this avoids pulling in a separate PDF-rendering stack like WeasyPrint).
"""
from __future__ import annotations

import markdown as _markdown

PAGE_CSS = """
@page { size: Letter; margin: 0.9in 0.9in 1in 0.9in; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
  color: #3a2f35;
  line-height: 1.55;
  font-size: 12.3pt;
}
.hero { text-align: center; margin-bottom: 0.3in; }
.kicker {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 10.5pt;
  color: #a97d4a;
  margin-bottom: 0.08in;
}
.hero h1 {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
  font-size: 30pt;
  color: #4a2545;
  margin: 0 0 0.12in 0;
}
.hero .meta {
  font-size: 10pt;
  color: #8a7a82;
  letter-spacing: 0.02em;
}
.divider {
  border: none;
  border-top: 1px solid #ddc9a3;
  width: 55%;
  margin: 0.3in auto 0.35in auto;
}
h2 {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
  font-size: 15.5pt;
  color: #4a2545;
  border-bottom: 1px solid #e8ddc7;
  padding-bottom: 0.06in;
  margin-top: 0.4in;
  margin-bottom: 0.14in;
}
h2:first-of-type { margin-top: 0; }
p { margin: 0 0 0.14in 0; }
strong { color: #7a3f56; }
.signature {
  margin-top: 0.35in;
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  color: #6a5a62;
}
"""

HTML_TEMPLATE = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>{css}</style>
</head>
<body>
  <div class="hero">
    <div class="kicker">Your Inner Marriage</div>
    <h1>{name}</h1>
    <div class="meta">{meta_line}</div>
  </div>
  <hr class="divider">
  {body_html}
</body>
</html>"""


def render_html(name: str, meta_line: str, body_markdown: str) -> str:
    # nl2br: a single newline (e.g. the two "Your feminine/masculine side..."
    # lines) should be a line break, not silently collapsed into one line —
    # that's the more forgiving behavior for Amelia hand-editing the library too.
    body_html = _markdown.markdown(body_markdown, extensions=["nl2br"])
    return HTML_TEMPLATE.format(css=PAGE_CSS, name=name, meta_line=meta_line, body_html=body_html)


def render_pdf_bytes(page, html: str) -> bytes:
    """`page` is an already-open Playwright page (reused across a batch for speed)."""
    page.set_content(html, wait_until="load")
    return page.pdf(format="Letter", print_background=True)
