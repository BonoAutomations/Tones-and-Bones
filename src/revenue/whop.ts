import axios, { AxiosInstance } from "axios";
import { PRODUCTS } from "./products";
import { logger } from "../utils/logger";

export interface WhopOrder {
  id: string;
  productId: string;
  customerEmail: string;
  amountUsd: number;
  status: "pending" | "completed" | "refunded";
  createdAt: string;
  upsellOffered?: boolean;
}

export class WhopClient {
  private http: AxiosInstance;
  private companyId: string;

  constructor(apiKey: string, companyId: string) {
    this.companyId = companyId;
    this.http = axios.create({
      baseURL: "https://api.whop.com/api/v2",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
  }

  /**
   * READ-ONLY: fetch live order data from the Whop store.
   * No writes to the store — manage products manually at whop.com/real-estate-automations.
   */
  async fetchOrders(limit = 50): Promise<WhopOrder[]> {
    try {
      const response = await this.http.get("/memberships", {
        params: { per_page: limit },
      });
      return (response.data.data || []).map(this.normalizeOrder);
    } catch (error) {
      logger.error("[WHOP] Failed to fetch orders", { error });
      return [];
    }
  }

  async triggerUpsellEmail(
    customerEmail: string,
    purchasedProductId: string
  ): Promise<void> {
    const product = PRODUCTS.find((p) => p.id === purchasedProductId);
    if (!product?.upsellTargetId) return;

    const upsell = PRODUCTS.find((p) => p.id === product.upsellTargetId);
    if (!upsell) return;

    const discountedPrice = product.discountPercent
      ? (upsell.priceUsd * (1 - product.discountPercent / 100)).toFixed(2)
      : upsell.priceUsd.toString();

    logger.info(
      `[WHOP] Upsell email queued: ${customerEmail} → ${upsell.name} at $${discountedPrice}`
    );
    // In production: trigger via GoHighLevel or Mailchimp API using GHL_API_KEY
  }

  private normalizeOrder(raw: Record<string, unknown>): WhopOrder {
    return {
      id: String(raw.id),
      productId: String(raw.plan_id ?? ""),
      customerEmail: String((raw.user as Record<string, unknown>)?.email ?? ""),
      amountUsd: Number(raw.price_paid ?? 0) / 100,
      status: raw.status as WhopOrder["status"],
      createdAt: String(raw.created_at ?? new Date().toISOString()),
    };
  }
}
