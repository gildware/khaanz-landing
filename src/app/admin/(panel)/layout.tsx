import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh]">
      <AdminSidebar />
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}
