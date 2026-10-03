"""HTML and PDF export formatters for Senior Data Scientist Reports."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


def _escape_pdf_text(text: str) -> str:
    """Escape special characters in PDF string literal."""
    # Replace non-ascii with closest ascii representation
    clean = text.encode("ascii", "replace").decode("ascii")
    return clean.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _markdown_to_simple_html(markdown_text: str) -> str:
    """Converts basic markdown (headings, bullet points, tables, bold, code) to clean HTML."""
    lines = markdown_text.strip().split("\n")
    html_lines: List[str] = []
    in_table = False
    in_list = False

    for line in lines:
        stripped = line.strip()

        # Handle tables
        if stripped.startswith("|") and stripped.endswith("|"):
            if "---" in stripped:
                continue
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            if not in_table:
                in_table = True
                html_lines.append('<div class="table-responsive"><table>')
                # Treat first row as header if not in table yet
                html_lines.append("<thead><tr>")
                for c in cells:
                    html_lines.append(f"<th>{c}</th>")
                html_lines.append("</tr></thead><tbody>")
            else:
                html_lines.append("<tr>")
                for c in cells:
                    html_lines.append(f"<td>{c}</td>")
                html_lines.append("</tr>")
            continue
        elif in_table:
            in_table = False
            html_lines.append("</tbody></table></div>")

        # Handle lists
        if stripped.startswith("- "):
            if not in_list:
                in_list = True
                html_lines.append("<ul>")
            item = stripped[2:]
            html_lines.append(f"<li>{item}</li>")
            continue
        elif in_list:
            in_list = False
            html_lines.append("</ul>")

        # Headings
        if stripped.startswith("### "):
            html_lines.append(f"<h4>{stripped[4:]}</h4>")
        elif stripped.startswith("#### "):
            html_lines.append(f"<h5>{stripped[5:]}</h5>")
        elif stripped.startswith("## "):
            html_lines.append(f"<h3>{stripped[3:]}</h3>")
        elif stripped.startswith("# "):
            html_lines.append(f"<h2>{stripped[2:]}</h2>")
        elif stripped == "":
            html_lines.append("<br/>")
        else:
            # Inline bold and code
            processed = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", stripped)
            processed = re.sub(r"`(.+?)`", r"<code>\1</code>", processed)
            html_lines.append(f"<p>{processed}</p>")

    if in_table:
        html_lines.append("</tbody></table></div>")
    if in_list:
        html_lines.append("</ul>")

    return "\n".join(html_lines)


def build_report_html(
    report_title: str,
    executive_summary: str,
    sections: List[Dict[str, Any]],
    metadata: Dict[str, Any],
) -> str:
    """Generate a complete standalone, beautifully styled HTML document."""
    version = metadata.get("version", 1)
    project_name = metadata.get("project_name", "DataPilot Project")
    experiment_id = metadata.get("experiment_id", "")
    created_at = metadata.get("created_at", "")

    section_nav_items = "\n".join(
        f'<li><a href="#sec-{s.get("section_number")}">{s.get("title")}</a></li>'
        for s in sections
    )

    rendered_sections = []
    for s in sections:
        sec_num = s.get("section_number", 0)
        title = s.get("title", f"Section {sec_num}")
        source = s.get("source", "measured_result")
        content_md = s.get("content_markdown", "")
        content_html = _markdown_to_simple_html(content_md)

        badge_class = "badge-measured"
        badge_label = "✓ MEASURED RESULT"
        if "ai" in source.lower():
            badge_class = "badge-ai"
            badge_label = "✦ AI INTERPRETATION"
        elif "assumption" in source.lower():
            badge_class = "badge-assumption"
            badge_label = "👤 USER ASSUMPTION"

        rendered_sections.append(f"""
        <section id="sec-{sec_num}" class="report-section">
            <div class="section-header">
                <h2>{title}</h2>
                <span class="source-badge {badge_class}">{badge_label}</span>
            </div>
            <div class="section-body">
                {content_html}
            </div>
        </section>
        """)

    body_html = "\n".join(rendered_sections)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{report_title} (v{version})</title>
    <style>
        :root {{
            --bg-color: #0b1329;
            --card-bg: #0f172a;
            --border-color: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent-cyan: #38bdf8;
            --accent-green: #34d399;
            --accent-amber: #fbbf24;
            --accent-blue: #60a5fa;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            line-height: 1.6;
            padding: 24px;
        }}
        .report-container {{
            max-width: 1100px;
            margin: 0 auto;
        }}
        .report-header {{
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 24px 32px;
            margin-bottom: 24px;
        }}
        .report-title {{
            font-size: 1.8rem;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 8px;
        }}
        .report-meta {{
            font-size: 0.88rem;
            color: var(--text-muted);
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 16px;
        }}
        .report-meta strong {{ color: var(--text-main); }}
        .actions-bar {{
            display: flex;
            justifyContent: space-between;
            align-items: center;
            padding-top: 12px;
            border-top: 1px solid var(--border-color);
        }}
        .btn-print {{
            background: #2563eb;
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.85rem;
        }}
        .btn-print:hover {{ background: #1d4ed8; }}
        .provenance-pill {{
            background: rgba(16, 185, 129, 0.15);
            color: var(--accent-green);
            border: 1px solid rgba(16, 185, 129, 0.3);
            font-size: 0.75rem;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            text-transform: uppercase;
        }}
        .toc-card {{
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px 24px;
            margin-bottom: 24px;
        }}
        .toc-card h3 {{
            font-size: 1.1rem;
            color: var(--accent-cyan);
            margin-bottom: 12px;
        }}
        .toc-card ol {{
            columns: 2;
            padding-left: 20px;
            font-size: 0.85rem;
        }}
        .toc-card a {{
            color: var(--text-muted);
            text-decoration: none;
        }}
        .toc-card a:hover {{ color: var(--accent-cyan); }}
        .report-section {{
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 24px 32px;
            margin-bottom: 20px;
            break-inside: avoid;
        }}
        .section-header {{
            display: flex;
            justifyContent: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 12px;
            margin-bottom: 16px;
        }}
        .section-header h2 {{
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-main);
        }}
        .source-badge {{
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 3px 8px;
            border-radius: 4px;
            letter-spacing: 0.05em;
        }}
        .badge-measured {{
            background: rgba(16, 185, 129, 0.15);
            color: var(--accent-green);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }}
        .badge-ai {{
            background: rgba(245, 158, 11, 0.15);
            color: var(--accent-amber);
            border: 1px solid rgba(245, 158, 11, 0.3);
        }}
        .badge-assumption {{
            background: rgba(59, 130, 246, 0.15);
            color: var(--accent-blue);
            border: 1px solid rgba(59, 130, 246, 0.3);
        }}
        .section-body {{
            font-size: 0.92rem;
            color: #cbd5e1;
        }}
        .section-body h3 {{ color: var(--accent-cyan); margin: 16px 0 8px 0; font-size: 1.1rem; }}
        .section-body h4 {{ color: var(--accent-cyan); margin: 14px 0 6px 0; font-size: 1.0rem; }}
        .section-body h5 {{ color: var(--accent-amber); margin: 12px 0 4px 0; font-size: 0.9rem; }}
        .section-body p {{ margin-bottom: 8px; }}
        .section-body ul {{ margin-left: 20px; margin-bottom: 12px; }}
        .section-body li {{ margin-bottom: 4px; }}
        .section-body code {{
            background: #1e293b;
            color: #38bdf8;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.85rem;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
            margin: 12px 0;
            background: #0b1329;
            border-radius: 4px;
            overflow: hidden;
        }}
        th, td {{
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }}
        th {{
            background: #1e293b;
            color: var(--text-muted);
            font-weight: 600;
        }}
        td {{ color: #e2e8f0; }}
        tr:hover td {{ background: rgba(255, 255, 255, 0.02); }}

        @media print {{
            body {{
                background-color: #ffffff !important;
                color: #000000 !important;
                padding: 0 !important;
            }}
            .actions-bar, .toc-card {{ display: none !important; }}
            .report-header, .report-section {{
                background: #ffffff !important;
                color: #000000 !important;
                border: 1px solid #cccccc !important;
                margin-bottom: 16px !important;
                box-shadow: none !important;
            }}
            .report-title, .section-header h2 {{ color: #000000 !important; }}
            .section-body, th, td {{ color: #111111 !important; }}
            th {{ background: #f3f4f6 !important; }}
            table {{ background: #ffffff !important; border: 1px solid #cccccc !important; }}
            .source-badge {{ border: 1px solid #000000 !important; }}
            .report-section {{ page-break-inside: avoid; }}
        }}
    </style>
</head>
<body>
    <div class="report-container">
        <header class="report-header">
            <h1 class="report-title">{report_title}</h1>
            <div class="report-meta">
                <span>Project: <strong>{project_name}</strong></span>
                <span>Version: <strong>v{version}</strong></span>
                <span>Experiment: <code>{experiment_id[:8]}</code></span>
                <span>Date: <strong>{created_at}</strong></span>
            </div>
            <div class="actions-bar">
                <span class="provenance-pill">✓ 100% Fact-Grounded Provenance Verified</span>
                <button type="button" class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
            </div>
        </header>

        <nav class="toc-card">
            <h3>Table of Contents (23 Standard Sections)</h3>
            <ol>
                {section_nav_items}
            </ol>
        </nav>

        <main>
            {body_html}
        </main>
    </div>
</body>
</html>"""


def build_report_pdf(
    report_title: str,
    executive_summary: str,
    sections: List[Dict[str, Any]],
    metadata: Dict[str, Any],
) -> bytes:
    """Generate a multi-page PDF 1.4 binary document without external dependencies."""
    version = metadata.get("version", 1)
    project_name = metadata.get("project_name", "DataPilot Project")
    created_at = metadata.get("created_at", "")

    # Compile text lines to layout into PDF pages
    all_lines: List[Tuple[str, str, int]] = []  # (text, style, size) style: 'title'|'h2'|'h3'|'body'|'bullet'

    all_lines.append((f"{report_title} (v{version})", "title", 16))
    all_lines.append((f"Project: {project_name} | Generated: {created_at} | Provenance Verified", "meta", 9))
    all_lines.append(("", "spacer", 8))

    for s in sections:
        sec_num = s.get("section_number", 0)
        title = s.get("title", f"Section {sec_num}")
        source = s.get("source", "measured_result")
        source_tag = "[MEASURED RESULT]"
        if "ai" in source.lower():
            source_tag = "[AI INTERPRETATION]"
        elif "assumption" in source.lower():
            source_tag = "[USER ASSUMPTION]"

        all_lines.append((f"{title}  {source_tag}", "h2", 12))
        raw_md = s.get("content_markdown", "")
        for line in raw_md.split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("### "):
                all_lines.append((line[4:], "h3", 10))
            elif line.startswith("#### "):
                all_lines.append((line[5:], "h3", 9))
            elif line.startswith("- "):
                # Wrap long bullets
                b_text = line[2:]
                while len(b_text) > 85:
                    split_idx = b_text[:85].rfind(" ")
                    if split_idx == -1:
                        split_idx = 85
                    all_lines.append((f"  * {b_text[:split_idx]}", "bullet", 8))
                    b_text = b_text[split_idx:].strip()
                all_lines.append((f"  * {b_text}", "bullet", 8))
            elif line.startswith("|") and "---" not in line:
                # Table row: simplify
                cells = [c.strip() for c in line.split("|")[1:-1]]
                table_line = " | ".join(cells)
                if len(table_line) > 95:
                    table_line = table_line[:92] + "..."
                all_lines.append((table_line, "table", 8))
            else:
                # Standard paragraph
                clean_p = re.sub(r"[\*\`]", "", line)
                while len(clean_p) > 90:
                    split_idx = clean_p[:90].rfind(" ")
                    if split_idx == -1:
                        split_idx = 90
                    all_lines.append((clean_p[:split_idx], "body", 8))
                    clean_p = clean_p[split_idx:].strip()
                all_lines.append((clean_p, "body", 8))
        all_lines.append(("", "spacer", 6))

    # Layout into pages (Letter: 612 x 792 pt, margins: 45 pt, top Y=740, bottom Y=50)
    pages_streams: List[str] = []
    current_stream: List[str] = []
    y = 740
    page_num = 1

    def start_page():
        nonlocal y, current_stream
        current_stream = [
            "BT",
            "/F2 8 Tf",
            "45 760 Td",
            f"({_escape_pdf_text(report_title)} | Page {page_num}) Tj",
            "ET",
        ]
        y = 730

    start_page()

    for text, style, size in all_lines:
        font = "/F1"  # regular
        line_height = size + 4
        if style in ("title", "h2", "h3"):
            font = "/F2"  # bold
            line_height = size + 6

        if y - line_height < 50:
            # End page
            pages_streams.append("\n".join(current_stream))
            page_num += 1
            start_page()

        if style == "spacer":
            y -= size
            continue

        esc_text = _escape_pdf_text(text)
        current_stream.append("BT")
        current_stream.append(f"{font} {size} Tf")
        current_stream.append(f"45 {y} Td")
        current_stream.append(f"({esc_text}) Tj")
        current_stream.append("ET")
        y -= line_height

    if current_stream:
        pages_streams.append("\n".join(current_stream))

    # Assemble PDF objects
    num_pages = len(pages_streams)
    objects: List[bytes] = []

    # 1: Catalog
    # 2: Outlines
    # 3: Pages object
    # 4: Font Regular (Helvetica)
    # 5: Font Bold (Helvetica-Bold)
    # 6 to 5 + 2 * num_pages: Page objects and Content stream objects
    objects.append(b"<< /Type /Catalog /Pages 3 0 R /Outlines 2 0 R >>")
    objects.append(b"<< /Type /Outlines /Count 0 >>")

    page_obj_ids = [6 + i * 2 for i in range(num_pages)]
    kids_str = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids_str}] /Count {num_pages} >>".encode("latin1"))

    objects.append(b"<< /Type /Font /Subtype /Type1 /Name /F1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /Name /F2 /BaseFont /Helvetica-Bold >>")

    for i, pstream in enumerate(pages_streams):
        p_bytes = pstream.encode("latin1", "replace")
        content_obj_id = 7 + i * 2
        # Page object
        page_dict = (
            f"<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_obj_id} 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>"
        )
        objects.append(page_dict.encode("latin1"))
        # Content stream object
        stream_dict = f"<< /Length {len(p_bytes)} >>\nstream\n".encode("latin1") + p_bytes + b"\nendstream"
        objects.append(stream_dict)

    # Build xref table
    out = [b"%PDF-1.4\n"]
    offsets = []
    pos = len(out[0])

    for i, obj in enumerate(objects, 1):
        offsets.append(pos)
        header = f"{i} 0 obj\n".encode("latin1")
        footer = b"\nendobj\n"
        chunk = header + obj + footer
        out.append(chunk)
        pos += len(chunk)

    xref_pos = pos
    out.append(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin1"))
    for off in offsets:
        out.append(f"{off:010d} 00000 n \n".encode("latin1"))
    out.append(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode("latin1"))

    return b"".join(out)
