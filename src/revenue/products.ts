export interface Product {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  priceEth: string;
  type: "one-time" | "subscription";
  billingPeriod?: "monthly" | "yearly";
  whopProductId?: string;
  stripePriceId?: string;
  upsellTargetId?: string;
  discountPercent?: number;
}

/** Canonical ASAM product catalog — conversion ladder from entry → retainer */
export const PRODUCTS: Product[] = [
  {
    id: "market-analysis-entry",
    name: "Market Analysis Entry Report",
    description:
      "5-minute AI-powered San Diego County market scan: pricing trends, demand signals, and 3 actionable insights.",
    priceUsd: 12,
    priceEth: "0.005",
    type: "one-time",
    upsellTargetId: "crm-diagnostic",
    discountPercent: 10,
  },
  {
    id: "crm-diagnostic",
    name: "CRM & Pipeline Diagnostic",
    description:
      "Full GoHighLevel audit: funnel gaps, automation score, and a prioritized fix list for 2x conversion.",
    priceUsd: 29,
    priceEth: "0.012",
    type: "one-time",
    upsellTargetId: "competitor-intel",
    discountPercent: 10,
  },
  {
    id: "competitor-intel",
    name: "Competitor Intelligence Report",
    description:
      "Deep-dive on 3 competitors: positioning, pricing, ad copy, SEO gaps, and your counter-strategy.",
    priceUsd: 24,
    priceEth: "0.010",
    type: "one-time",
    upsellTargetId: "monthly-retainer",
  },
  {
    id: "monthly-retainer",
    name: "ASAM Monthly AI Revenue Partner",
    description:
      "Ongoing AI-driven lead scoring, CRM automation, content production, and weekly analytics. Everything on autopilot.",
    priceUsd: 197,
    priceEth: "0.082",
    type: "subscription",
    billingPeriod: "monthly",
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
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
