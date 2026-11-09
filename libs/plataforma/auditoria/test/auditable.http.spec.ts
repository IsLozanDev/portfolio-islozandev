import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ContextoTenantInterceptor, type SolicitudAutenticada } from '@vitrina/plataforma/seguridad';
import { AuditoriaModule } from '../src/auditoria.module.js';
import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';
import { CREAR_TABLA_VENTAS, VENTA_QUE_FALLA, VentasPruebaController } from './support/ventas-prueba.controller.js';

const TENANT = uuidV7();
const USUARIO = uuidV7();
const SUCURSAL = uuidV7();
const IP_LOCAL = /^(127\.0\.0\.1|::1)$/;

describeConDb('@Auditable (spec 20a)', () => {
  let entorno: EntornoAuditoria;
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    entorno = await crearEntornoAuditoria();
    await entorno.dataSource.query(CREAR_TABLA_VENTAS);
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: entorno.dataSource, validator: new InMemoryEventSchemaValidator() }),
        AuditoriaModule.registrarApi(),
      ],
      controllers: [VentasPruebaController],
      providers: [{ provide: APP_INTERCEPTOR, useFactory: (contexto: TenantContext) => new ContextoTenantInterceptor(contexto), inject: [TENANT_CONTEXT] }],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    // En lugar de AutenticacionGuard y PermisoGuard: el usuario y la sucursal ya verificados.
    app.use((solicitud: SolicitudAutenticada, _respuesta: unknown, seguir: () => void) => {
      solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT } as SolicitudAutenticada['principal'];
      solicitud.contexto = { tenantId: TENANT, sucursalId: SUCURSAL, unidadId: null, permisos: [] };
      seguir();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await entorno?.cerrar();
  });

  const nuevaVenta = async (id = `V-${uuidV7()}`) => {
    await entorno.dataSource.query(`INSERT INTO public.venta_prueba (id, estado) VALUES ($1, 'EMITIDA')`, [id]);
    return id;
  };
  const estadoDe = async (id: string) =>
    ((await entorno.dataSource.query(`SELECT estado FROM public.venta_prueba WHERE id = $1`, [id])) as { estado: string }[])[0]?.estado;
  const filasDe = async (id: string) => (await entorno.filas(TENANT)).filter((fila) => fila.entidad_id === id);

  it('200: deja la fila con acción, entidad, después, motivo, usuario, sucursal e IP, y la anulación confirmada', async () => {
    const id = await nuevaVenta();
    const res = await http().post(`/ventas/${id}/anular`).send({ motivo: 'cliente desistió' });

    expect(res.status).toBe(200);
    expect(await estadoDe(id)).toBe('ANULADA');
    const [fila] = await filasDe(id);
    expect(fila).toMatchObject({
      tipo: 'OPERACION',
      origen: 'DIRECTO',
      accion: 'rest.venta.anular',
      entidad_tipo: 'venta',
      entidad_id: id,
      antes: null,
      despues: { id, estado: 'ANULADA', tarjeta: '***' },
      motivo: 'cliente desistió',
      usuario_id: USUARIO,
      sucursal_id: SUCURSAL,
    });
    expect(fila.ip).toMatch(IP_LOCAL);
  });

  it('un motivo que no es texto no se guarda', async () => {
    const id = await nuevaVenta();
    await http().post(`/ventas/${id}/anular`).send({ motivo: { texto: 'x' } });
    expect((await filasDe(id))[0].motivo).toBeNull();
  });

  it('si el handler lanza, no hay fila ni cambio de negocio', async () => {
    const id = await nuevaVenta(VENTA_QUE_FALLA);
    const res = await http().post(`/ventas/${id}/anular`).send({ motivo: 'x' });

    expect(res.status).toBe(409);
    expect(await estadoDe(id)).toBe('EMITIDA');
    expect(await filasDe(id)).toHaveLength(0);
  });

  it('si la inserción de auditoría falla: 503 AUDITORIA_NO_DISPONIBLE y la anulación no quedó', async () => {
    const id = await nuevaVenta();
    const res = await http().post(`/ventas/${id}/anular-sin-auditoria`).send({});

    expect(res.status).toBe(503);
    expect(res.body.codigo).toBe('AUDITORIA_NO_DISPONIBLE');
    expect(await estadoDe(id)).toBe('EMITIDA');
    expect(await filasDe(id)).toHaveLength(0);
  });
});
