import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaLogQueries?: boolean;
  prismaClientRev?: string;
};

export function getPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  const logQueries = process.env.PRISMA_LOG_QUERIES === "1";
  // Recreate if the generated client was regenerated (e.g. new columns) without
  // a full process restart — still requires a restart to pick up a new DMMF.
  const clientRev = "purchase-bills-json";
  if (
    globalForPrisma.prisma &&
    (globalForPrisma.prismaLogQueries !== logQueries ||
      globalForPrisma.prismaClientRev !== clientRev)
  ) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaLogQueries = logQueries;
    globalForPrisma.prismaClientRev = clientRev;
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
