"use client";

import { useState } from "react";
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
import { useMenuData } from "@/contexts/menu-data-context";
import { persistMenuPayload } from "@/lib/persist-menu-client";

export default function AdminCategoriesPage() {
  const { data, mutate } = useMenuData();
  const [name, setName] = useState("");

  const categories = data?.categories ?? [];
  const items = data?.items ?? [];

  const push = async (next: typeof data) => {
    if (!next) return;
    await persistMenuPayload(next);
    await mutate();
  };

  const add = async () => {
    const t = name.trim();
    if (!t || !data) return;
    if (data.categories.includes(t)) {
      toast.error("Category already exists");
      return;
    }
    await push({
      ...data,
      categories: [...data.categories, t],
    });
    setName("");
    toast.success("Category added");
  };

  const remove = async (c: string) => {
    if (!data) return;
    if (items.some((i) => i.category === c)) {
      toast.error("Remove or reassign items in this category first");
      return;
    }
    await push({
      ...data,
      categories: data.categories.filter((x) => x !== c),
    });
    toast.success("Category removed");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Categories</h1>
        <p className="text-muted-foreground text-sm">
          Used to group dishes on the customer menu.
        </p>
      </div>
      <div className="flex max-w-md gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <Button type="button" onClick={() => void add()}>
          Add
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((c) => (
            <TableRow key={c}>
              <TableCell className="font-medium">{c}</TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(c)}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
