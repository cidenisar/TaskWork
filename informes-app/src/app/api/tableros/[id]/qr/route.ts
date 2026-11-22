import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireProfile } from "@/lib/auth";

/**
 * QR que apunta al visor público del plano (`/planos/tablero/[id]`) — se
 * imprime y pega en el tablero físico, así que la URL tiene que ser
 * estable para siempre (nunca un link firmado de storage, que vence).
 * Esta ruta en sí requiere login (es la acción de "generar para imprimir",
 * no el visor en sí, que es el que queda público).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;

  const url = `${request.nextUrl.origin}/planos/tablero/${id}`;
  const png = await QRCode.toBuffer(url, { type: "png", width: 600, margin: 2 });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="tablero-${id}-qr.png"`,
      "Cache-Control": "no-store",
    },
  });
}
