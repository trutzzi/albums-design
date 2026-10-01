import type { Logger } from "../../shared-kernel/logger";
import { flushErrorReports } from "./error-monitoring";

/**
 * The last line of defence for failures no handler caught. An unhandled rejection is
 * logged (and so reported) and the process keeps serving — the same outcome production
 * had while Sentry's own handler owned it. An uncaught exception leaves the process in
 * an unknown state, so it is reported, flushed, and the process exits for the
 * supervisor (Docker's restart policy) to start a clean one.
 */
export function installProcessGuards(logger: Logger): void {
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled promise rejection", { err: reason });
  });
  process.on("uncaughtException", (error, origin) => {
    logger.error("uncaught exception; exiting", { err: error, origin });
    void flushErrorReports().finally(() => process.exit(1));
  });
}
