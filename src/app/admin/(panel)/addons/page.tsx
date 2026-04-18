"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MenuAddon } from "@/types/menu";
import { useMenuData } from "@/contexts/menu-data-context";
import { persistMenuPayload } from "@/lib/persist-menu-client";

function newAddonId() {
  return `ga-${Date.now().toString(36)}`;
}

export default function AdminAddonsPage() {
  const { data, mutate } = useMenuData();
  const [rows, setRows] = useState<MenuAddon[]>([]);

  useEffect(() => {
    setRows(data?.globalAddons ?? []);
  }, [data?.globalAddons]);

  const save = async () => {
    if (!data) return;
    const cleaned = rows.filter((r) => r.name.trim().length > 0);
    try {
      await persistMenuPayload({ ...data, globalAddons: cleaned });
      await mutate();
      toast.success("Global add-ons saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const updateRow = (idx: number, patch: Partial<MenuAddon>) => {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: newAddonId(), name: "", price: 0 },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Global add-ons</h1>
        <p className="text-muted-foreground text-sm">
          Shown on the customer customise sheet for every dish.
        </p>
      </div>
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Price (₹)</TableHead>
              <TableHead className="w-24 text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Input
                    value={r.name}
                    onChange={(e) =>
                      updateRow(idx, { name: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={r.price || ""}
                    onChange={(e) =>
                      updateRow(idx, {
                        price: Number(e.target.value) || 0,
                      })
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addRow}>
            Add row
          </Button>
          <Button type="button" onClick={() => void save()}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
