#!/usr/bin/env python3
"""
Tones & Bones — Sneaker Agency
===============================
Usage:
    python -m sneaker_agency.main run             # Run all enabled tasks
    python -m sneaker_agency.main monitor         # Monitor-only mode (no checkout)
    python -m sneaker_agency.main sizes <url>     # Check available sizes on a URL
    python -m sneaker_agency.main tasks           # List configured tasks
    python -m sneaker_agency.main profiles        # List profiles
    python -m sneaker_agency.main proxies check   # Health-check all proxies
"""
import asyncio
import sys
from pathlib import Path

import click
import yaml
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

BANNER = r"""
 _____ ___  _   _ _____ ____    ___      ____   ___  _   _ _____ ____
|_   _/ _ \| \ | | ____/ ___|  ( _ )    | __ ) / _ \| \ | | ____/ ___|
  | || | | |  \| |  _| \___ \  / _ \/\  |  _ \| | | |  \| |  _| \___ \
  | || |_| | |\  | |___ ___) || (_>  <  | |_) | |_| | |\  | |___ ___) |
  |_| \___/|_| \_|_____|____/  \___/\/  |____/ \___/|_| \_|_____|____/

   S N E A K E R   A G E N C Y  —  Tones & Bones
"""


def load_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        console.print(f"[red]Config file not found: {config_path}[/red]")
        sys.exit(1)
    with open(path) as f:
        return yaml.safe_load(f)


# ── CLI group ─────────────────────────────────────────────────────────────────

@click.group()
@click.option("--config", "-c", default="config.yaml", show_default=True, help="Path to config.yaml")
@click.pass_context
def cli(ctx, config):
    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config
    console.print(Panel(BANNER, style="bold cyan", border_style="cyan"))


# ── run ───────────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def run(ctx):
    """Run all enabled checkout tasks."""
    from sneaker_agency.core.bot import SneakerAgency

    cfg = load_config(ctx.obj["config_path"])
    tasks = cfg.get("tasks", [])
    enabled = [t for t in tasks if t.get("enabled", True)]

    console.print(f"[bold green]Starting {len(enabled)} task(s)…[/bold green]")

    agency = SneakerAgency(cfg)
    asyncio.run(agency.start(tasks))

    # Print summary table
    if agency.results:
        table = Table(title="Session Results", box=box.ROUNDED)
        table.add_column("Task", style="cyan")
        table.add_column("Retailer")
        table.add_column("Product")
        table.add_column("Size")
        table.add_column("Price")
        table.add_column("Order #")
        table.add_column("Status")

        for r in agency.results:
            status = "[green]SUCCESS[/green]" if r["success"] else "[red]FAILED[/red]"
            table.add_row(
                r["task_id"], r["retailer"], r["product_name"][:40],
                r["size"], r["price"], r["order_number"] or "—", status,
            )
        console.print(table)


# ── monitor ───────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def monitor(ctx):
    """Monitor release calendars and alert on keyword matches (no checkout)."""
    from sneaker_agency.core.monitor import ReleaseMonitor

    cfg = load_config(ctx.obj["config_path"])
    mon_cfg = cfg.get("monitor", {})

    async def _on_drop(retailer, name, url, sizes):
        console.print(f"[bold yellow]DROP: [{retailer.upper()}] {name}  →  {url}[/bold yellow]")

    mon = ReleaseMonitor(
        keywords=mon_cfg.get("keywords", []),
        retailers=mon_cfg.get("retailers", ["nike", "adidas"]),
        check_interval=mon_cfg.get("check_interval_seconds", 60),
        on_drop_detected=_on_drop,
    )
    console.print("[bold cyan]Monitor running. Press Ctrl+C to stop.[/bold cyan]")
    try:
        asyncio.run(mon.start())
    except KeyboardInterrupt:
        mon.stop()
        console.print("[yellow]Monitor stopped.[/yellow]")


# ── sizes ─────────────────────────────────────────────────────────────────────

@cli.command()
@click.argument("url")
@click.option("--retailer", "-r", default="shopify", show_default=True,
              type=click.Choice(["nike", "adidas", "footlocker", "shopify"]))
@click.pass_context
def sizes(ctx, url, retailer):
    """Check currently available sizes for a product URL."""
    from playwright.async_api import async_playwright
    from sneaker_agency.retailers.nike import NikeRetailer
    from sneaker_agency.retailers.adidas import AdidasRetailer
    from sneaker_agency.retailers.footlocker import FootLockerRetailer
    from sneaker_agency.retailers.shopify import ShopifyRetailer
    from sneaker_agency.retailers.base import TaskConfig

    cfg = load_config(ctx.obj["config_path"])
    retailer_map = {
        "nike": NikeRetailer,
        "adidas": AdidasRetailer,
        "footlocker": FootLockerRetailer,
        "shopify": ShopifyRetailer,
    }

    async def _check():
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx_browser = await browser.new_context()
            task = TaskConfig(
                id="size-check",
                retailer=retailer,
                product_url=url,
                sizes=[],
                quantity=1,
                profile_id="primary",
                mode="fast",
            )
            # Dummy profile
            from sneaker_agency.profiles.manager import Profile
            dummy = Profile(
                id="dummy", first_name="", last_name="", email="", phone="",
                address_1="", address_2="", city="", state="", zip="",
                country="US", card_number="", card_expiry="", card_cvv="", card_holder="",
            )
            adapter = retailer_map[retailer](ctx_browser, task, dummy, None)
            avail = await adapter.get_available_sizes()
            await browser.close()
            return avail

    available = asyncio.run(_check())
    if available:
        console.print(f"[green]Available sizes at {url}:[/green]")
        for s in available:
            console.print(f"  • {s}")
    else:
        console.print("[red]No sizes available (or sold out).[/red]")


# ── tasks ─────────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def tasks(ctx):
    """List all configured tasks."""
    cfg = load_config(ctx.obj["config_path"])
    task_list = cfg.get("tasks", [])

    table = Table(title="Configured Tasks", box=box.ROUNDED)
    table.add_column("ID", style="cyan")
    table.add_column("Enabled")
    table.add_column("Retailer")
    table.add_column("Sizes")
    table.add_column("Profile")
    table.add_column("Mode")
    table.add_column("URL")

    for t in task_list:
        enabled = "[green]YES[/green]" if t.get("enabled") else "[red]NO[/red]"
        table.add_row(
            t.get("id", ""), enabled, t.get("retailer", ""),
            ", ".join(t.get("sizes", [])), t.get("profile_id", ""),
            t.get("mode", "safe"), t.get("product_url", "")[:60],
        )
    console.print(table)


# ── profiles ──────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def profiles(ctx):
    """List configured profiles (card numbers are masked)."""
    cfg = load_config(ctx.obj["config_path"])
    profile_list = cfg.get("profiles", [])

    table = Table(title="Profiles", box=box.ROUNDED)
    table.add_column("ID", style="cyan")
    table.add_column("Name")
    table.add_column("Email")
    table.add_column("Address")
    table.add_column("Card")

    for p in profile_list:
        table.add_row(
            p.get("id", ""),
            f"{p.get('first_name','')} {p.get('last_name','')}",
            p.get("email", ""),
            f"{p.get('address_1','')}, {p.get('city','')}, {p.get('state','')} {p.get('zip','')}",
            f"****{p.get('card_number','')[-4:]}",
        )
    console.print(table)


# ── proxies ───────────────────────────────────────────────────────────────────

@cli.group()
def proxies():
    """Proxy management commands."""
    pass


@proxies.command("check")
@click.pass_context
def proxies_check(ctx):
    """Health-check all configured proxies."""
    from sneaker_agency.proxies.manager import ProxyManager

    cfg = load_config(ctx.obj["config_path"])
    proxy_cfg = cfg.get("proxies", {})
    proxy_list = proxy_cfg.get("list", [])

    if not proxy_list:
        console.print("[yellow]No proxies configured.[/yellow]")
        return

    pm = ProxyManager(proxy_list, test_url=proxy_cfg.get("test_url", "https://www.nike.com"))
    asyncio.run(pm.health_check_all())

    table = Table(title="Proxy Health", box=box.ROUNDED)
    table.add_column("Proxy", style="cyan")
    table.add_column("Status")
    table.add_column("Fails")

    for p in pm._pool:
        status = "[green]OK[/green]" if p.healthy else "[red]DEAD[/red]"
        table.add_row(p.url, status, str(p.fail_count))
    console.print(table)


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli(obj={})
