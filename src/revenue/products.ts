export interface Product {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  priceEth: string;
  type: "one-time" | "subscription";
  billingPeriod?: "monthly" | "yearly";
  /** Live WHOP product ID from whop.com/real-estate-automations */
  whopProductId?: string;
  /** WHOP checkout plan ID */
  whopPlanId?: string;
  stripePriceId?: string;
  upsellTargetId?: string;
  discountPercent?: number;
  channel: ("whop" | "stripe" | "eth" | "bundle")[];
}

/**
 * Canonical ASAM dual-channel product catalog.
 *
 * WHOP store: whop.com/real-estate-automations (biz_5KCxJ8AxaVhU8R)
 * Stripe:     4 products in TEST MODE — switch to live in dashboard
 *
 * Conversion ladder (dual-channel):
 *   Entry/Tripwire  → 0.005 ETH | $12 Stripe | $19 Whop (CashClaw Guide)
 *   Diagnostic      → 0.012 ETH | $29 Stripe
 *   Automation Kit  →            $97 Whop (GHL Kit)
 *   Bundle          →           $127 Whop (all 3 — TODO: create in Whop)
 *   Monthly Retainer→  0.08 ETH | $197/mo Stripe
 */
export const PRODUCTS: Product[] = [
  // ── WHOP products (live) ──────────────────────────────────────────────────
  {
    id: "ghl-automation-kit",
    name: "ASAM GHL Automation Kit",
    description:
      "Complete GoHighLevel automation system: pre-built workflows, lead scoring pipelines, email sequences, and the full ASAM CRM playbook. Plug-and-play for real estate agents.",
    priceUsd: 97,
    priceEth: "0.040",
    type: "one-time",
    whopProductId: "prod_4OZcnEsaXpUAJ",
    whopPlanId: "plan_SXeK0ylsZCxUe",
    upsellTargetId: "monthly-retainer",
    channel: ["whop"],
  },
  {
    id: "ai-prompt-pack",
    name: "ASAM AI Prompt Pack",
    description:
      "50+ battle-tested prompts for real estate AI workflows: listing copy, market analysis, competitor intel, lead nurture scripts, and CRM automation commands.",
    priceUsd: 29,
    priceEth: "0.012",
    type: "one-time",
    whopProductId: "prod_um7vkk8M1MoS6",
    whopPlanId: "plan_1N3eRr6Cq7T4D",
    upsellTargetId: "ghl-automation-kit",
    discountPercent: 10,
    channel: ["whop", "eth"],
  },
  {
    id: "cashclaw-guide",
    name: "ASAM CashClaw Guide",
    description:
      "Step-by-step guide to deploying an autonomous AI revenue agent: Moltlaunch setup, ETH wallet config, task automation, and the full ASAM CashClaw playbook.",
    priceUsd: 19,
    priceEth: "0.008",
    type: "one-time",
    whopProductId: "prod_UVJrBUz3KJv0U",
    whopPlanId: "plan_inko6A68mmvb3",
    upsellTargetId: "ai-prompt-pack",
    discountPercent: 10,
    channel: ["whop", "eth"],
  },
  {
    id: "asam-bundle",
    name: "ASAM Full Stack Bundle",
    description:
      "All 3 ASAM products: GHL Automation Kit + AI Prompt Pack + CashClaw Guide. Everything you need to run a fully automated real estate AI business. Save $38.",
    priceUsd: 127,
    priceEth: "0.053",
    type: "one-time",
    // whopProductId: TODO — create at whop.com/real-estate-automations
    upsellTargetId: "monthly-retainer",
    channel: ["whop", "bundle"],
  },
  // ── Stripe products (test mode — switch to live in Stripe dashboard) ──────
  {
    id: "market-analysis",
    name: "24-Hour Market Analysis",
    description:
      "AI-powered San Diego County market scan delivered in 24 hours: pricing trends, demand signals, 5 off-market signals, and a personalized action plan.",
    priceUsd: 12,
    priceEth: "0.005",
    type: "one-time",
    // stripePriceId: set from Stripe dashboard after switching to live mode
    upsellTargetId: "crm-audit",
    discountPercent: 10,
    channel: ["stripe", "eth"],
  },
  {
    id: "crm-audit",
    name: "CRM Audit",
    description:
      "Full GoHighLevel pipeline audit: funnel gap analysis, automation score, and a prioritized 30-day fix list.",
    priceUsd: 29,
    priceEth: "0.012",
    type: "one-time",
    upsellTargetId: "competitor-analysis",
    discountPercent: 10,
    channel: ["stripe", "eth"],
  },
  {
    id: "competitor-analysis",
    name: "Competitor Analysis",
    description:
      "Deep competitive intelligence on 3 rivals: positioning, pricing, ad copy, SEO gaps, and your counter-strategy.",
    priceUsd: 24,
    priceEth: "0.010",
    type: "one-time",
    upsellTargetId: "monthly-retainer",
    channel: ["stripe", "eth"],
  },
  {
    id: "monthly-retainer",
    name: "ASAM Monthly AI Revenue Partner",
    description:
      "Full-service ongoing AI: weekly lead scoring, CRM automation maintenance, 30 content assets/month, and monthly analytics report. Everything on autopilot.",
    priceUsd: 197,
    priceEth: "0.080",
    type: "subscription",
    billingPeriod: "monthly",
    channel: ["stripe", "eth"],
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getProductsByChannel(
  channel: Product["channel"][number]
): Product[] {
  return PRODUCTS.filter((p) => p.channel.includes(channel));
}

export function getUpsellChain(startId: string): Product[] {
  const chain: Product[] = [];
  let current = getProduct(startId);
  while (current) {
    chain.push(current);
    current = current.upsellTargetId
      ? getProduct(current.upsellTargetId)
      : undefined;
  }
  return chain;
}
