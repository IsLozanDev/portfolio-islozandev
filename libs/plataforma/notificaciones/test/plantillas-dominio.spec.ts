import { ContenidoPlantillaInvalidoError, VariableNoPermitidaError, VersionObsoletaPlantillaError } from '../src/domain/errores.js';
import { exigirMarcadoresDeclarados, marcadoresUsados } from '../src/domain/marcadores-plantilla.js';
import {
  LARGO_MAXIMO_CUERPO,
  nuevaVersionPersonalizada,
  type ContenidoPersonalizado,
  type ContextoPersonalizacion,
} from '../src/domain/personalizacion-plantilla.js';
import { origenDe, type Plantilla } from '../src/domain/plantilla.js';
import { valoresDeEjemplo } from '../src/domain/valores-ejemplo.js';
import { AHORA, PLANTILLA_PRUEBA, TENANT_A } from './support/dobles.js';

const ACTOR = '43000000-0000-7000-8000-0000000000f1';
const ID_NUEVA = '43000000-0000-7000-8000-0000000000a1';

const contenido = (cambios: Partial<ContenidoPersonalizado> = {}): ContenidoPersonalizado => ({
  asunto: 'Hola desde {{producto}}',
  cuerpo: '<p>Hola {{ nombre }}, gracias por usar {{producto}}.</p>',
  version: null,
  ...cambios,
});

const contexto = (cambios: Partial<ContextoPersonalizacion> = {}): ContextoPersonalizacion => ({
  id: ID_NUEVA,
  tenantId: TENANT_A,
  creadoPor: ACTOR,
  ahora: AHORA,
  mayorVersionDelTenant: 0,
  ...cambios,
});

const personalizada = (version: number): Plantilla => ({
  ...PLANTILLA_PRUEBA,
  id: `43000000-0000-7000-8000-00000000000${version}`,
  tenantId: TENANT_A,
  version,
  plantillaBaseId: PLANTILLA_PRUEBA.id,
  creadoPor: ACTOR,
});

describe('marcadores de la plantilla', () => {
  it('lee los marcadores con o sin espacios dentro de las llaves, sin repetir', () => {
    expect(marcadoresUsados('{{nombre}} y {{ nombre }} con {{  producto }}')).toEqual(['nombre', 'producto']);
    expect(marcadoresUsados('sin marcadores { nombre } {{}}')).toEqual([]);
  });

  it('TR-CA-185: {{diagnostico}} no declarada → «Variable no permitida: diagnostico» con el nombre', () => {
    const llamada = () => exigirMarcadoresDeclarados(['Hola {{nombre}}', '<p>{{diagnostico}}</p>'], PLANTILLA_PRUEBA.variables);

    expect(llamada).toThrow(VariableNoPermitidaError);
    expect(llamada).toThrow('Variable no permitida: diagnostico');
    expect(capturar(llamada)).toMatchObject({ nombres: ['diagnostico'] });
  });

  it('acepta los marcadores declarados, también con espacios', () => {
    expect(() => exigirMarcadoresDeclarados(['{{ nombre }}', '{{producto}}'], PLANTILLA_PRUEBA.variables)).not.toThrow();
  });
});

describe('nueva versión personalizada', () => {
  it('la primera es la versión 1, copia código, nombre, canal, idioma y variables de la base y apunta a ella', () => {
    const nueva = nuevaVersionPersonalizada(PLANTILLA_PRUEBA, null, contenido(), contexto());

    expect(nueva).toEqual({
      id: ID_NUEVA,
      tenantId: TENANT_A,
      codigo: 'PRUEBA_CORREO',
      nombre: 'Correo de prueba',
      canal: 'CORREO',
      idioma: 'es',
      version: 1,
      asunto: 'Hola desde {{producto}}',
      cuerpo: '<p>Hola {{ nombre }}, gracias por usar {{producto}}.</p>',
      variables: PLANTILLA_PRUEBA.variables,
      plantillaBaseId: PLANTILLA_PRUEBA.id,
      activa: true,
      personalizable: true,
      creadoPor: ACTOR,
      creadoEn: AHORA,
    });
  });

  it('sobre una personalizada vigente numera n + 1 si el cliente leyó la versión vigente', () => {
    const nueva = nuevaVersionPersonalizada(PLANTILLA_PRUEBA, personalizada(2), contenido({ version: 2 }), contexto({ mayorVersionDelTenant: 2 }));

    expect(nueva.version).toBe(3);
  });

  it('tras restaurar la base sigue después de la mayor versión del tenant, no desde 1', () => {
    const nueva = nuevaVersionPersonalizada(PLANTILLA_PRUEBA, null, contenido({ version: null }), contexto({ mayorVersionDelTenant: 3 }));

    expect(nueva.version).toBe(4);
  });

  it.each([
    ['otra versión que la vigente', personalizada(2), 1],
    ['una versión sin personalización vigente', null, 2],
    ['null con personalización vigente', personalizada(2), null],
  ])('VERSION_OBSOLETA con %s', (_caso, vigente, version) => {
    expect(() => nuevaVersionPersonalizada(PLANTILLA_PRUEBA, vigente, contenido({ version }), contexto({ mayorVersionDelTenant: 2 }))).toThrow(
      VersionObsoletaPlantillaError,
    );
  });

  it.each([
    ['asunto vacío', { asunto: '   ' }, 'El asunto es obligatorio'],
    ['asunto de 151 caracteres', { asunto: 'a'.repeat(151) }, 'El asunto pasa de 150 caracteres'],
    ['asunto con salto de línea', { asunto: 'Hola\nmundo' }, 'El asunto debe ir en una sola línea'],
    ['cuerpo vacío', { cuerpo: '' }, 'El cuerpo es obligatorio'],
    ['cuerpo de más de 100 000 caracteres', { cuerpo: 'a'.repeat(LARGO_MAXIMO_CUERPO + 1) }, 'El cuerpo pasa de 100000 caracteres'],
  ])('CONTENIDO_PLANTILLA_INVALIDO con %s', (_caso, cambios, mensaje) => {
    const llamada = () => nuevaVersionPersonalizada(PLANTILLA_PRUEBA, null, contenido(cambios), contexto());

    expect(llamada).toThrow(ContenidoPlantillaInvalidoError);
    expect(llamada).toThrow(mensaje);
  });

  it('acepta asunto de 150 caracteres y cuerpo de 100 000', () => {
    const cambios = { asunto: 'a'.repeat(150), cuerpo: 'b'.repeat(LARGO_MAXIMO_CUERPO) };

    expect(() => nuevaVersionPersonalizada(PLANTILLA_PRUEBA, null, contenido(cambios), contexto())).not.toThrow();
  });

  it('TR-CA-185 al guardar: un marcador no declarado en el asunto o el cuerpo no deja crear la versión', () => {
    expect(() => nuevaVersionPersonalizada(PLANTILLA_PRUEBA, null, contenido({ cuerpo: '<p>{{diagnostico}}</p>' }), contexto())).toThrow(
      'Variable no permitida: diagnostico',
    );
    expect(() => nuevaVersionPersonalizada(PLANTILLA_PRUEBA, null, contenido({ asunto: 'Para {{dni}}' }), contexto())).toThrow(VariableNoPermitidaError);
  });
});

describe('valores de ejemplo y origen', () => {
  it('usa el ejemplo declarado o, si falta, [nombre]', () => {
    const variables = [
      { nombre: 'nombre', tipo: 'texto', ejemplo: 'María Quispe' },
      { nombre: 'enlace', tipo: 'texto' },
    ];

    expect(valoresDeEjemplo(variables)).toEqual({ nombre: 'María Quispe', enlace: '[enlace]' });
  });

  it('BASE sin tenant, PERSONALIZADA con tenant', () => {
    expect(origenDe(PLANTILLA_PRUEBA)).toBe('BASE');
    expect(origenDe(personalizada(1))).toBe('PERSONALIZADA');
  });
});

function capturar(llamada: () => void): unknown {
  try {
    llamada();
  } catch (error) {
    return error;
  }
  throw new Error('no lanzó');
}
