import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadTenancyFor, renderAgreementPdf } from "@/lib/tenancy";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const data = await loadTenancyFor(user, id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await renderAgreementPdf(data);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="FindEkifo-agreement-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
