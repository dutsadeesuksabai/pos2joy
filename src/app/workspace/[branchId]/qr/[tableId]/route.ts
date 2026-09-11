import { toString as qrToString } from "qrcode";
import { requireBranch } from "@/features/tenancy/queries";
import { readGuestTable } from "@/features/orders/repository";

// Serves the table's QR code as SVG so staff can print it. Generated here rather
// than by a QR service, which would hand every table link to a third party.
export async function GET(_request: Request, { params }: { params: Promise<{ branchId: string; tableId: string }> }) {
  const { branchId, tableId } = await params;
  const branch = await requireBranch(branchId);
  const table = await readGuestTable(tableId);
  // A table from another branch is not found rather than rendered.
  if (!table || table.branchId !== branch.id || table.organizationId !== branch.organizationId) {
    return new Response("Not found", { status: 404 });
  }
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? new URL(_request.url).origin;
  const svg = await qrToString(`${origin}/t/${table.id}`, { type: "svg", margin: 1, width: 360, errorCorrectionLevel: "M" });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
}
