import { redirect } from "next/navigation";

export default function AdminItemsRedirectPage() {
  redirect("/admin/menu?tab=items");
}
