import { Prisma } from "@prisma/client";

import { InventoryInsufficientError } from "@/lib/inventory/apply-order-inventory";

export type OrderPersistHttp = { status: number; error: string };

function messageForPrismaKnownRequest(
  e: Prisma.PrismaClientKnownRequestError,
): string {
  const c = e.code;
  if (
    c === "P1000" ||
    c === "P1001" ||
    c === "P1002" ||
    c === "P1003" ||
    c === "P1008" ||
    c === "P1010" ||
    c === "P1011" ||
    c === "P1013" ||
    c === "P1017" ||
    c === "P1018"
  ) {
    return "Cannot connect to PostgreSQL. Verify DATABASE_URL, that the server is running, and the database exists.";
  }
  if (c === "P2002") {
    return "This order conflicts with an existing record (duplicate id or reference). Try again.";
  }
  if (c === "P2003") {
    return "Database constraint failed. Run migrations and ensure the database is seeded.";
  }
  if (c === "P2025") {
    return "A related record was missing. Refresh the page and try again.";
  }
  if (c === "P2034") {
    return "Could not save order because the database was busy. Please try again.";
  }
  return `Could not save order (database error ${c}). Check server logs and PostgreSQL configuration.`;
}

/**
 * Maps order persistence failures to HTTP responses. Avoids leaking secrets;
 * use server logs for full Prisma stack traces.
 */
export function httpResponseForOrderPersistError(e: unknown): OrderPersistHttp {
  if (e instanceof InventoryInsufficientError) {
    return {
      status: 409,
      error:
        "Not enough stock for one or more ingredients. Adjust recipes or inventory, or allow negative stock in Inventory settings.",
    };
  }
  if (
    e instanceof Error &&
    (e.message === "SESSION_PHONE_MISMATCH" ||
      e.message === "SESSION_CUSTOMER_INVALID")
  ) {
    return {
      status: 403,
      error: "Session invalid. Please sign in again.",
    };
  }
  if (e instanceof Error && e.message === "ORDER_SEQUENCE_FAILED") {
    return {
      status: 503,
      error: "Could not allocate an order number. Please try again.",
    };
  }
  if (e instanceof Error && e.message === "DATABASE_URL is not set.") {
    return {
      status: 503,
      error:
        "Database is not configured: DATABASE_URL is missing on the server.",
    };
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      error:
        "Cannot connect to PostgreSQL. Check that the database is running and DATABASE_URL is correct.",
    };
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 503,
      error:
        "Order data could not be written to the database. Check server logs for details.",
    };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return { status: 503, error: messageForPrismaKnownRequest(e) };
  }
  if (e instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      status: 503,
      error:
        "Database request failed. Check server logs and PostgreSQL availability.",
    };
  }
  if (e instanceof Prisma.PrismaClientRustPanicError) {
    return {
      status: 503,
      error: "Database engine error. Check server logs.",
    };
  }
  return {
    status: 503,
    error: "Could not save order. Check database configuration.",
  };
}
