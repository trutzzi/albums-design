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
    if (isClosedConnectionWrite(error)) {
      logger.error("write to a connection the other side had closed; carrying on", { err: error, origin });
      return;
    }
    logger.error("uncaught exception; exiting", { err: error, origin });
    void flushErrorReports().finally(() => process.exit(1));
  });
}

/**
 * A write to a socket the far end already closed (DigiStorage dropping an upload, a
 * client leaving mid-download) whose request had already failed or finished, so no one
 * was left listening. Nothing in this process depends on that socket any more, so it is
 * not the unknown state an uncaught exception otherwise means. Exiting for it put the
 * worker in a crash loop that stopped every upload reaching long-term storage.
 */
export function isClosedConnectionWrite(error: unknown): boolean {
  const { code, syscall } = (error ?? {}) as { code?: unknown; syscall?: unknown };
  return syscall === "write" && (code === "EPIPE" || code === "ECONNRESET");
}
