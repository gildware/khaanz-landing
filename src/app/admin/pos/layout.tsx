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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {children}
    </div>
  );
}
