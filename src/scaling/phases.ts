import { logger } from "../utils/logger";

export type PhaseId = 1 | 2 | 3 | 4 | 5;

export interface ScalingPhase {
  id: PhaseId;
  name: string;
  timeline: string;
  markets: string[];
  kpi: string;
  kpiTarget: number;
  kpiUnit: "customers" | "mrr_usd";
  milestones: string[];
  unlocks: string[]; // what becomes available when this phase completes
}

export const PHASES: ScalingPhase[] = [
  {
    id: 1,
    name: "Lock San Diego",
    timeline: "Current",
    markets: ["Carlsbad", "Encinitas", "La Jolla", "Del Mar", "Rancho Santa Fe"],
    kpi: "10 paying customers within 60 days",
    kpiTarget: 10,
    kpiUnit: "customers",
    milestones: [
      "First Whop sale",
      "First Stripe payment",
      "First Moltlaunch gig completion",
      "Upload .docx deliverables to Whop",
      "Switch Stripe to live mode",
      "Create $127 bundle on Whop",
      "Add X API credits ($5-10) and activate auto-posting",
    ],
    unlocks: ["SoCal market expansion", "Scale pipeline to 100+ agents/run"],
  },
  {
    id: 2,
    name: "Expand SoCal",
    timeline: "Month 2-3",
    markets: [
      "Oceanside", "Vista", "San Marcos", "Escondido", "Poway",
      "Coronado", "Chula Vista", "National City", "Imperial Beach", "Solana Beach",
    ],
    kpi: "$1,000 MRR from Whop + Stripe combined",
    kpiTarget: 1000,
    kpiUnit: "mrr_usd",
    milestones: [
      "Launch $127 Whop bundle",
      "Activate X auto-posting",
      "Scale weekly pipeline to 100+ agents per run",
      "Add 10 new SoCal markets",
    ],
    unlocks: ["Statewide parallel Perplexity cron jobs", "Regional Pantheon agents"],
  },
  {
    id: 3,
    name: "Go Statewide",
    timeline: "Month 4-6",
    markets: ["LA", "SF", "Sacramento", "San Jose", "Fresno", "+20 CA metros"],
    kpi: "$5,000 MRR, 50+ Whop customers",
    kpiTarget: 5000,
    kpiUnit: "mrr_usd",
    milestones: [
      "Deploy parallel Perplexity cron per metro",
      "Launch Artemis-LA, Artemis-SF regional agents",
      "Add GHL sub-accounts per region",
    ],
    unlocks: ["National white-label kit", "Affiliate program"],
  },
  {
    id: 4,
    name: "Go National",
    timeline: "Month 7-12",
    markets: ["Top 50 US metros by real estate transaction volume"],
    kpi: "$10,000 MRR, 200+ customers",
    kpiTarget: 10000,
    kpiUnit: "mrr_usd",
    milestones: [
      "White-label: ASAM for [City] Whop variants",
      "Launch 30% affiliate referral program",
      "Launch YouTube: ASAM Automation Breakdowns",
    ],
    unlocks: ["Cross-vertical expansion"],
  },
  {
    id: 5,
    name: "Cross-Vertical",
    timeline: "Month 12+",
    markets: ["Insurance", "Mortgage", "SaaS Sales Teams", "Financial Advisors"],
    kpi: "$25,000 MRR, multiple Whop stores per vertical",
    kpiTarget: 25000,
    kpiUnit: "mrr_usd",
    milestones: [
      "ASAM GHL Insurance Kit on Whop",
      "ASAM Mortgage Prompt Pack on Whop",
      "CashClaw multi-vertical autonomous quoting",
      "Replace Realtor.com with industry-specific data sources",
    ],
    unlocks: ["Full autonomous multi-vertical revenue engine"],
  },
];

export class PhaseTracker {
  private currentPhaseId: PhaseId = 1;
  private completedMilestones: Set<string> = new Set();
  private payingCustomers = 0;
  private mrrUsd = 0;

  getCurrentPhase(): ScalingPhase {
    return PHASES.find((p) => p.id === this.currentPhaseId)!;
  }

  completeMilestone(milestone: string): void {
    this.completedMilestones.add(milestone);
    logger.info(`[Phase ${this.currentPhaseId}] Milestone complete: "${milestone}"`);
    this.checkPhaseAdvance();
  }

  updateMetrics(payingCustomers: number, mrrUsd: number): void {
    this.payingCustomers = payingCustomers;
    this.mrrUsd = mrrUsd;
    this.checkPhaseAdvance();
  }

  private checkPhaseAdvance(): void {
    const phase = this.getCurrentPhase();
    const currentValue =
      phase.kpiUnit === "customers" ? this.payingCustomers : this.mrrUsd;

    if (currentValue >= phase.kpiTarget && this.currentPhaseId < 5) {
      const nextId = (this.currentPhaseId + 1) as PhaseId;
      logger.info(
        `[PhaseTracker] KPI met! Advancing from Phase ${this.currentPhaseId} → Phase ${nextId}`
      );
      this.currentPhaseId = nextId;
    }
  }

  getProgress(): {
    phase: ScalingPhase;
    completedMilestones: string[];
    pendingMilestones: string[];
    kpiProgress: number;
    kpiPercent: number;
  } {
    const phase = this.getCurrentPhase();
    const completed = phase.milestones.filter((m) =>
      this.completedMilestones.has(m)
    );
    const pending = phase.milestones.filter(
      (m) => !this.completedMilestones.has(m)
    );
    const currentValue =
      phase.kpiUnit === "customers" ? this.payingCustomers : this.mrrUsd;

    return {
      phase,
      completedMilestones: completed,
      pendingMilestones: pending,
      kpiProgress: currentValue,
      kpiPercent: Math.min(100, Math.round((currentValue / phase.kpiTarget) * 100)),
    };
  }

  getPhaseId(): PhaseId {
    return this.currentPhaseId;
  }
}
