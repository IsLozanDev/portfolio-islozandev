import { EntitySchema } from 'typeorm';

// Mapeo ORM de las tablas de fe. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaEmisor {
  id: string;
  tenantId: string;
  empresaId: string;
  proveedor: string;
  ambiente: string;
  estado: string;
  regimenIgv: string;
  leyendaPie: string | null;
  usuarioProveedor: string | null;
  secretoCredencialId: string | null;
  secretoCertificadoId: string | null;
  secretoClaveCertificadoId: string | null;
  certificadoRuc: string | null;
  certificadoVenceEn: Date | null;
  certificadoHuellaSha256: string | null;
  urlProveedor: string | null;
  pruebasEnviadas: number;
  pruebaEstado: string | null;
  pruebaSolicitadaEn: Date | null;
  pruebaResultadoEn: Date | null;
  pruebaCodigo: string | null;
  pruebaDescripcion: string | null;
  produccionHabilitadaEn: Date | null;
  produccionHabilitadaPor: string | null;
  version: number;
  creadoPor: string;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date | null;
}

export interface FilaAvisoCertificado {
  id: string;
  tenantId: string;
  emisorId: string;
  huellaSha256: string;
  diasAntes: number;
  venceEn: Date;
  /** `date`: el driver la entrega como texto `YYYY-MM-DD`. */
  fechaEjecucion: string;
}

export const EmisorEntidad = new EntitySchema<FilaEmisor>({
  name: 'EmisorFe',
  schema: 'fe',
  tableName: 'emisor',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
    proveedor: { type: 'varchar', length: 40 },
    ambiente: { type: 'varchar', length: 10 },
    estado: { type: 'varchar', length: 12 },
    regimenIgv: { name: 'regimen_igv', type: 'varchar', length: 24 },
    leyendaPie: { name: 'leyenda_pie', type: 'varchar', length: 300, nullable: true },
    usuarioProveedor: { name: 'usuario_proveedor', type: 'varchar', length: 100, nullable: true },
    secretoCredencialId: { name: 'secreto_credencial_id', type: 'uuid', nullable: true },
    secretoCertificadoId: { name: 'secreto_certificado_id', type: 'uuid', nullable: true },
    secretoClaveCertificadoId: { name: 'secreto_clave_certificado_id', type: 'uuid', nullable: true },
    certificadoRuc: { name: 'certificado_ruc', type: 'char', length: 11, nullable: true },
    certificadoVenceEn: { name: 'certificado_vence_en', type: 'timestamptz', nullable: true },
    certificadoHuellaSha256: { name: 'certificado_huella_sha256', type: 'char', length: 64, nullable: true },
    urlProveedor: { name: 'url_proveedor', type: 'varchar', length: 255, nullable: true },
    pruebasEnviadas: { name: 'pruebas_enviadas', type: 'integer' },
    pruebaEstado: { name: 'prueba_estado', type: 'varchar', length: 12, nullable: true },
    pruebaSolicitadaEn: { name: 'prueba_solicitada_en', type: 'timestamptz', nullable: true },
    pruebaResultadoEn: { name: 'prueba_resultado_en', type: 'timestamptz', nullable: true },
    pruebaCodigo: { name: 'prueba_codigo', type: 'varchar', length: 20, nullable: true },
    pruebaDescripcion: { name: 'prueba_descripcion', type: 'varchar', length: 500, nullable: true },
    produccionHabilitadaEn: { name: 'produccion_habilitada_en', type: 'timestamptz', nullable: true },
    produccionHabilitadaPor: { name: 'produccion_habilitada_por', type: 'uuid', nullable: true },
    // La escribe el agregado: el UPDATE filtra por la anterior (bloqueo optimista).
    version: { type: 'integer' },
    creadoPor: { name: 'creado_por', type: 'uuid' },
    creadoEn: { name: 'creado_en', type: 'timestamptz' },
    modificadoPor: { name: 'modificado_por', type: 'uuid', nullable: true },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz', nullable: true },
  },
});

export const AvisoCertificadoEntidad = new EntitySchema<FilaAvisoCertificado>({
  name: 'AvisoCertificadoFe',
  schema: 'fe',
  tableName: 'aviso_certificado',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    emisorId: { name: 'emisor_id', type: 'uuid' },
    huellaSha256: { name: 'huella_sha256', type: 'char', length: 64 },
    diasAntes: { name: 'dias_antes', type: 'smallint' },
    venceEn: { name: 'vence_en', type: 'timestamptz' },
    fechaEjecucion: { name: 'fecha_ejecucion', type: 'date' },
  },
});

export const ENTIDADES_FE = [EmisorEntidad, AvisoCertificadoEntidad];
