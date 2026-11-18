import { EventSchemaValidationError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { AnalizarArchivo } from '../src/application/analizar-archivo.js';
import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import { EVENTOS_ARC } from '../src/domain/eventos-arc.js';
import { ESQUEMAS_ARC, registrarEsquemasArc } from '../src/infrastructure/event-schemas.js';
import { pdf, texto } from './support/contenidos.js';
import { crearDobles } from './support/dobles.js';

// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
const NOMBRE_CON_DATOS_PERSONALES = 'dni-juana-quispe-45781236.pdf';

describe('eventos de archivos', () => {
  let validador: InMemoryEventSchemaValidator;

  beforeEach(() => {
    validador = new InMemoryEventSchemaValidator();
    registrarEsquemasArc(validador);
  });

  /** Un PDF limpio y otro con la firma EICAR, cargados y analizados. */
  async function eventosDeDosAnalisis(): Promise<DomainEvent[]> {
    const dobles = crearDobles();
    for (const contenido of [pdf(), Uint8Array.from([...pdf(), ...texto(CADENA_EICAR)])]) {
      const solicitada = await new SolicitarCarga(dobles).ejecutar({
        categoria: 'DOCUMENTO',
        nombreOriginal: NOMBRE_CON_DATOS_PERSONALES,
        tamano: contenido.byteLength,
        mime: 'application/pdf',
        entidadTipo: 'PRUEBA_SENSIBLE',
        entidadId: 'E-1',
      });
      dobles.almacen.subirConUrl(solicitada.carga.url, contenido);
      await new ConfirmarCarga(dobles).ejecutar(solicitada.archivoId);
    }
    for (const trabajo of dobles.cola.tomarTodos()) await new AnalizarArchivo(dobles).ejecutar(trabajo);
    return dobles.publicador.eventos;
  }

  it('cada evento de EVENTOS_ARC tiene esquema registrado', () => {
    expect(Object.keys(ESQUEMAS_ARC).sort()).toEqual(Object.values(EVENTOS_ARC).sort());
  });

  it('los eventos que publica el análisis cumplen su esquema', async () => {
    const eventos = await eventosDeDosAnalisis();

    expect(eventos.map((evento) => evento.eventType)).toEqual(['archivo.disponible', 'archivo.en_cuarentena']);
    for (const evento of eventos) expect(() => validador.validate(evento)).not.toThrow();
  });

  it('ningún payload lleva el nombre original', async () => {
    const payloads = JSON.stringify((await eventosDeDosAnalisis()).map((evento) => evento.payload));

    for (const dato of ['juana', 'quispe', '45781236', '.pdf']) expect(payloads).not.toContain(dato);
  });

  it('el esquema rechaza un payload con el nombre original', async () => {
    const [disponible] = await eventosDeDosAnalisis();
    const conNombre = { ...disponible, payload: { ...(disponible?.payload as object), nombre_original: NOMBRE_CON_DATOS_PERSONALES } };

    expect(() => validador.validate(conNombre as DomainEvent)).toThrow(EventSchemaValidationError);
  });
});
