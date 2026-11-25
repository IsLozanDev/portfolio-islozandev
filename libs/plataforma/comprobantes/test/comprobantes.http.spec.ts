import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { ConsultarComprobante } from '../src/application/consultar-comprobante.js';
import { EmitirComprobante } from '../src/application/emitir-comprobante.js';
import { EmitirComprobanteAuditado } from '../src/application/emitir-comprobante-auditado.js';
import { PERMISOS_FE } from '../src/domain/permisos-fe.js';
import { ComprobantesController } from '../src/interface/comprobantes.controller.js';
import { EMPRESA, TENANT_A, USUARIO } from './support/dobles.js';
import { crearDoblesEmision, emisorEn, RUC_CLIENTE, SUCURSAL, type DoblesEmision } from './support/dobles-emision.js';

const MFA_MAX_EDAD_SEG = 900;
const RUTA = '/v1/fe/comprobantes';
const CLAVE = '0193f3a0-0000-7000-8000-00000000c1b1';
const cuerpoFactura = {
  tipo: 'FACTURA',
  empresa_id: EMPRESA,
  sucursal_id: SUCURSAL,
  moneda: 'PEN',
  forma_pago: 'CONTADO',
  adquirente: { tipo_documento: 'RUC', numero: RUC_CLIENTE, nombre: 'CLIENTE SAC', correo: 'compras@cliente.pe' },
  lineas: [
    { codigo: 'SKU-1', descripcion: 'Catering', unidad: 'ZZ', cantidad: '1', valor_unitario: '60.00', afectacion_igv: '10' },
    { descripcion: 'Bebidas', unidad: 'NIU', cantidad: '4', valor_unitario: '10', afectacion_igv: '10' },
  ],
  total_esperado: '118.00',
};

/** Hace lo que deja AutenticacionGuard: un usuario interno con aal1 (la caja emite sin step-up). */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/fe/comprobantes (TR-RF-053 y 054)', () => {
  let app: INestApplication;
  let dobles: DoblesEmision;
  let permisosDelActor: string[];
  let documento: OpenAPIObject;
  const http = () => request(app.getHttpServer());
  const emitir = (cuerpo: object, clave: string | null = CLAVE) => {
    const solicitud = http().post(RUTA).set('X-Sucursal-Id', SUCURSAL);
    return (clave === null ? solicitud : solicitud.set('Idempotency-Key', clave)).send(cuerpo);
  };

  beforeEach(async () => {
    dobles = crearDoblesEmision();
    permisosDelActor = [PERMISOS_FE.emitir];
    const emision = new EmitirComprobante(dobles);
    const modulo = await Test.createTestingModule({
      controllers: [ComprobantesController],
      providers: [
        {
          provide: EmitirComprobanteAuditado,
          useValue: new EmitirComprobanteAuditado({ unidadDeTrabajo: dobles.unidadDeTrabajo, auditoria: dobles.base.auditoria, emision }),
        },
        { provide: ConsultarComprobante, useValue: new ConsultarComprobante(dobles) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (permiso: string) => permiso === PERMISOS_FE.configurar } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(
      new PrincipalDePrueba(),
      new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG),
    );
    app.setGlobalPrefix('v1');
    await app.init();
    documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterEach(() => app?.close());

  it('TR-CA-136 y 138: 201 con F001-00000100; la misma clave → 200 repetido sin otro número ni otra auditoría', async () => {
    const emitido = await emitir(cuerpoFactura);
    expect(emitido.status).toBe(201);
    expect(emitido.body).toMatchObject({
      serie: 'F001',
      numero: 100,
      numero_formateado: 'F001-00000100',
      estado: 'PENDIENTE_ENVIO',
      totales: { gravado: '100.00', igv: '18.00', total: '118.00' },
      advertencias: [],
      repetido: false,
    });
    expect(dobles.base.auditoria.entradas).toHaveLength(1);

    const repetido = await emitir(cuerpoFactura);
    expect([repetido.status, repetido.body.repetido, repetido.body.comprobante_id]).toEqual([200, true, emitido.body.comprobante_id]);
    expect([dobles.seriesMemoria.ultimo('F001'), dobles.base.auditoria.entradas.length]).toEqual([100, 1]);

    const conflicto = await emitir({ ...cuerpoFactura, total_esperado: undefined });
    expect([conflicto.status, conflicto.body.codigo]).toEqual([409, 'IDEMPOTENCIA_CONFLICTO']);
  });

  it('GET devuelve el detalle con líneas y adquirente; un id inexistente o de otro tenant → 404', async () => {
    const { body } = await emitir(cuerpoFactura);
    const detalle = await http().get(`${RUTA}/${body.comprobante_id}`).set('X-Sucursal-Id', SUCURSAL);
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({
      tipo: 'FACTURA',
      fecha_emision: '2026-11-22',
      tasa_igv: '0.1800',
      adquirente: { tipo_documento: 'RUC', numero: RUC_CLIENTE, correo: 'compras@cliente.pe' },
      lineas: [
        { orden: 1, codigo: 'SKU-1', valor_venta: '60.00', igv: '10.80', precio_unitario: '70.8000' },
        { orden: 2, valor_venta: '40.00', igv: '7.20' },
      ],
      cuotas: [],
    });
    const ausente = await http().get(`${RUTA}/0193f3a0-0000-7000-8000-0000000000ff`).set('X-Sucursal-Id', SUCURSAL);
    expect([ausente.status, ausente.body.codigo]).toEqual([404, 'COMPROBANTE_NO_ENCONTRADO']);
    const sinUuid = await http().get(`${RUTA}/no-es-uuid`).set('X-Sucursal-Id', SUCURSAL);
    expect(sinUuid.status).toBe(400);
  });

  it('sin Idempotency-Key o sin formato uuid → 400; cuerpo inválido → 400 con los campos, sin valores', async () => {
    const sinClave = await emitir(cuerpoFactura, null);
    expect([sinClave.status, sinClave.body.codigo]).toEqual([400, 'SOLICITUD_INVALIDA']);
    expect((await emitir(cuerpoFactura, 'abc')).status).toBe(400);
    const invalido = await emitir({ ...cuerpoFactura, lineas: [{ ...cuerpoFactura.lineas[0], cantidad: '0' }], moneda: 'EUR' });
    expect(invalido.status).toBe(400);
    expect(invalido.body.errores).toEqual(expect.arrayContaining(['moneda', 'lineas.0.cantidad']));
    expect((await emitir({ ...cuerpoFactura, lineas: [] })).status).toBe(400);
    expect(dobles.seriesMemoria.pedidos).toBe(0);
  });

  it('errores normativos → 422 con su código; emisor no habilitado → 409; sucursal ajena → 404', async () => {
    const conDni = await emitir({ ...cuerpoFactura, adquirente: { tipo_documento: 'DNI', numero: '12345678', nombre: 'PERSONA' } });
    expect([conDni.status, conDni.body]).toEqual([422, { codigo: 'FACTURA_REQUIERE_RUC', mensaje: 'La factura requiere RUC del adquirente' }]);

    const boletaGrande = await emitir({
      tipo: 'BOLETA',
      empresa_id: EMPRESA,
      sucursal_id: SUCURSAL,
      moneda: 'PEN',
      forma_pago: 'CONTADO',
      lineas: [{ descripcion: 'Banquete', unidad: 'NIU', cantidad: '1', valor_unitario: '850', afectacion_igv: '20' }],
    });
    expect([boletaGrande.status, boletaGrande.body.codigo, boletaGrande.body.mensaje]).toEqual([
      422,
      'BOLETA_REQUIERE_ADQUIRENTE',
      'Boletas mayores a S/ 700,00 requieren documento y nombre del adquirente',
    ]);

    const afectacion = await emitir({ ...cuerpoFactura, lineas: [{ ...cuerpoFactura.lineas[0], afectacion_igv: '99' }] });
    expect([afectacion.status, afectacion.body.codigo]).toEqual([422, 'CODIGO_SUNAT_INVALIDO']);
    expect(afectacion.body.mensaje).toContain('lineas.0.afectacionIgv');

    const credito = await emitir({ ...cuerpoFactura, forma_pago: 'CREDITO' });
    expect([credito.status, credito.body.codigo]).toEqual([422, 'CUOTAS_INVALIDAS']);
    const total = await emitir({ ...cuerpoFactura, total_esperado: '120.00' });
    expect([total.status, total.body.codigo]).toEqual([422, 'TOTAL_NO_COINCIDE']);

    const ajena = await emitir({ ...cuerpoFactura, sucursal_id: '0193f3a0-0000-7000-8000-0000000000ee' });
    expect([ajena.status, ajena.body.codigo]).toEqual([404, 'SUCURSAL_NO_ENCONTRADA']);

    dobles.emisores.filas[0] = emisorEn('CONFIGURADO');
    const noHabilitado = await emitir(cuerpoFactura);
    expect([noHabilitado.status, noHabilitado.body.codigo]).toEqual([409, 'EMISOR_NO_HABILITADO']);
    expect([dobles.seriesMemoria.pedidos, dobles.base.auditoria.entradas.length]).toEqual([0, 0]);
  });

  it('sin plat.fe.emitir → 403 en las dos rutas; plat.fe.emitir no es sensible: aal1 alcanza', async () => {
    permisosDelActor = [PERMISOS_FE.consultar, PERMISOS_FE.configurar];
    expect((await emitir(cuerpoFactura)).status).toBe(403);
    expect((await http().get(`${RUTA}/0193f3a0-0000-7000-8000-0000000000ff`).set('X-Sucursal-Id', SUCURSAL)).status).toBe(403);
    expect(dobles.seriesMemoria.pedidos).toBe(0);
  });

  it('OpenAPI documenta las dos rutas con sus códigos de error, la cabecera y un ejemplo por tipo', () => {
    const post = documento.paths[RUTA].post;
    const get = documento.paths[`${RUTA}/{id}`].get;
    expect(Object.keys(post?.responses ?? {}).sort()).toEqual(['200', '201', '400', '401', '403', '404', '409', '422']);
    expect(Object.keys(get?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '404']);
    expect(post?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true })]));
    const ejemplos = (post?.requestBody as { content: Record<string, { examples?: object }> }).content['application/json'].examples;
    expect(Object.keys(ejemplos ?? {})).toEqual(['factura', 'boleta']);
    expect(JSON.stringify(post?.responses['422'])).toContain('BOLETA_REQUIERE_ADQUIRENTE');
  });
});
