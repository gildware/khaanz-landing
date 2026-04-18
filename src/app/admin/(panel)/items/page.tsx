"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ItemFormDialog } from "@/components/admin/item-form-dialog";
import { MenuItemImage } from "@/components/MenuItemImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMenuData } from "@/contexts/menu-data-context";
import { persistMenuPayload } from "@/lib/persist-menu-client";
import type { MenuItem } from "@/types/menu";

export default function AdminItemsPage() {
  const { data, mutate } = useMenuData();
  const categories = data?.categories ?? [];
  const items = data?.items ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  const savePayload = async (next: NonNullable<typeof data>) => {
    await persistMenuPayload(next);
    await mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Menu items</h1>
          <p className="text-muted-foreground text-sm">
            Edit dishes, variations, and item-level add-ons.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          New item
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16"> </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Available</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                  <MenuItemImage
                    src={item.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              </TableCell>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.category}</TableCell>
              <TableCell>
                <Badge variant={item.isVeg ? "secondary" : "destructive"}>
                  {item.isVeg ? "Veg" : "Non-veg"}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={item.available !== false}
                  onCheckedChange={(v) => {
                    if (!data) return;
                    void (async () => {
                      const nextItems = data.items.map((i) =>
                        i.id === item.id ? { ...i, available: Boolean(v) } : i,
                      );
                      try {
                        await savePayload({ ...data, items: nextItems });
                        toast.success("Updated");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Save failed",
                        );
                      }
                    })();
                  }}
                />
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(item);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    if (!data) return;
                    void (async () => {
                      try {
                        await savePayload({
                          ...data,
                          items: data.items.filter((i) => i.id !== item.id),
                        });
                        toast.success("Item removed");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Save failed",
                        );
                      }
                    })();
                  }}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ItemFormDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        initial={editing}
        onSave={(item) => {
          if (!data) return;
          void (async () => {
            try {
              const idx = data.items.findIndex((i) => i.id === item.id);
              const nextItems =
                idx === -1
                  ? [...data.items, item]
                  : data.items.map((i) => (i.id === item.id ? item : i));
              await savePayload({ ...data, items: nextItems });
              toast.success("Item saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Save failed");
            }
          })();
        }}
      />
    </div>
  );
}
