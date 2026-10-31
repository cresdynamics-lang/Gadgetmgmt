import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { loadSaleDocument, saleDocumentFileName, saleDocumentPdf } from "@/lib/sale-document";

/** The sale's receipt (or invoice while a balance remains) as a branded PDF, rebuilt from the saved sale. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "sales.view") && !hasPermission(session.user, "reports.view") && !hasPermission(session.user, "customers.view")) {
    return denied(session.user, "sales.view", "Your permissions cannot download receipts.");
  }
  const { id } = await params;
  const data = await loadSaleDocument(id, canSeeAllBranches(session.user) ? null : session.user.branchId ?? "");
  if (!data) return NextResponse.json({ error: "Sale was not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(saleDocumentPdf(data)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${saleDocumentFileName(data)}"`,
      "Cache-Control": "no-store",
    },
  });
}
