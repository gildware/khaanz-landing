"use client";

import { use } from "react";

import { EmployeeProfileView } from "@/components/admin/employee-profile-view";

export default function AdminEmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <EmployeeProfileView
      employeeId={id}
      editHref={`/admin/payroll?edit=${encodeURIComponent(id)}`}
    />
  );
}
