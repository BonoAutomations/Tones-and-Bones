import "dotenv/config";
import { AGENT_CONFIG, validateConfig } from "./config";
import { CashClawAgent } from "./agent";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  logger.info("==============================================");
  logger.info("  ASAM CashClaw — Autonomous Revenue Agent   ");
  logger.info("  Powered by ASAM | San Diego County         ");
  logger.info("==============================================");

  try {
    validateConfig(AGENT_CONFIG);
  } catch (error) {
    logger.error(`Configuration error: ${String(error)}`);
    logger.error("Please check your .env file and ensure all required variables are set.");
    process.exit(1);
  }

  const agent = new CashClawAgent(AGENT_CONFIG);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await agent.stop();
    const stats = agent.getStats();
    logger.info("Final stats:", stats);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Log stats periodically
  setInterval(() => {
    const stats = agent.getStats();
    const active = agent.getActiveTasks();
    logger.info(`[Stats] Completed: ${stats.tasksCompleted} | Failed: ${stats.tasksFailed} | ETH Earned: ${stats.totalEthEarned} | Active: ${active.length}`);
  }, 60000);

  await agent.start();
}

main().catch((error) => {
  logger.error("Fatal error:", { error });
  process.exit(1);
});
