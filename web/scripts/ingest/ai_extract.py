#!/usr/bin/env python3
"""Use an LLM to turn extraction.json (from pdf_extract.py or url_extract.py) into
a Strapi-ready Product payload.

The LLM is any OpenAI-compatible model — OpenAI, DashScope/qwen, Zhipu/glm,
OpenRouter, Ollama (set AI_BASE_URL=http://localhost:11434/v1, no API key).

Usage:
    python ai_extract.py <extraction.json> --out product.json
    python ai_extract.py <extraction.json> --out product.json --model qwen-max
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from openai import OpenAI


# ---------------------------------------------------------------------------
# Strapi Product schema — embedded inline.
# The LLM must output a FLAT object (not wrapped in topLevel/dynamicZone).
# We describe the fields that appear at the top level of the Product, then
# the entries of its sections dynamic zone.
# ---------------------------------------------------------------------------

FLAT_SCHEMA = """
{
  // ===== TOP-LEVEL (all at the root of the JSON — no topLevel wrapper!) =====
  "slug": "uid (from name, lowercase kebab)",
  "code": "string (required, product model/SKU)",
  "name": "string (required, product name)",
  "tagline": "string",
  "subtitle": "text",
  "category": "enum: multi-mission | delivery-logistics | agriculture | inspection-mapping | other",
  "heroStats": [ { "label": "string", "value": "string" }, ... ],
  "quoteCta": { "title": "string", "description": "text" },

  // ===== sections: dynamic zone (array, each item has __component + fields) =====
  "sections": [
    // sections.overview        — { __component, title*, body, stats: [{label,value}] }
    // sections.feature-block   — { __component, eyebrow, title*, description, items: [{title, spec?, description?}] }
    // sections.endurance       — { __component, title*, description, points: [{label,value}], note }
    // sections.applications    — { __component, title*, description, items: [{title, description?}] }
    // sections.showcase        — { __component, title*, description, caption }
    // sections.editions        — { __component, title*, description, headers, rows, kitTitle, kitList }
    // sections.specifications  — { __component, title*, rows: [{label,value}] }
    // sections.faq             — { __component, title*, items: [{question, answer}] }
  ]
}
"""


SYSTEM_PROMPT = f"""You are a product-content extractor for Partdro, a professional-drone marketing site.

Your only job is to read product source material (PDF pages, a web page, or a spec sheet) and produce ONE flat JSON object matching the schema below. Never add text outside the JSON. Never use markdown code fences. Output one JSON object only.

## ⚠️ OUTPUT RULES (read twice)
1. FLAT object at the root — NO "topLevel" wrapper, NO "dynamicZone" wrapper. `name`, `code`, `slug` appear directly under `{{ ... }}`.
2. The dynamic zone field is called `sections` (plural) and is an array.
3. Every section item MUST have an `__component` string before its fields. Example: `{{ "__component": "sections.overview", "title": "...", "body": "..." }}`.
4. Omit any section where you have no real content — do NOT fabricate. Only include sections you actually filled.
5. NEVER emit an empty or null list. If a section's list field (`items`, `rows`, `stats`, `points`) would be empty, either fill it from the source or delete the whole section. A section that is only a title is useless.
6. Drop every key whose value would be null, "", or []. Only include keys you actually filled.

## Schema

```
{FLAT_SCHEMA.strip()}
```

## EXAMPLE (copy this shape exactly — note the nested lists are filled)

```json
{{
  "slug": "example-drone-x1",
  "code": "X1",
  "name": "Example Drone X1",
  "tagline": "Compact powerhouse",
  "subtitle": "Autonomous delivery drone",
  "category": "delivery-logistics",
  "heroStats": [
    {{ "label": "Flight Time", "value": "75 min" }},
    {{ "label": "Payload", "value": "15 kg" }}
  ],
  "quoteCta": {{ "title": "Request a quote", "description": "Talk to our team." }},
  "sections": [
    {{ "__component": "sections.overview", "title": "Overview", "body": "One paragraph summary.",
       "stats": [ {{ "label": "Flight Time", "value": "75 min" }}, {{ "label": "Payload", "value": "15 kg" }} ] }},
    {{ "__component": "sections.feature-block", "eyebrow": "Key Features", "title": "Advanced Capabilities", "description": "What it does.",
       "items": [ {{ "title": "3-Axis 8K AI Pod", "spec": "8K", "description": "Quad-sensor camera with AI tracking." }},
                  {{ "title": "Tethered Power", "description": "24/7 continuous operation." }} ] }},
    {{ "__component": "sections.endurance", "title": "Endurance", "description": "Flight time by payload.",
       "points": [ {{ "label": "No load", "value": "75 min" }}, {{ "label": "5 kg", "value": "54 min" }}, {{ "label": "15 kg", "value": "31 min" }} ],
       "note": "Gradient endurance reduces return-to-home time." }},
    {{ "__component": "sections.applications", "title": "Applications", "description": "Where it is used.",
       "items": [ {{ "title": "Firefighting", "description": "Thermal target detection." }},
                  {{ "title": "Logistics", "description": "Autonomous payload delivery." }} ] }},
    {{ "__component": "sections.specifications", "title": "Specifications",
       "rows": [ {{ "label": "Max Payload", "value": "15 kg" }}, {{ "label": "Flight Time", "value": "75 min" }}, {{ "label": "Range", "value": "5G unlimited" }} ] }},
    {{ "__component": "sections.faq", "title": "FAQ",
       "items": [ {{ "question": "What is the max payload?", "answer": "15 kg." }} ] }}
  ]
}}
```

## Rules

1. **slug**: derive from `name` as lowercase kebab-case. Required.
2. **code**: the product model/SKU exactly as it appears. Required.
3. **category**: pick the closest enum. Use `other` only when none fit.
4. **sections**: include only sections for which you have real content. Order naturally: overview first, feature-block(s), endurance, applications, showcase, specifications, faq last.
5. **specifications**: every spec row must have a human-readable `label` and a `value` that includes the unit (e.g. "15 kg", "90 min", "IP55").
6. **quoteCta**: short CTA block. If the source has no contact CTA, still produce one (generic "Request a quote").
7. **Do not invent**. Every field must trace back to something in the source text. If silent, omit or leave null.
8. **Language**: write ALL human-readable text in natural, professional English — name, tagline, subtitle, section titles/bodies, stat labels, item titles/descriptions, spec labels, FAQ, CTA — regardless of the source language. Translate and polish; never output Chinese or any other language. Keep model codes/SKUs (e.g. "EA-J150 EVO") and units verbatim.
9. Keep strings tight — marketing copy, not literal copy-paste. Light polish OK, meaning must not change.
10. Hero image references / media fields: omit entirely from your output. Only produce text.
"""


# ---------------------------------------------------------------------------
# Pass 2: repair pass. Some models (qwen-max in json_object mode) emit `null`
# for every nested array inside the dynamic zone. We ask a second, narrowly
# scoped question to fill only those lists, then merge the answers back.
# ---------------------------------------------------------------------------

LIST_FIELD: dict[str, str] = {
    "sections.overview": "stats",
    "sections.feature-block": "items",
    "sections.endurance": "points",
    "sections.applications": "items",
    "sections.showcase": "items",
    "sections.editions": "rows",
    "sections.specifications": "rows",
    "sections.faq": "items",
}

ITEM_SHAPE = (
    "stats/points/rows => [{\"label\": str, \"value\": str}]; "
    "applications.items / showcase.items => [{\"title\": str, \"description\": str}]; "
    "feature-block.items => [{\"title\": str, \"spec\": str, \"description\": str}]; "
    "faq.items => [{\"question\": str, \"answer\": str}]"
)

FILL_PROMPT = f"""You fill in missing list fields of an already-structured product JSON.

You will receive: (1) the source text of a product, and (2) a JSON product whose `sections` array exists but whose list fields are empty or null.

Output ONE JSON object with this exact shape, and nothing else:

{{"fills": [ {{ "index": 0, "stats": [ ... ] }}, {{ "index": 2, "points": [ ... ] }} ]}}

Rules:
- `index` is the 0-based position in the given `sections` array.
- Only include sections whose list you can fill with real data from the source.
- NEVER return null, [] or omitted keys inside a fill entry. Every fill must be non-empty.
- Use the section's field name exactly as it appears in the given JSON (e.g. `stats`, `items`, `points`, `rows`).
- Item shapes: {ITEM_SHAPE}.
- Keep values with units (e.g. "15 kg", "75 min", "IP55").
- Write every label and value in English, even if the source text is in another language.
- Do not invent data. If the source has nothing for a section, skip that section entirely.
"""


def _missing_lists(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return [{index, component, field}] for sections whose list is empty."""
    out: list[dict[str, Any]] = []
    for i, sec in enumerate(payload.get("sections") or []):
        if not isinstance(sec, dict):
            continue
        field = LIST_FIELD.get(sec.get("__component", ""))
        if not field:
            continue
        if not sec.get(field):
            out.append({"index": i, "component": sec["__component"], "field": field})
    return out


def _fill_lists(
    client: OpenAI,
    model: str,
    payload: dict[str, Any],
    source_text: str,
    temperature: float,
    dump_path: str | None = None,
) -> dict[str, Any]:
    missing = _missing_lists(payload)
    if not missing:
        return payload

    # Tell the model which sections need which field.
    for m in missing:
        m["current"] = {k: v for k, v in payload["sections"][m["index"]].items() if k != "__component"}

    user = (
        "## Sections that need their lists filled\n"
        f"{json.dumps(missing, ensure_ascii=False, indent=2)}\n\n"
        "## Current product JSON\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "## Source text\n"
        f"{source_text}"
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=temperature,
            max_tokens=16384,
            messages=[
                {"role": "system", "content": FILL_PROMPT},
                {"role": "user", "content": user},
            ],
        )
        data = _extract_json(resp.choices[0].message.content or "")
        if dump_path:
            Path(dump_path + ".fill").write_text(resp.choices[0].message.content or "", encoding="utf-8")
    except Exception as exc:
        print(f"Warning: fill pass failed: {exc}", file=sys.stderr)
        return payload

    sections = payload.get("sections") or []
    applied = 0
    for entry in data.get("fills") or []:
        if not isinstance(entry, dict):
            continue
        idx = entry.get("index")
        if not isinstance(idx, int) or not (0 <= idx < len(sections)):
            continue
        sec = sections[idx]
        field = LIST_FIELD.get(sec.get("__component", ""))
        if not field:
            continue
        value = entry.get(field)
        if isinstance(value, list) and value:
            sec[field] = [_prune_empty(v) for v in value]
            applied += 1
    print(f"    fill pass applied {applied}/{len(missing)} section lists", file=sys.stderr)
    return payload


# ---------------------------------------------------------------------------
# ai_config.json — bridge between Nuxt Ingest UI and this Python CLI.
# The web UI writes scripts/ingest/ai_config.json via PUT /api/ai/config;
# this script reads it so both entry points share the same config.
# Env vars always win (they override whatever is on disk).
# ---------------------------------------------------------------------------

def _config_file() -> Path:
    return Path(__file__).resolve().parent / "ai_config.json"


def _load_config_json() -> dict | None:
    cfg_path = _config_file()
    if not cfg_path.is_file():
        return None
    try:
        return json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Warning: failed to parse ai_config.json: {exc}", file=sys.stderr)
        return None


def _effective(key: str, env_key: str, default: str = "") -> str:
    """Resolve a value: env > ai_config.json > default."""
    env_val = os.environ.get(env_key)
    if env_val is not None and env_val != "":
        return env_val
    cfg = _load_config_json() or {}
    cfg_val = cfg.get(key)
    if isinstance(cfg_val, str) and cfg_val:
        return cfg_val
    return default


def _client(model: str | None) -> OpenAI:
    """Build an OpenAI client from env vars, falling back to ai_config.json."""
    api_key = _effective("apiKey", "AI_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    base_url = _effective("baseUrl", "AI_BASE_URL") or os.environ.get("OPENAI_BASE_URL", "")
    if not api_key and not base_url:
        # last resort: try ai_config.json silently, or fall back to Ollama default
        cfg = _load_config_json() or {}
        base_url = cfg.get("baseUrl", "") or "http://localhost:11434/v1"
        api_key = cfg.get("apiKey", "")
        if not api_key:
            print(
                "Warning: no AI_API_KEY / AI_BASE_URL set and ai_config.json not found. "
                "Will try Ollama default (localhost:11434).",
                file=sys.stderr,
            )
    return OpenAI(api_key=api_key or "ollama", base_url=base_url)


def _pick_model(cli_model: str | None) -> str:
    if cli_model:
        return cli_model
    env = os.environ.get("AI_MODEL") or os.environ.get("OPENAI_MODEL")
    if env:
        return env
    cfg = _load_config_json() or {}
    cfg_model = cfg.get("model")
    if isinstance(cfg_model, str) and cfg_model:
        return cfg_model
    # Defaults by provider pattern
    base_url = _effective("baseUrl", "AI_BASE_URL")
    if "ollama" in base_url or "11434" in base_url:
        return "qwen2.5:7b"
    return "qwen-max"


def _condense_for_llm(extraction: dict, max_chars: int = 30000) -> str:
    """Turn the extraction.json into a single source text, truncated to fit."""
    source = extraction.get("source", {})
    pages = extraction.get("pages", [])
    headings = extraction.get("headings", [])
    tables = extraction.get("tables", [])

    parts: list[str] = []
    src_type = source.get("type", "unknown")
    if src_type == "pdf":
        parts.append(f"Source: PDF {source.get('filename', '<unknown>')} ({source.get('pageCount', '?')} pages)")
    elif src_type == "url":
        parts.append(f"Source: URL {source.get('finalUrl') or source.get('url', '<unknown>')}")
    if source.get("title"):
        parts.append(f"Page title: {source['title']}")
    if source.get("description"):
        parts.append(f"Meta description: {source['description']}")
    parts.append("")

    # Headings first — they give the model a structural map cheaply.
    if headings:
        parts.append("## Document headings")
        for h in headings[:80]:
            level = "#" * h.get("level", 2)
            parts.append(f"{level} {h.get('text', '')}")
        parts.append("")

    # Tables — high density of structured information, include all markdowns.
    if tables:
        parts.append("## Tables")
        for t in tables[:40]:
            parts.append(t.get("markdown") or _rows_to_md(t.get("rows", [])))
            parts.append("")

    # Then the full page text, but truncated at the character budget.
    full_text_parts: list[str] = []
    for page in pages:
        text = page.get("text", "")
        pg_no = page.get("page", "?")
        if text.strip():
            full_text_parts.append(f"\n\n===== PAGE {pg_no} =====\n{text}")
    full_text = "".join(full_text_parts)

    condensed = "\n".join(parts)
    if len(condensed) + len(full_text) <= max_chars:
        return condensed + "\n\n## Full text" + full_text

    # Budget for headings + tables + a clipped version of full text.
    used = len(condensed)
    budget = max(4000, max_chars - used)
    clip = full_text[:budget]
    return condensed + "\n\n## Full text (truncated)" + clip + "\n\n[...truncated...]"


def _rows_to_md(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    return "\n".join("| " + " | ".join(r) + " |" for r in rows)


def _extract_json(raw: str) -> dict[str, Any]:
    """Robust JSON extraction from an LLM response.

    Tries, in order:
      1. Direct JSON parse
      2. First ```json ... ``` fence
      3. First {...} or [...] object (brace-balanced)
      4. Between <json>...</json> markers
    """
    text = raw.strip()

    # 1. direct
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. fenced ```json ... ```
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            # try inside the fence again with brace extraction
            pass

    # 3. brace-balanced object
    for marker in ["<json>", "JSON START", "---"]:
        pass  # fall through to brace search

    # Find the first balanced {...} starting from the first '{'
    start = text.find("{")
    if start != -1:
        depth = 0
        end = start
        in_string = False
        escape = False
        for i, ch in enumerate(text[start:], start=start):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        candidate = text[start:end]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    raise ValueError("No JSON object found in LLM response.")


def _unwrap_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Fix common LLM mis-returns:
    - Wrapped in topLevel/dynamicZone → flatten.
    - Wrapped in { product: {...} } or { data: {...} } → extract.
    - sections with missing __component (model put fields directly under sections) → drop bad entries.
    - sections with "component" instead of "__component" → fix.
    """
    p = dict(payload)

    # Case 1: { topLevel: {...}, dynamicZone: [...] } → flatten
    if "topLevel" in p and isinstance(p["topLevel"], dict):
        flat = dict(p.pop("topLevel"))
        # dynamicZone should have been called "sections" — merge if present
        dz = p.pop("dynamicZone", None)
        if "sections" not in p and isinstance(dz, list):
            flat["sections"] = dz
        p = flat
    elif "dynamicZone" in p and "sections" not in p:
        p["sections"] = p.pop("dynamicZone")

    # Case 2: wrapped one level
    for key in ("product", "data", "result", "productData"):
        if key in p and isinstance(p[key], dict) and isinstance(p[key].get("name"), str):
            p = dict(p[key])
            break

    # Fix sections
    sections = p.get("sections")
    if isinstance(sections, list):
        fixed: list[dict] = []
        for item in sections:
            if not isinstance(item, dict):
                continue
            # "component" → "__component"
            if "component" in item and "__component" not in item:
                item["__component"] = item.pop("component")
            # Some models nest fields under "fields" — flatten them up.
            nested = item.pop("fields", None)
            if isinstance(nested, dict):
                item.update(nested)
            # Must have __component
            if not item.get("__component"):
                continue
            fixed.append(item)
        p["sections"] = fixed
    elif isinstance(sections, dict):
        # sections wrongly put as single object — wrap
        if sections.get("__component"):
            p["sections"] = [sections]
        else:
            p["sections"] = []

    # heroStats must be [{label, value}]; LLMs often emit bare strings.
    stats = p.get("heroStats")
    if isinstance(stats, list):
        fixed_stats: list[dict[str, str]] = []
        for s in stats:
            if isinstance(s, dict) and (s.get("label") or s.get("value")):
                fixed_stats.append({"label": str(s.get("label") or ""), "value": str(s.get("value") or "")})
            elif isinstance(s, str) and s.strip():
                fixed_stats.append({"label": "", "value": s.strip()})
        p["heroStats"] = fixed_stats

    # Drop null/empty values so Strapi doesn't receive meaningless fields,
    # and drop sections that carry nothing beyond a title.
    pruned = _prune_empty(p)
    if isinstance(pruned.get("sections"), list):
        pruned["sections"] = [
            s for s in pruned["sections"]
            if isinstance(s, dict) and len(set(s) - {"__component", "title"}) > 0
        ]
    return pruned


# Component fields typed as `text` in Strapi but frequently emitted as arrays.
TEXT_LIST_FIELDS = {"kitList"}


def _coerce_text_fields(payload: dict[str, Any]) -> dict[str, Any]:
    """Join list values into newline-separated text for text-typed fields."""
    for sec in payload.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for field in TEXT_LIST_FIELDS:
            val = sec.get(field)
            if isinstance(val, list):
                parts = [str(v).strip().strip('"').strip() for v in val]
                joined = "\n".join(p for p in parts if p)
                if joined:
                    sec[field] = joined
                else:
                    sec.pop(field, None)
    return payload


def _prune_empty(value: Any) -> Any:
    """Recursively remove null, empty-string, empty-list and empty-dict values."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            pv = _prune_empty(v)
            if pv is None or pv == "" or pv == [] or pv == {}:
                continue
            out[k] = pv
        return out
    if isinstance(value, list):
        return [_prune_empty(v) for v in value]
    return value


def _validate_required(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field in ("name", "code"):
        if not payload.get(field) or not str(payload[field]).strip():
            errors.append(f"missing required field: {field}")
    slug = payload.get("slug")
    if not slug:
        errors.append("missing slug")
    elif re.search(r"[^a-z0-9-\u4e00-\u9fff]", slug):
        errors.append(f"slug must be lowercase-kebab, got: {slug!r}")
    return errors


def _derive_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", slug)  # keep CJK chars, ASCII alnum → -
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "product"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("extraction", help="Path to extraction.json (from pdf_extract or url_extract)")
    parser.add_argument("--out", required=True, help="Path to write product.json")
    parser.add_argument("--model", default=None, help="Override AI_MODEL env")
    parser.add_argument("--max-chars", type=int, default=30000, help="Max chars sent to the model")
    parser.add_argument("--temperature", type=float, default=0.1)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true", help="Print condensed source and exit (no LLM call)")
    parser.add_argument("--dump-raw", default=None, help="Write the raw LLM response to this path (debug)")
    args = parser.parse_args()

    extraction_path = Path(args.extraction).resolve()
    if not extraction_path.is_file():
        print(json.dumps({"ok": False, "error": f"extraction.json not found: {extraction_path}"}), file=sys.stderr)
        return 2

    extraction = json.loads(extraction_path.read_text(encoding="utf-8"))
    source_text = _condense_for_llm(extraction, args.max_chars)

    if args.dry_run:
        out = Path(args.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(source_text, encoding="utf-8")
        print(json.dumps({"ok": True, "mode": "dry-run", "out": str(out), "chars": len(source_text)}))
        return 0

    client = _client(args.model)
    model = _pick_model(args.model)

    last_err: Exception | None = None
    payload: dict[str, Any] | None = None
    for attempt in range(args.retries + 1):
        try:
            resp = client.chat.completions.create(
                model=model,
                temperature=args.temperature,
                max_tokens=16384,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Below is the extracted source content. Produce the Product JSON now.\n\n"
                            f"{source_text}"
                        ),
                    },
                ],
            )
            raw = resp.choices[0].message.content or ""
            if args.dump_raw:
                Path(args.dump_raw).write_text(raw, encoding="utf-8")
            payload = _extract_json(raw)
            break
        except Exception as exc:
            last_err = exc
            if attempt < args.retries:
                # retry without response_format — some local models don't support it
                try:
                    resp = client.chat.completions.create(
                        model=model,
                        temperature=args.temperature,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {
                                "role": "user",
                                "content": (
                                    "Below is the extracted source content. Produce the Product JSON now.\n\n"
                                    f"{source_text}"
                                ),
                            },
                        ],
                    )
                    raw = resp.choices[0].message.content or ""
                    payload = _extract_json(raw)
                    break
                except Exception as exc2:
                    last_err = exc2
            continue

    if payload is None or last_err is not None:
        print(json.dumps({"ok": False, "error": f"LLM failed after {args.retries + 1} attempts: {last_err}"}), file=sys.stderr)
        return 3

    # Normalize: flatten LLM wrapper keys, fix component naming.
    payload = _unwrap_payload(payload)
    # Pass 2: fill nested lists that the first pass left null/empty.
    payload = _fill_lists(client, model, payload, source_text, args.temperature, args.dump_raw)
    payload = _coerce_text_fields(payload)
    payload = _prune_empty(payload)
    # Derive slug if missing.
    if not payload.get("slug") and payload.get("name"):
        payload["slug"] = _derive_slug(payload["name"])
    errors = _validate_required(payload)
    if errors:
        print(json.dumps({"ok": False, "errors": errors, "payload": payload}), file=sys.stderr)
        return 4

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {
        "ok": True,
        "out": str(out_path),
        "model": model,
        "charsSent": len(source_text),
        "name": payload.get("name"),
        "code": payload.get("code"),
        "slug": payload.get("slug"),
        "sectionCount": len(payload.get("sections") or []),
        "category": payload.get("category"),
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
