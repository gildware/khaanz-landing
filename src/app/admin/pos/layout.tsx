import { AdminNewOrderNotifier } from "@/components/admin/admin-new-order-notifier";
import { AdminSessionProvider } from "@/components/admin/admin-session-provider";

/**
 * Standalone POS layout — no admin sidebar so the register can use the full viewport.
 * Opened from the sidebar via target=_blank.
 */
export default function AdminPosStandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSessionProvider>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
        <AdminNewOrderNotifier />
        {children}
      </div>
    </AdminSessionProvider>
  );
}
