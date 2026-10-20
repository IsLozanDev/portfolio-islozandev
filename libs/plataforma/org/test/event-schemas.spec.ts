import { EventSchemaValidationError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { Empresa } from '../src/domain/empresa.js';
import { Sucursal } from '../src/domain/sucursal.js';
import { Suscripcion } from '../src/domain/suscripcion.js';
import { Tenant } from '../src/domain/tenant.js';
import { UnidadOperativa } from '../src/domain/unidad-operativa.js';
import { ESQUEMAS_ORG, registrarEsquemasOrg } from '../src/infrastructure/event-schemas.js';
import { datosSucursal, empresa, sucursal } from './support/fabricas.js';

const ID = '0190a8e0-0000-7000-8000-000000000001';
const FECHA = new Date('2026-11-20T15:00:00Z');

/** Cada tipo de evento que levanta el dominio, producido por el dominio mismo. */
function eventosDelDominio(): DomainEvent[] {
  const tenant = Tenant.crear({ id: ID, codigo: 'polleria-dona-rosa', nombre: 'Pollería', estado: 'PRUEBA' });
  tenant.cambiarEstado('ACTIVO', 'Pago del primer mes', FECHA);
  tenant.cambiarEstado('SUSPENDIDO', 'Deuda de 60 días', FECHA);
  tenant.cambiarEstado('BAJA', 'Cliente cerró el negocio', FECHA);

  const datos = { edicion: null, plan: 'BASICO', estado: 'PRUEBA', limiteSucursales: 2, limiteUsuarios: null, vigenteHasta: '2026-12-31' } as const;
  const suscripcion = Suscripcion.crear(ID, ID, 'REST', datos, { sucursalesActivas: 0, usuariosActivos: 0 });

  const e = Empresa.crear(ID, ID, '20512345671', { razonSocial: 'Sabores del Sur SAC', nombreComercial: null, direccionFiscal: null, ubigeo: null });
  e.editar({ ...e.datos, nombreComercial: 'Sabores' });

  const s = Sucursal.crear('0190a8e0-0000-7000-8000-000000000102', empresa(), datosSucursal(), { activas: 0, tope: null });
  s.editar(datosSucursal({ nombre: 'Cayma Norte' }));
  s.inactivar();

  const u = UnidadOperativa.crear(ID, empresa(), null, 'ALMACEN', { codigo: 'ALM', nombre: 'Almacén', atributos: {} }, null);
  const caja = UnidadOperativa.crear(ID, empresa(), sucursal('0190a8e0-0000-7000-8000-000000000103'), 'CAJA', { codigo: 'C1', nombre: 'Caja 1', atributos: {} }, null);
  u.editar({ codigo: 'ALM', nombre: 'Almacén 2', atributos: {} }, null);
  u.inactivar();

  return [tenant, suscripcion, e, s, u, caja].flatMap((a) => a.pullEvents());
}

describe('Esquemas de eventos de org', () => {
  const validator = new InMemoryEventSchemaValidator();
  registrarEsquemasOrg(validator);
  const eventos = eventosDelDominio();

  it('el dominio levanta todos los tipos registrados', () => {
    expect(new Set(eventos.map((e) => e.eventType))).toEqual(new Set(Object.keys(ESQUEMAS_ORG)));
  });

  it.each(eventos.map((e) => [e.eventType, e] as const))('%s pasa su esquema', (_tipo, evento) => {
    expect(() => validator.validate(evento)).not.toThrow();
  });

  it('un payload con un campo de más se rechaza', () => {
    const [creado] = eventos;
    expect(() => validator.validate({ ...creado, payload: { ...(creado.payload as object), extra: 1 } })).toThrow(EventSchemaValidationError);
  });
});
