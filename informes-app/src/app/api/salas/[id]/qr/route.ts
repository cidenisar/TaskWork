import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireProfile } from "@/lib/auth";

/**
 * QR que apunta al visor público de la sala (`/planos/sala/[id]`) — mismo
 * criterio que el QR de Tableros (ver /api/tableros/[id]/qr): la URL tiene
 * que ser estable para siempre porque se imprime y queda pegada en la
 * sala/shelter físico. Esta ruta en sí requiere login (generarlo para
 * imprimir), el visor en sí es el que queda público.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;

  const url = `${request.nextUrl.origin}/planos/sala/${id}`;
  const png = await QRCode.toBuffer(url, { type: "png", width: 600, margin: 2 });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="sala-${id}-qr.png"`,
      "Cache-Control": "no-store",
    },
  });
}
