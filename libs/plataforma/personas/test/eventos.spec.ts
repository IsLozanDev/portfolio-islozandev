import { EventSchemaValidationError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { ActualizarDatosBasicos } from '../src/application/actualizar-datos-basicos.js';
import { AgregarContacto } from '../src/application/agregar-contacto.js';
import { AgregarDireccion } from '../src/application/agregar-direccion.js';
import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { EVENTOS_PER } from '../src/domain/eventos-per.js';
import { ESQUEMAS_PER, registrarEsquemasPer } from '../src/infrastructure/event-schemas.js';
import { crearDobles, UBIGEO_CAYMA } from './support/dobles.js';

const DATOS_PERSONALES = ['45781236', 'Juana', 'Quispe', 'Mamani', '987654321', 'juana@vitrina.pe'];
const JUANA = {
  tipoPersona: 'NATURAL' as const,
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  celular: '987654321',
  correo: 'juana@vitrina.pe',
};

describe('eventos de personas', () => {
  let validador: InMemoryEventSchemaValidator;

  beforeEach(() => {
    validador = new InMemoryEventSchemaValidator();
    registrarEsquemasPer(validador);
  });

  async function eventosDeRegistrarYAsignar(): Promise<DomainEvent[]> {
    const dobles = crearDobles();
    const juana = await new RegistrarPersona(dobles).ejecutar(JUANA);
    await new AsignarRolPersona(dobles).ejecutar({ personaId: juana.id, productoCodigo: 'CLI', rol: 'PACIENTE' });
    return dobles.publicador.eventos;
  }

  it('cada evento de EVENTOS_PER tiene esquema registrado', () => {
    expect(Object.keys(ESQUEMAS_PER).sort()).toEqual(Object.values(EVENTOS_PER).sort());
  });

  it('los eventos que publican los casos de uso cumplen su esquema', async () => {
    const eventos = await eventosDeRegistrarYAsignar();

    expect(eventos.map((evento) => evento.eventType)).toEqual(['persona.registrada', 'persona.rol_asignado']);
    for (const evento of eventos) expect(() => validador.validate(evento)).not.toThrow();
  });

  it('ningún payload lleva número de documento, nombres ni contactos', async () => {
    const payloads = JSON.stringify((await eventosDeRegistrarYAsignar()).map((evento) => evento.payload));

    for (const dato of DATOS_PERSONALES) expect(payloads).not.toContain(dato);
  });

  it('persona.actualizada cumple su esquema con cada cambio y no lleva nombres, contactos, direcciones ni ubigeo', async () => {
    const dobles = crearDobles();
    const juana = await new RegistrarPersona(dobles).ejecutar(JUANA);
    dobles.publicador.eventos.length = 0;

    await new ActualizarDatosBasicos(dobles).ejecutar({ personaId: juana.id, version: juana.version, nombres: 'Juana María' });
    await new AgregarContacto(dobles).ejecutar({ personaId: juana.id, tipo: 'WHATSAPP', valor: '+51912345678' });
    await new AgregarDireccion(dobles).ejecutar({ personaId: juana.id, direccion: 'Av. Ejército 710', ubigeo: UBIGEO_CAYMA });

    const { eventos } = dobles.publicador;
    expect(eventos.map((evento) => [evento.eventType, evento.payload])).toEqual([
      ['persona.actualizada', { persona_id: juana.id, cambio: 'DATOS_BASICOS' }],
      ['persona.actualizada', { persona_id: juana.id, cambio: 'CONTACTO' }],
      ['persona.actualizada', { persona_id: juana.id, cambio: 'DIRECCION' }],
    ]);
    for (const evento of eventos) expect(() => validador.validate(evento)).not.toThrow();
  });

  it('el esquema de persona.actualizada rechaza un cambio fuera de lista o un dato de más', async () => {
    const dobles = crearDobles();
    const juana = await new RegistrarPersona(dobles).ejecutar(JUANA);
    await new AgregarContacto(dobles).ejecutar({ personaId: juana.id, tipo: 'WHATSAPP', valor: '+51912345678' });
    const actualizada = dobles.publicador.eventos[1];
    const conPayload = (payload: object) => ({ ...actualizada, payload });

    expect(() => validador.validate(conPayload({ persona_id: juana.id, cambio: 'ROL' }))).toThrow(EventSchemaValidationError);
    expect(() => validador.validate(conPayload({ persona_id: juana.id, cambio: 'CONTACTO', valor: '+51912345678' }))).toThrow(
      EventSchemaValidationError,
    );
  });

  it('persona.fusionada cumple su esquema y rechaza un dato de más', () => {
    const fusionada: DomainEvent = {
      eventType: EVENTOS_PER.fusionada,
      aggregateType: 'persona',
      aggregateId: '39000000-0000-4000-8000-0000000000a1',
      aggregateVersion: 3,
      schemaVersion: 1,
      occurredAt: new Date(),
      payload: {
        persona_conservada_id: '39000000-0000-4000-8000-0000000000a1',
        persona_absorbida_id: '39000000-0000-4000-8000-0000000000a2',
        fusion_id: '39000000-0000-4000-8000-0000000000f1',
      },
    };
    const conDocumento = { ...fusionada, payload: { ...(fusionada.payload as object), numero_documento: '45781236' } };

    expect(() => validador.validate(fusionada)).not.toThrow();
    expect(() => validador.validate(conDocumento)).toThrow(EventSchemaValidationError);
  });

  it('el esquema rechaza un payload con datos de más', async () => {
    const [registrada] = await eventosDeRegistrarYAsignar();
    const conDocumento = { ...registrada, payload: { ...(registrada.payload as object), numero_documento: '45781236' } };

    expect(() => validador.validate(conDocumento)).toThrow(EventSchemaValidationError);
  });
});
