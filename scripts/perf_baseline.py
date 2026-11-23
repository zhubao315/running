#!/usr/bin/env python3
"""ACTIVE 站点性能基线采集器（Playwright + Chromium）。

采集三档视口 × 深浅主题下的：
- LCP / CLS / INP（PerformanceObserver 注入采集）
- 首屏 JS 体积、JSON 体积、3D 场景请求数（Resource Timing）
- DOMContentLoaded / load 时间、页面错误

用法：
  python3 scripts/perf_baseline.py --url <URL> --site <site> [--out docs/perf-baseline]

设计约束（对齐 ACTIVE 路线图 P3）：
- 只测量、不修改站点数据或统计口径；
- 所有指标来自真实浏览器，不推算、不补零；
- 输出结构化 JSON，供 PERF_BASELINE.md 汇总与前后对比。
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

VIEWPORTS = [
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "mobile-390", "width": 390, "height": 844},
    {"name": "mobile-360", "width": 360, "height": 800},
]
THEMES = ("dark", "light")

OBSERVER_SCRIPT = r"""
(() => {
  window.__perf = { lcp: 0, cls: 0, inp: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.lcp = Math.max(window.__perf.lcp, e.startTime);
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) window.__perf.cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const d = (e.processingEnd || e.startTime) - e.startTime;
        if (d > window.__perf.inp) window.__perf.inp = d;
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch (e) { window.__perfError = String(e); }
})();
"""

RESOURCE_SCRIPT = r"""
(() => {
  const rs = performance.getEntriesByType('resource');
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const byType = {};
  let scriptBytes = 0, jsonBytes = 0, sceneBytes = 0;
  const details = [];
  for (const r of rs) {
    const size = r.transferSize || r.encodedBodySize || r.decodedBodySize || 0;
    const t = r.initiatorType || 'other';
    byType[t] = (byType[t] || 0) + size;
    const clean = r.name.split('?')[0];
    // Vite 的 type="module" 脚本在 Resource Timing 中 initiatorType 为 'other'，
    // 因此按文件后缀而非 initiatorType 统计 JS 体积。
    if (clean.endsWith('.js')) scriptBytes += size;
    if (clean.endsWith('.json')) jsonBytes += size;
    if (r.name.includes('/scenes/') || r.name.includes('.scene')) sceneBytes += size;
    details.push({ name: r.name.split('/').pop(), type: t, size });
  }
  return {
    resourceCount: rs.length,
    bytesByType: byType,
    scriptBytes,
    jsonBytes,
    sceneBytes,
    sceneRequests: details.filter((d) => d.name.includes('scene')).length,
    jsonRequests: details.filter((d) => d.name.includes('.json')).length,
    domContentLoaded: nav.domContentLoadedEventEnd || 0,
    load: nav.loadEventEnd || 0,
    topResources: details.sort((a, b) => b.size - a.size).slice(0, 8),
  };
})();
"""


def collect_one(browser, url: str, viewport: dict, theme: str) -> dict:
    context = browser.new_context(
        viewport={"width": viewport["width"], "height": viewport["height"]},
        device_scale_factor=1,
        color_scheme=theme,
    )
    # localStorage 必须在目标 origin 下写入；about:blank 阶段失败由 try 吞掉，
    # 导航到站点时会再次执行并成功。
    context.add_init_script(
        "try{localStorage.setItem('zhubao315-theme','%s')}catch(e){}" % theme
    )
    context.add_init_script(OBSERVER_SCRIPT)
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    try:
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)
        page.mouse.wheel(0, 600)  # 触发交互，便于采集 INP
        page.wait_for_timeout(600)
        perf = page.evaluate("window.__perf || {}")
        resources = page.evaluate(RESOURCE_SCRIPT)
        title = page.title()
    finally:
        context.close()
    return {
        "viewport": viewport["name"],
        "theme": theme,
        "title": title,
        "lcp_ms": round(perf.get("lcp", 0), 1),
        "cls": round(perf.get("cls", 0), 4),
        "inp_ms": round(perf.get("inp", 0), 1),
        "dom_content_loaded_ms": round(resources["domContentLoaded"], 1),
        "load_ms": round(resources["load"], 1),
        "resource_count": resources["resourceCount"],
        "script_bytes": resources["scriptBytes"],
        "json_bytes": resources["jsonBytes"],
        "scene_bytes": resources["sceneBytes"],
        "scene_requests": resources["sceneRequests"],
        "json_requests": resources["jsonRequests"],
        "bytes_by_type": resources["bytesByType"],
        "top_resources": resources["topResources"],
        "page_errors": errors[:5],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--site", required=True)
    ap.add_argument("--out", default="docs/perf-baseline")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        for viewport in VIEWPORTS:
            for theme in THEMES:
                print(f"[{args.site}] {viewport['name']} / {theme} ...", flush=True)
                results.append(collect_one(browser, args.url, viewport, theme))
        browser.close()

    payload = {
        "site": args.site,
        "url": args.url,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "tool": "playwright-chromium (Python)",
        "results": results,
    }
    path = out / f"{args.site}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"WROTE {path}")
    for r in results:
        print(
            f"  {r['viewport']:>10} {r['theme']:<5} "
            f"LCP={r['lcp_ms']:>7}ms CLS={r['cls']:.4f} INP={r['inp_ms']:>6}ms "
            f"JS={r['script_bytes'] / 1024:>6.0f}KB "
            f"req={r['resource_count']:>3} scene={r['scene_requests']}"
        )


if __name__ == "__main__":
    main()
