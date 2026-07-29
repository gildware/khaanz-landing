import { AdminMobilePosRedirect } from "@/components/admin/admin-mobile-pos-redirect";
import { AdminNewOrderNotifier } from "@/components/admin/admin-new-order-notifier";
import { AdminSessionProvider } from "@/components/admin/admin-session-provider";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { loadAdminClientSession } from "@/lib/admin-session";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialUser = await loadAdminClientSession();

  return (
    <AdminSessionProvider initialUser={initialUser}>
      <AdminMobilePosRedirect>
        <div className="admin-panel-root flex h-dvh max-h-dvh overflow-hidden">
          <AdminSidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AdminNewOrderNotifier />
            <div className="admin-panel-content min-h-0 flex-1 overflow-auto p-6">{children}</div>
          </div>
        </div>
      </AdminMobilePosRedirect>
    </AdminSessionProvider>
  );
}
