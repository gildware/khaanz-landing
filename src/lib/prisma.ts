import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaLogQueries?: boolean;
};

export function getPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  const logQueries = process.env.PRISMA_LOG_QUERIES === "1";
  // Recreate client if log preference changed (HMR / restart without full process kill).
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaLogQueries !== logQueries
  ) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaLogQueries = logQueries;
    globalForPrisma.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? logQueries
            ? ["query", "error", "warn"]
            : ["error", "warn"]
          : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
