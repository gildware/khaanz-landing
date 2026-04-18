"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ComboFormDialog } from "@/components/admin/combo-form-dialog";
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
import {
  computeComboRetailTotal,
  formatComboComponentSummary,
} from "@/lib/menu-combos";
import { persistMenuPayload } from "@/lib/persist-menu-client";
import type { MenuCombo } from "@/types/menu";

export default function AdminCombosPage() {
  const { data, mutate } = useMenuData();
  const items = data?.items ?? [];
  const combos = data?.combos ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuCombo | null>(null);

  const savePayload = async (next: NonNullable<typeof data>) => {
    await persistMenuPayload(next);
    await mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Combos</h1>
          <p className="text-muted-foreground text-sm">
            Bundle existing menu items and set one price for the pack.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          New combo
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16"> </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Includes</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Offer</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Available</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combos.map((combo) => (
            <TableRow key={combo.id}>
              <TableCell>
                <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                  <MenuItemImage
                    src={combo.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              </TableCell>
              <TableCell className="font-medium">{combo.name}</TableCell>
              <TableCell className="max-w-[240px] text-muted-foreground text-sm">
                {formatComboComponentSummary(combo, items)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                ₹{computeComboRetailTotal(combo, items)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                ₹{combo.price}
              </TableCell>
              <TableCell>
                <Badge variant={combo.isVeg ? "secondary" : "destructive"}>
                  {combo.isVeg ? "Veg" : "Non-veg"}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={combo.available !== false}
                  onCheckedChange={(v) => {
                    if (!data) return;
                    void (async () => {
                      const nextCombos = data.combos.map((c) =>
                        c.id === combo.id ? { ...c, available: Boolean(v) } : c,
                      );
                      try {
                        await savePayload({ ...data, combos: nextCombos });
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
                    setEditing(combo);
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
                          combos: data.combos.filter((c) => c.id !== combo.id),
                        });
                        toast.success("Combo removed");
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

      <ComboFormDialog
        open={open}
        onOpenChange={setOpen}
        menuItems={items}
        initial={editing}
        onSave={(combo) => {
          if (!data) return;
          void (async () => {
            try {
              const idx = data.combos.findIndex((c) => c.id === combo.id);
              const nextCombos =
                idx === -1
                  ? [...data.combos, combo]
                  : data.combos.map((c) => (c.id === combo.id ? combo : c));
              await savePayload({ ...data, combos: nextCombos });
              toast.success("Combo saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Save failed");
            }
          })();
        }}
      />
    </div>
  );
}
