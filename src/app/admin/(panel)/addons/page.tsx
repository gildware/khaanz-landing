import { redirect } from "next/navigation";

export default function AdminAddonsRedirectPage() {
  redirect("/admin/menu?tab=addons");
}
