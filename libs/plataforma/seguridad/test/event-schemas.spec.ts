import { EventSchemaValidationError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { Asignacion } from '../src/domain/asignacion.js';
import { EVENTOS_SEG } from '../src/domain/eventos.js';
import { Membresia } from '../src/domain/membresia.js';
import { Perfil } from '../src/domain/perfil.js';
import { Rol } from '../src/domain/rol.js';
import { ESQUEMAS_SEG, registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';

const ID = '0193f3a0-0000-7000-8000-000000000001';
const OTRO = '0193f3a0-0000-7000-8000-000000000002';
const catalogo = [{ codigo: 'rest.mesa.ver', productoCodigo: 'REST', alcanceMinimo: 'UNIDAD' as const, sensible: false, obsoleto: false }];

/** Cada tipo de evento que levanta el dominio, producido por el dominio mismo. */
function eventosDelDominio(): DomainEvent[] {
  const rol = Rol.crear(ID, ID, 'REST', { codigo: 'MOZO', nombre: 'Mozo' }, [], catalogo);
  rol.cambiarPermisos(['rest.mesa.ver'], catalogo);
  rol.inactivar(3);
  const copia = Rol.copiarDe(OTRO, ID, Rol.reconstituir(OTRO, 1, { tenantId: null, productoCodigo: 'REST', codigo: 'REST_MOZO', nombre: 'Mozo', activo: true, obsoleto: false, permisos: [] }), {
    codigo: 'COPIA',
    nombre: 'Copia',
  });
  const activo = Rol.reconstituir(OTRO, 1, { tenantId: ID, productoCodigo: 'PLAT', codigo: 'ADM', nombre: 'Admin', activo: true, obsoleto: false, permisos: [] });
  const perfil = Perfil.crear(ID, ID, { codigo: 'ENCARGADO', nombre: 'Encargado' }, [activo], []);
  perfil.cambiarRoles([Rol.reconstituir(ID, 1, { tenantId: ID, productoCodigo: 'PLAT', codigo: 'OTRO', nombre: 'Otro', activo: true, obsoleto: false, permisos: [] })], []);
  const asignacion = Asignacion.otorgar(
    ID,
    ID,
    { membresiaId: ID, rolId: ID, perfilId: null, alcance: 'SUCURSAL', empresaId: null, sucursalId: OTRO, unidadId: null, vigenteHasta: null },
    { hoy: '2026-10-21', otorgadoPor: ID, permisos: [] },
  );
  asignacion.revocar('Cambio de puesto', OTRO, new Date());
  const ahora = new Date('2026-10-22T15:00:00Z');
  const membresia = Membresia.invitar(OTRO, { usuarioId: ID, tenantId: ID, invitadoPor: OTRO }, ahora, ahora);
  membresia.aceptar(ahora);
  membresia.suspender('Licencia médica', OTRO, ahora);
  membresia.reactivar('Fin de licencia', OTRO, ahora);
  membresia.finalizar('Fin de contrato', OTRO, ahora, [ID]);
  return [rol, copia, perfil, asignacion, membresia].flatMap((a) => a.pullEvents());
}

describe('Esquemas de eventos de seg', () => {
  const validator = new InMemoryEventSchemaValidator();
  registrarEsquemasSeg(validator);

  it('hay un esquema por cada evento de EVENTOS_SEG', () => {
    expect(Object.keys(ESQUEMAS_SEG).sort()).toEqual(Object.values(EVENTOS_SEG).sort());
  });

  it('cada evento que emite el dominio pasa su esquema', () => {
    const eventos = eventosDelDominio();
    expect(new Set(eventos.map((ev) => ev.eventType))).toEqual(new Set(Object.values(EVENTOS_SEG)));
    for (const evento of eventos) expect(() => validator.validate(evento)).not.toThrow();
  });

  it('rechaza un payload con campos de más', () => {
    const [evento] = eventosDelDominio();
    expect(() => validator.validate({ ...evento, payload: { ...(evento.payload as object), extra: 1 } })).toThrow(EventSchemaValidationError);
  });
});
