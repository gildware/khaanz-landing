import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmployeeDocumentKind } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isKind(x: unknown): x is EmployeeDocumentKind {
  return x === "ID_PROOF" || x === "ADDRESS_PROOF" || x === "CONTRACT" || x === "OTHER";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: employeeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  const kind = o.kind;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, 120) : "";
  const fileUrl = typeof o.fileUrl === "string" ? o.fileUrl.trim().slice(0, 500) : "";
  const note = typeof o.note === "string" ? o.note.trim() : "";

  if (!isKind(kind)) {
    return NextResponse.json({ error: "Invalid document kind." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Document title is required." }, { status: 400 });
  }

  const prisma = getPrisma();
  const created = await prisma.employeeDocument.create({
    data: { employeeId, kind, title, fileUrl, note },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: employeeId } = await params;
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId") ?? "";
  if (!docId) return NextResponse.json({ error: "docId is required." }, { status: 400 });

  const prisma = getPrisma();
  const doc = await prisma.employeeDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.employeeId !== employeeId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.employeeDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}

