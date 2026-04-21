import { AdminNewOrderNotifier } from "@/components/admin/admin-new-order-notifier";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh]">
      <AdminSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminNewOrderNotifier />
        <div className="min-h-0 flex-1 overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}
