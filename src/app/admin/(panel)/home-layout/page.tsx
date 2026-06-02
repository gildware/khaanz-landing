import { HomeLayoutManager } from "@/components/admin/home-layout/home-layout-manager";

export default function AdminHomeLayoutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Home layout</h1>
        <p className="text-muted-foreground text-sm">
          Arrange which categories appear first, set item priority by dragging,
          and hide or show individual dishes on the storefront home page.
        </p>
      </div>
      <HomeLayoutManager />
    </div>
  );
}
