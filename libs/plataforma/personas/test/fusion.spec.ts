import { Contacto, type TipoContacto } from '../src/domain/contacto.js';
import { Direccion } from '../src/domain/direccion.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { MOTIVOS_DUPLICADO, ParPersonas, PUNTAJE_MINIMO, puntajeDe } from '../src/domain/duplicados.js';
import {
  CampoElegidoInvalidoError,
  DocumentosDistintosError,
  MismaPersonaError,
  MotivoFusionInvalidoError,
  PersonaYaFusionadaError,
  TipoPersonaDistintoError,
} from '../src/domain/errores.js';
import { errorDeFusion, validarMotivoFusion, type CamposElegidos } from '../src/domain/fusion.js';
import { Persona } from '../src/domain/persona.js';

const TENANT_ID = '39000000-0000-4000-8000-00000000000a';
const CONSERVADA_ID = '39000000-0000-4000-8000-0000000000a1';
const ABSORBIDA_ID = '39000000-0000-4000-8000-0000000000a2';
const FUSION_ID = '39000000-0000-4000-8000-0000000000f1';
const AHORA = new Date('2026-11-24T15:00:00Z');
const CAYMA = { distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const SIN_ELECCION: CamposElegidos = { datosBasicos: {}, principales: {} };

let siguienteId = 0;
const idNuevo = () => `39000000-0000-4000-8000-${String((siguienteId += 1)).padStart(12, '0')}`;

const contacto = (tipo: TipoContacto, valor: string, principal = false) => Contacto.crear({ id: idNuevo(), tipo, valor, principal });
const direccion = (texto: string, principal = false) =>
  Direccion.crear({ id: idNuevo(), direccion: texto, ubigeo: '040103', ubicacion: CAYMA, principal });

interface FichaNatural {
  id: string;
  documento: [string, string];
  nombres?: string;
  apellidoMaterno?: string | null;
  contactos: Contacto[];
}

function natural({ id, documento, nombres = 'Juana', apellidoMaterno = null, contactos }: FichaNatural): Persona {
  const persona = Persona.registrar({
    id,
    tenantId: TENANT_ID,
    tipoPersona: 'NATURAL',
    documento: DocumentoIdentidad.crear(...documento),
    nombres,
    apellidoPaterno: 'Quispe',
    apellidoMaterno,
    contactos,
  });
  persona.pullEvents();
  return persona;
}

/** TR-CA-107 con documento obligatorio: Juana con DNI y Juana con pasaporte, el mismo celular. */
function juanas() {
  const celularConservada = contacto('CELULAR', '987654321', true);
  const celularAbsorbida = contacto('CELULAR', '987654321', true);
  const conservada = natural({
    id: CONSERVADA_ID,
    documento: ['DNI', '45781236'],
    apellidoMaterno: 'Mamani',
    contactos: [celularConservada],
  });
  const absorbida = natural({
    id: ABSORBIDA_ID,
    documento: ['PASAPORTE', 'P1234567'],
    nombres: 'Juana Rosa',
    contactos: [celularAbsorbida],
  });
  return { conservada, absorbida, celularConservada, celularAbsorbida };
}

const principales = (persona: Persona, tipo: TipoContacto) =>
  persona.contactos.filter((uno) => uno.tipo === tipo && uno.principal).map((uno) => uno.id);

describe('duplicados', () => {
  it('ParPersonas ordena el par como per.par_descartado y rechaza la misma persona', () => {
    const par = ParPersonas.de(ABSORBIDA_ID.toUpperCase(), CONSERVADA_ID);

    expect(par).toMatchObject({ menor: CONSERVADA_ID, mayor: ABSORBIDA_ID });
    expect(ParPersonas.de(CONSERVADA_ID, ABSORBIDA_ID)).toEqual(par);
    expect(() => ParPersonas.de(CONSERVADA_ID, CONSERVADA_ID.toUpperCase())).toThrow(MismaPersonaError);
  });

  it('el puntaje es el mayor de los motivos y el mínimo para proponer es 60', () => {
    expect(puntajeDe(['CELULAR_Y_NOMBRE_PARECIDO', 'MISMO_NUMERO_OTRO_TIPO'])).toBe(100);
    expect(puntajeDe(['CELULAR_Y_NOMBRE_IGUAL'])).toBe(80);
    expect(puntajeDe(['CELULAR_Y_NOMBRE_PARECIDO'])).toBe(PUNTAJE_MINIMO);
    expect(puntajeDe([])).toBe(0);
    expect(MOTIVOS_DUPLICADO).toHaveLength(3);
  });
});

describe('bloqueos de fusión', () => {
  it('motivo de 5 a 300 caracteres, recortado', () => {
    expect(validarMotivoFusion('  Misma clienta  ')).toBe('Misma clienta');
    expect(() => validarMotivoFusion('  abcd ')).toThrow(MotivoFusionInvalidoError);
    expect(() => validarMotivoFusion('a'.repeat(301))).toThrow(expect.objectContaining({ code: 'MOTIVO_INVALIDO' }));
    expect(validarMotivoFusion('a'.repeat(300))).toHaveLength(300);
  });

  it('DNI con pasaporte se puede fusionar', () => {
    const { conservada, absorbida } = juanas();
    expect(errorDeFusion(conservada, absorbida)).toBeNull();
  });

  it('TR-CA-108: DNI distintos bloquean con «Las personas tienen documentos distintos»', () => {
    const conservada = natural({ id: CONSERVADA_ID, documento: ['DNI', '45781236'], contactos: [contacto('CELULAR', '987654321', true)] });
    const otra = natural({ id: ABSORBIDA_ID, documento: ['DNI', '45781237'], contactos: [contacto('CELULAR', '987654321', true)] });

    const error = errorDeFusion(conservada, otra);
    expect(error).toBeInstanceOf(DocumentosDistintosError);
    expect(error?.message).toBe('Las personas tienen documentos distintos');
    expect(() => conservada.absorber(otra, SIN_ELECCION, FUSION_ID)).toThrow(DocumentosDistintosError);
  });

  it('bloquea la misma ficha, natural con jurídica y una ya fusionada', () => {
    const { conservada, absorbida } = juanas();
    const empresa = Persona.registrar({
      id: idNuevo(),
      tenantId: TENANT_ID,
      tipoPersona: 'JURIDICA',
      documento: DocumentoIdentidad.crear('RUC', '20100070970'),
      razonSocial: 'Supermercados Peruanos S.A.',
      contactos: [contacto('CELULAR', '987654321', true)],
    });

    expect(errorDeFusion(conservada, conservada)).toBeInstanceOf(MismaPersonaError);
    expect(errorDeFusion(conservada, empresa)).toBeInstanceOf(TipoPersonaDistintoError);

    absorbida.marcarFusionada(CONSERVADA_ID, AHORA);
    expect(errorDeFusion(conservada, absorbida)).toEqual(expect.objectContaining({ code: 'PERSONA_FUSIONADA', conservadaId: CONSERVADA_ID }));
    expect(errorDeFusion(absorbida, conservada)).toBeInstanceOf(PersonaYaFusionadaError);
  });
});

describe('Persona.absorber', () => {
  it('TR-CA-107: una ficha con los datos de ambas y un solo persona.fusionada', () => {
    const { conservada, absorbida } = juanas();
    const correo = contacto('CORREO', 'juana@correo.pe', true);
    absorbida.agregarContacto(correo);
    absorbida.asignarRol('REST', 'CLIENTE', '2026-01-10');
    absorbida.pullEvents();
    const versionAntes = conservada.version;

    const resultado = conservada.absorber(absorbida, SIN_ELECCION, FUSION_ID);

    expect(conservada.documento).toMatchObject({ tipo: 'DNI', numero: '45781236' });
    expect(conservada.contactos.map((uno) => uno.valor)).toEqual(['987654321', 'juana@correo.pe']);
    expect(principales(conservada, 'CORREO')).toEqual([correo.id]);
    expect(conservada.roles).toEqual([{ productoCodigo: 'REST', rol: 'CLIENTE', desde: '2026-01-10', hasta: null }]);
    expect(resultado).toEqual({
      rolesMovidos: [{ productoCodigo: 'REST', rol: 'CLIENTE', desde: '2026-01-10', hasta: null }],
      rolesAdelantados: [],
      contactosMovidos: [correo.id],
      direccionesMovidas: [],
    });
    expect(conservada.version).toBe(versionAntes + 1);
    expect(conservada.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'persona.fusionada',
        aggregateType: 'persona',
        aggregateId: CONSERVADA_ID,
        payload: { persona_conservada_id: CONSERVADA_ID, persona_absorbida_id: ABSORBIDA_ID, fusion_id: FUSION_ID },
      }),
    ]);
  });

  it('datos básicos campo por campo; lo no elegido queda como en la conservada', () => {
    const { conservada, absorbida } = juanas();

    conservada.absorber(absorbida, { datosBasicos: { nombres: 'ABSORBIDA', apellidoMaterno: 'ABSORBIDA' }, principales: {} }, FUSION_ID);

    expect([conservada.nombres, conservada.apellidoPaterno, conservada.apellidoMaterno]).toEqual(['Juana Rosa', 'Quispe', null]);
  });

  it('un campo que no aplica al tipo de persona se rechaza sin cambiar nada', () => {
    const { conservada, absorbida } = juanas();

    expect(() => conservada.absorber(absorbida, { datosBasicos: { razonSocial: 'ABSORBIDA' }, principales: {} }, FUSION_ID)).toThrow(
      CampoElegidoInvalidoError,
    );
    expect(absorbida.contactos).toHaveLength(1);
    expect(conservada.pullEvents()).toEqual([]);
  });

  it('roles iguales no se duplican: la conservada toma el desde más antiguo y el repetido queda en la absorbida', () => {
    const { conservada, absorbida } = juanas();
    conservada.asignarRol('REST', 'CLIENTE', '2026-05-01');
    conservada.asignarRol('PSI', 'PACIENTE', '2026-02-01');
    absorbida.asignarRol('REST', 'CLIENTE', '2026-01-10');
    absorbida.asignarRol('PSI', 'PACIENTE', '2026-03-01');

    const resultado = conservada.absorber(absorbida, SIN_ELECCION, FUSION_ID);

    expect(conservada.roles.map((rol) => [rol.productoCodigo, rol.desde])).toEqual([
      ['REST', '2026-01-10'],
      ['PSI', '2026-02-01'],
    ]);
    expect(resultado.rolesMovidos).toEqual([]);
    expect(resultado.rolesAdelantados).toEqual([{ productoCodigo: 'REST', rol: 'CLIENTE', desde: '2026-01-10', hasta: null }]);
    expect(absorbida.roles).toHaveLength(2);
  });

  it('contactos y direcciones repetidos se quedan en la absorbida; lo demás pasa a la conservada', () => {
    const { conservada, absorbida, celularAbsorbida } = juanas();
    const casa = direccion('Av. Ejército 710', true);
    conservada.agregarDireccion(casa);
    const trabajo = direccion('Calle Mercaderes 120');
    absorbida.agregarDireccion(direccion('  AV.   Ejército 710 ', true));
    absorbida.agregarDireccion(trabajo);

    const resultado = conservada.absorber(absorbida, SIN_ELECCION, FUSION_ID);

    expect(resultado.contactosMovidos).toEqual([]);
    expect(absorbida.contactos.map((uno) => uno.id)).toEqual([celularAbsorbida.id]);
    expect(resultado.direccionesMovidas).toEqual([trabajo.id]);
    expect(conservada.direcciones.map((una) => [una.direccion, una.principal])).toEqual([
      ['Av. Ejército 710', true],
      ['Calle Mercaderes 120', false],
    ]);
  });

  it('el principal elegido de la absorbida queda como único principal de su tipo', () => {
    const { conservada, absorbida, celularConservada } = juanas();
    const otroCelular = contacto('CELULAR', '912345678', false);
    absorbida.agregarContacto(otroCelular);

    conservada.absorber(absorbida, { datosBasicos: {}, principales: { CELULAR: otroCelular.id } }, FUSION_ID);

    expect(principales(conservada, 'CELULAR')).toEqual([otroCelular.id]);
    expect(conservada.contactos.find((uno) => uno.id === celularConservada.id)?.principal).toBe(false);
  });

  it('un principal elegido que se quedó en la absorbida por repetido pasa a su igual de la conservada', () => {
    const { conservada, absorbida, celularConservada, celularAbsorbida } = juanas();
    conservada.agregarContacto(contacto('CELULAR', '912345678', true));

    conservada.absorber(absorbida, { datosBasicos: {}, principales: { CELULAR: celularAbsorbida.id } }, FUSION_ID);

    expect(principales(conservada, 'CELULAR')).toEqual([celularConservada.id]);
  });

  it('sin elección queda el principal de la conservada; si no tenía, el de la absorbida', () => {
    const { conservada, absorbida, celularConservada } = juanas();
    const fijo = contacto('FIJO', '054234567', true);
    absorbida.agregarContacto(fijo);
    const fijoConservada = contacto('FIJO', '054111222');
    conservada.agregarContacto(fijoConservada);

    conservada.absorber(absorbida, SIN_ELECCION, FUSION_ID);

    expect(principales(conservada, 'CELULAR')).toEqual([celularConservada.id]);
    expect(principales(conservada, 'FIJO')).toEqual([fijo.id]);
    for (const tipo of ['CELULAR', 'FIJO', 'CORREO', 'WHATSAPP'] as const) {
      expect(principales(conservada, tipo).length).toBeLessThanOrEqual(1);
    }
  });

  it('un principal que no es de ninguna de las dos fichas o es de otro tipo se rechaza sin mover nada', () => {
    const { conservada, absorbida, celularAbsorbida } = juanas();
    const correo = contacto('CORREO', 'juana@correo.pe');
    absorbida.agregarContacto(correo);

    expect(() =>
      conservada.absorber(absorbida, { datosBasicos: {}, principales: { CORREO: celularAbsorbida.id } }, FUSION_ID),
    ).toThrow(expect.objectContaining({ code: 'CAMPO_ELEGIDO_INVALIDO' }));
    expect(() => conservada.absorber(absorbida, { datosBasicos: {}, principales: { DIRECCION: idNuevo() } }, FUSION_ID)).toThrow(
      CampoElegidoInvalidoError,
    );
    expect(absorbida.contactos).toHaveLength(2);
    expect(conservada.contactos).toHaveLength(1);
  });
});

describe('Persona.marcarFusionada', () => {
  it('queda inactiva como alias, sube la versión sin evento y no admite cambios', () => {
    const { absorbida } = juanas();
    const versionAntes = absorbida.version;

    absorbida.marcarFusionada(CONSERVADA_ID, AHORA);

    expect(absorbida.activo).toBe(false);
    expect(absorbida.fusion).toEqual({ conservadaId: CONSERVADA_ID, fusionadaEn: AHORA });
    expect(absorbida.version).toBe(versionAntes + 1);
    expect(absorbida.pullEvents()).toEqual([]);
    const cambios = [
      () => absorbida.cambiarDatosBasicos({ nombres: 'Rosa' }),
      () => absorbida.agregarContacto(contacto('CORREO', 'rosa@correo.pe')),
      () => absorbida.asignarRol('REST', 'CLIENTE', '2026-11-24'),
      () => absorbida.agregarDireccion(direccion('Calle Mercaderes 120')),
      () => absorbida.marcarFusionada(ABSORBIDA_ID, AHORA),
    ];
    for (const cambio of cambios) expect(cambio).toThrow(expect.objectContaining({ code: 'PERSONA_FUSIONADA', conservadaId: CONSERVADA_ID }));
  });

  it('reconstituir conserva el alias', () => {
    const { absorbida } = juanas();
    absorbida.marcarFusionada(CONSERVADA_ID, AHORA);

    const leida = Persona.reconstituir(absorbida.id, absorbida.version, {
      tenantId: TENANT_ID,
      tipoPersona: 'NATURAL',
      documento: absorbida.documento,
      nombres: absorbida.nombres,
      apellidoPaterno: absorbida.apellidoPaterno,
      apellidoMaterno: null,
      razonSocial: null,
      activo: false,
      roles: [],
      contactos: [],
      direcciones: [],
      fusion: absorbida.fusion,
    });

    expect(leida.fusion).toEqual({ conservadaId: CONSERVADA_ID, fusionadaEn: AHORA });
    expect(() => leida.eliminarDireccion(idNuevo())).toThrow(PersonaYaFusionadaError);
  });
});
