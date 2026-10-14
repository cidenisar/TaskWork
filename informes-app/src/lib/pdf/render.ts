import { renderToBuffer } from "@react-pdf/renderer";
import { InformeTecnicoPdf, type InformePdfProps } from "./informe-tecnico";
import { RendicionGastosPdf, type RendicionPdfProps } from "./rendicion-gastos";
import { TableroPdf, type TableroPdfProps } from "./tablero";
import { RackPdf, type RackPdfProps } from "./rack";
import { TorreComunicacionPdf, type TorreComunicacionPdfProps } from "./torre-comunicacion";
import { EquipoPdf, type EquipoPdfProps } from "./equipo";
import { BajaPdf, type BajaPdfProps } from "./baja";
import { EntregaDepositoPdf, type EntregaDepositoPdfProps } from "./entrega-deposito";
import { SalaPdf, type SalaPdfProps } from "./sala";

export async function renderInformeTecnicoPdf(props: InformePdfProps): Promise<Buffer> {
  return renderToBuffer(InformeTecnicoPdf(props));
}

export async function renderRendicionGastosPdf(props: RendicionPdfProps): Promise<Buffer> {
  return renderToBuffer(RendicionGastosPdf(props));
}

export async function renderTableroPdf(props: TableroPdfProps): Promise<Buffer> {
  return renderToBuffer(TableroPdf(props));
}

export async function renderRackPdf(props: RackPdfProps): Promise<Buffer> {
  return renderToBuffer(RackPdf(props));
}

export async function renderTorreComunicacionPdf(props: TorreComunicacionPdfProps): Promise<Buffer> {
  return renderToBuffer(TorreComunicacionPdf(props));
}

export async function renderEquipoPdf(props: EquipoPdfProps): Promise<Buffer> {
  return renderToBuffer(EquipoPdf(props));
}

export async function renderBajaPdf(props: BajaPdfProps): Promise<Buffer> {
  return renderToBuffer(BajaPdf(props));
}

export async function renderEntregaDepositoPdf(props: EntregaDepositoPdfProps): Promise<Buffer> {
  return renderToBuffer(EntregaDepositoPdf(props));
}

export async function renderSalaPdf(props: SalaPdfProps): Promise<Buffer> {
  return renderToBuffer(SalaPdf(props));
}
