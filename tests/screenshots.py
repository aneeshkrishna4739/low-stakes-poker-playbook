"""Renders index.html at phone width and saves screenshots of each tab.

Needs Playwright:  pip install playwright && playwright install chromium
Run from the project folder:  python tests/screenshots.py
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"


async def main():
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 390, "height": 900}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto((ROOT / "index.html").as_uri())
        await page.wait_for_timeout(800)

        widths = {}
        await page.screenshot(path=str(OUT / "1-preflop.png"), full_page=True)
        widths["preflop"] = await page.evaluate("document.documentElement.scrollWidth")
        await page.click("#tab-postflop")
        await page.screenshot(path=str(OUT / "2-postflop.png"), full_page=True)
        widths["postflop"] = await page.evaluate("document.documentElement.scrollWidth")
        await page.click("#tab-practice")
        # Play one decision so the screenshot shows the judge's feedback.
        first = await page.query_selector("#practice .opt")
        if first:
            await first.click()
        await page.screenshot(path=str(OUT / "3-practice.png"), full_page=True)
        widths["practice"] = await page.evaluate("document.documentElement.scrollWidth")
        await page.click("#tab-rules")
        await page.screenshot(path=str(OUT / "4-rules.png"), full_page=True)
        widths["rules"] = await page.evaluate("document.documentElement.scrollWidth")
        await browser.close()

    print("Page errors:", errors or "none")
    print("Page width per tab at a 390px phone screen (all should be 390):", widths)


asyncio.run(main())
