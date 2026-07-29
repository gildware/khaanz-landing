/**
 * Order writes fan out into recipe resolution and FIFO batch locking, which can
 * exceed Prisma's 5s interactive-transaction default on a remote database.
 */
export const ORDER_TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const;
