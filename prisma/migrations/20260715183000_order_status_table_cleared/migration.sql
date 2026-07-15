-- Dine-in final step after Served (DELIVERED): frees the floor-plan table.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'TABLE_CLEARED';
