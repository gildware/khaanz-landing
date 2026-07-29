"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, PencilIcon, PlusIcon, UserPlusIcon } from "lucide-react";

import { PermissionTreeEditor } from "@/components/admin/permission-tree-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALL_ADMIN_PERMISSIONS,
  expandPermissionsForEditor,
  summarizePermissions,
  type AdminPermission,
} from "@/lib/admin-permissions";
import { cn } from "@/lib/utils";

type StaffUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  active: boolean;
  permissions: AdminPermission[];
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  email: string;
  password: string;
  displayName: string;
  role: "ADMIN" | "STAFF";
  permissions: AdminPermission[];
  active: boolean;
};

const emptyForm = (): FormState => ({
  email: "",
  password: "",
  displayName: "",
  role: "STAFF",
  permissions: ["orders", "pos"],
  active: true,
});

export default function AdminStaffPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff", { credentials: "include" });
      if (!res.ok) {
        toast.error("Could not load staff accounts");
        return;
      }
      const data = (await res.json()) as { users: StaffUser[] };
      setUsers(data.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (user: StaffUser) => {
    setEditing(user);
    setForm({
      email: user.email,
      password: "",
      displayName: user.displayName ?? "",
      role: user.role === "ADMIN" ? "ADMIN" : "STAFF",
      permissions:
        user.role === "SUPER_ADMIN"
          ? [...ALL_ADMIN_PERMISSIONS]
          : expandPermissionsForEditor(user.permissions),
      active: user.active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          displayName: form.displayName,
          active: form.active,
        };
        if (editing.role !== "SUPER_ADMIN") {
          body.role = form.role;
          body.permissions = form.permissions;
        }
        if (form.password.trim()) body.password = form.password.trim();

        const res = await fetch(`/api/admin/staff/${editing.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "Could not update account");
          return;
        }
        toast.success("Account updated");
      } else {
        const res = await fetch("/api/admin/staff", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            displayName: form.displayName,
            role: form.role,
            permissions: form.permissions,
            active: form.active,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "Could not create account");
          return;
        }
        toast.success("Staff account created");
      }
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (user: StaffUser) => {
    if (user.role === "SUPER_ADMIN") return;
    const res = await fetch(`/api/admin/staff/${user.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Could not deactivate");
      return;
    }
    toast.success("Account deactivated");
    await load();
  };

  const isSuperEdit = editing?.role === "SUPER_ADMIN";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff & logins</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create employee logins and choose exactly which menus and submenus
            they can open — for example Daily report only, or Inventory stock
            items without purchase orders.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="gap-2">
          <UserPlusIcon className="size-4" />
          Add staff
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-10">
          <Loader2Icon className="size-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-[320px] min-w-[240px]">Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={cn(!u.active && "opacity-60")}>
                  <TableCell className="font-medium align-top">
                    {u.displayName?.trim() || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs align-top">
                    {u.email}
                  </TableCell>
                  <TableCell className="capitalize text-sm align-top">
                    {u.role === "SUPER_ADMIN"
                      ? "Super admin"
                      : u.role === "STAFF"
                        ? "Staff"
                        : "Admin"}
                  </TableCell>
                  <TableCell className="w-[320px] min-w-[240px] max-w-[320px] align-top text-xs text-muted-foreground whitespace-normal break-words">
                    {u.role === "SUPER_ADMIN"
                      ? "Full access"
                      : summarizePermissions(u.permissions)}
                  </TableCell>
                  <TableCell className="align-top">
                    {u.active ? "Active" : "Inactive"}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => openEdit(u)}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      {u.active && u.role !== "SUPER_ADMIN" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-destructive"
                          onClick={() => void deactivate(u)}
                        >
                          Off
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(92dvh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="p-4 pb-2 shrink-0">
            <DialogTitle>
              {editing ? "Edit account" : "Add staff login"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update details, password, and menu permissions."
                : "They can sign in at /admin/login with this email and password."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 overflow-y-auto flex-1 min-h-0 space-y-4 pb-2">
            {!editing ? (
              <div className="space-y-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  autoComplete="off"
                />
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <span className="text-muted-foreground">Email</span>
                <p className="font-mono text-xs">{form.email}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="staff-name">Display name</Label>
              <Input
                id="staff-name"
                value={form.displayName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, displayName: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-password">
                {editing ? "New password (optional)" : "Password"}
              </Label>
              <Input
                id="staff-password"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
                autoComplete="new-password"
                placeholder={editing ? "Leave blank to keep current" : ""}
              />
            </div>

            {!isSuperEdit ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="staff-role">Role</Label>
                  <select
                    id="staff-role"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={form.role}
                    onChange={(e) => {
                      const role = e.target.value as "ADMIN" | "STAFF";
                      setForm((p) => ({
                        ...p,
                        role,
                        permissions:
                          role === "ADMIN"
                            ? [...ALL_ADMIN_PERMISSIONS]
                            : p.permissions,
                      }));
                    }}
                  >
                    <option value="STAFF">Staff (choose menus)</option>
                    <option value="ADMIN">Admin (all menus by default)</option>
                  </select>
                </div>

                <PermissionTreeEditor
                  value={form.permissions}
                  onChange={(permissions) =>
                    setForm((p) => ({ ...p, permissions }))
                  }
                />

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.active}
                    onCheckedChange={(v) =>
                      setForm((p) => ({ ...p, active: v === true }))
                    }
                  />
                  Account active
                </label>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Super admin always has full access. You can only change the
                display name or password here.
              </p>
            )}
          </div>
          <DialogFooter className="p-4 pt-2 border-t border-border shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
