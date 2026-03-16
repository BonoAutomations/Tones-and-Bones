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
    logger.error("Copy .env.example → .env and fill in all required keys.");
    process.exit(1);
  }

  const agent = new CashClawAgent(AGENT_CONFIG);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — graceful shutdown...`);
    await agent.stop();
    const stats = agent.getStats();
    logger.info("Final stats", stats);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Periodic stats log
  setInterval(() => {
    const s = agent.getStats();
    const a = agent.getActiveTasks().length;
    logger.info(
      `[Heartbeat] Done:${s.tasksCompleted} Failed:${s.tasksFailed} ETH:${s.totalEthEarned} Active:${a}`
    );
  }, 60000);

  await agent.start();
}

main().catch((error) => {
  logger.error("Fatal startup error", { error });
  process.exit(1);
});
