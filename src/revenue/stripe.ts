import Stripe from "stripe";
import { Product, PRODUCTS } from "./products";
import { logger } from "../utils/logger";

export class StripeRevenue {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  /** Create/update Stripe Price objects matching the ASAM catalog */
  async syncProducts(): Promise<Map<string, string>> {
    const priceIdMap = new Map<string, string>();

    for (const product of PRODUCTS) {
      try {
        const priceId = await this.ensureProduct(product);
        priceIdMap.set(product.id, priceId);
        logger.info(`[Stripe] Synced: ${product.name} → ${priceId}`);
      } catch (error) {
        logger.error(`[Stripe] Failed to sync ${product.id}`, { error });
      }
    }

    return priceIdMap;
  }

  private async ensureProduct(product: Product): Promise<string> {
    // Create the Stripe Product
    const stripeProduct = await this.stripe.products.create({
      name: product.name,
      description: product.description,
      metadata: { asam_id: product.id },
    });

    // Create the Price
    const priceData: Stripe.PriceCreateParams = {
      product: stripeProduct.id,
      unit_amount: Math.round(product.priceUsd * 100),
      currency: "usd",
    };

    if (product.type === "subscription" && product.billingPeriod) {
      priceData.recurring = { interval: product.billingPeriod === "monthly" ? "month" : "year" };
    }

    const price = await this.stripe.prices.create(priceData);
    return price.id;
  }

  /** Generate a Stripe Checkout link for a product */
  async createCheckoutSession(
    productId: string,
    successUrl: string,
    cancelUrl: string,
    customerEmail?: string
  ): Promise<string | null> {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product?.stripePriceId) {
      logger.warn(`[Stripe] No price ID for product ${productId}`);
      return null;
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: product.type === "subscription" ? "subscription" : "payment",
        line_items: [{ price: product.stripePriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customerEmail,
        metadata: { asam_product_id: productId },
      });

      logger.info(`[Stripe] Checkout session: ${session.id}`);
      return session.url;
    } catch (error) {
      logger.error(`[Stripe] Checkout session failed`, { error });
      return null;
    }
  }

  /** Handle Stripe webhook events */
  constructEvent(payload: Buffer, sig: string, secret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, sig, secret);
  }

  async getMonthlyRevenue(): Promise<number> {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    try {
      const charges = await this.stripe.charges.list({
        created: { gte: Math.floor(start.getTime() / 1000) },
        limit: 100,
      });

      return charges.data
        .filter((c) => c.status === "succeeded")
        .reduce((sum, c) => sum + c.amount / 100, 0);
    } catch (error) {
      logger.error("[Stripe] Failed to fetch monthly revenue", { error });
      return 0;
    }
  }
}
