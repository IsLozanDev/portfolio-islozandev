import { EventSchemaValidationError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { EVENTOS_PER } from '../src/domain/eventos-per.js';
import { ESQUEMAS_PER, registrarEsquemasPer } from '../src/infrastructure/event-schemas.js';
import { crearDobles } from './support/dobles.js';

const DATOS_PERSONALES = ['45781236', 'Juana', 'Quispe', 'Mamani', '987654321', 'juana@vitrina.pe'];

describe('eventos de personas', () => {
  let validador: InMemoryEventSchemaValidator;

  beforeEach(() => {
    validador = new InMemoryEventSchemaValidator();
    registrarEsquemasPer(validador);
  });

  async function eventosDeRegistrarYAsignar(): Promise<DomainEvent[]> {
    const dobles = crearDobles();
    const juana = await new RegistrarPersona(dobles).ejecutar({
      tipoPersona: 'NATURAL',
      tipoDocumento: 'DNI',
      numeroDocumento: '45781236',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      celular: '987654321',
      correo: 'juana@vitrina.pe',
    });
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

  it('el esquema rechaza un payload con datos de más', async () => {
    const [registrada] = await eventosDeRegistrarYAsignar();
    const conDocumento = { ...registrada, payload: { ...(registrada.payload as object), numero_documento: '45781236' } };

    expect(() => validador.validate(conDocumento)).toThrow(EventSchemaValidationError);
  });
});
