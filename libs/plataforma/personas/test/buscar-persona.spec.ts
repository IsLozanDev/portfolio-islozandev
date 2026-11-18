import { CuotaAgotadaError, DocumentoNoEncontradoError, ProveedorNoDisponibleError } from '@vitrina/plataforma/identidad';
import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from '../src/application/buscar-persona.js';
import { ObtenerPersona } from '../src/application/obtener-persona.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { ServicioPersonas } from '../src/application/servicio-personas.js';
import { DocumentoInvalidoPersonaError, TipoDocumentoNoAdmitidoError } from '../src/domain/errores.js';
import { crearDobles, respuestaDni, respuestaRuc, TENANT_B, type Dobles } from './support/dobles.js';

const DNI_JUANA = '45781236';
const JUANA = {
  tipoPersona: 'NATURAL' as const,
  tipoDocumento: 'DNI',
  numeroDocumento: DNI_JUANA,
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  celular: '987654321',
};

describe('BuscarPersonaPorDocumento', () => {
  let dobles: Dobles;
  let buscar: BuscarPersonaPorDocumento;

  const buscarParaRegistrar = (tipo: string, numero: string) => buscar.ejecutar({ tipo, numero, puedePrellenar: true });

  beforeEach(() => {
    dobles = crearDobles();
    buscar = new BuscarPersonaPorDocumento(dobles);
  });

  it('TR-CA-100: DNI sin persona en el tenant → prellenado con nombres y apellidos separados', async () => {
    const resultado = await buscarParaRegistrar('DNI', DNI_JUANA);

    expect(resultado).toEqual({
      encontrada: false,
      prellenado: { nombres: 'Juana', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', razonSocial: null },
    });
    expect(dobles.identidad.consultas).toEqual([{ tipo: 'DNI', numero: DNI_JUANA, motivo: 'REGISTRO_CLIENTE' }]);
  });

  it('TR-CA-100: el prellenado alcanza para registrar a la persona', async () => {
    const resultado = await buscarParaRegistrar('DNI', DNI_JUANA);
    if (resultado.encontrada || resultado.prellenado === null) throw new Error('se esperaba prellenado');

    const registrada = await new RegistrarPersona(dobles).ejecutar({
      tipoPersona: 'NATURAL',
      tipoDocumento: 'DNI',
      numeroDocumento: DNI_JUANA,
      ...resultado.prellenado,
      celular: '987654321',
    });

    expect(registrada).toMatchObject({ nombres: 'Juana', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani' });
    expect(dobles.publicador.tipos()).toEqual(['persona.registrada']);
  });

  it('TR-CA-101: un DNI ya registrado → la persona, sin llamar a TR-IDN', async () => {
    const registrada = await new RegistrarPersona(dobles).ejecutar(JUANA);

    const resultado = await buscarParaRegistrar('DNI', DNI_JUANA);

    expect(resultado).toEqual({
      encontrada: true,
      persona: expect.objectContaining({ id: registrada.id, numeroDocumento: DNI_JUANA, nombres: 'Juana' }),
    });
    expect(dobles.identidad.consultas).toEqual([]);
  });

  it('la persona de otro tenant no cuenta como encontrada', async () => {
    await new RegistrarPersona(dobles).ejecutar(JUANA);

    const resultado = await dobles.contexto.run({ tenantId: TENANT_B }, () => buscarParaRegistrar('DNI', DNI_JUANA));

    expect(resultado.encontrada).toBe(false);
    expect(dobles.identidad.consultas).toHaveLength(1);
  });

  it.each([
    ['CE', '001234567'],
    ['PASAPORTE', 'AB123456'],
  ])('TR-CA-102: %s %s → prellenado nulo sin llamar a TR-IDN', async (tipo, numero) => {
    const resultado = await buscarParaRegistrar(tipo, numero);

    expect(resultado).toEqual({ encontrada: false, prellenado: null });
    expect(dobles.identidad.consultas).toEqual([]);
  });

  it('con plat.persona.leer y sin plat.persona.registrar no llama a TR-IDN', async () => {
    const resultado = await buscar.ejecutar({ tipo: 'DNI', numero: DNI_JUANA, puedePrellenar: false });

    expect(resultado).toEqual({ encontrada: false, prellenado: null });
    expect(dobles.identidad.consultas).toEqual([]);
  });

  it('RUC 20 → razón social', async () => {
    dobles.identidad.resultado = respuestaRuc('Supermercados Peruanos S.A.');

    const resultado = await buscarParaRegistrar('RUC', '20100070970');

    expect(resultado).toEqual({
      encontrada: false,
      prellenado: { nombres: null, apellidoPaterno: null, apellidoMaterno: null, razonSocial: 'Supermercados Peruanos S.A.' },
    });
  });

  it('RUC 10 → razón social como referencia, sin separar nombres', async () => {
    dobles.identidad.resultado = respuestaRuc('ROJAS PEREZ PEDRO');

    const resultado = await buscarParaRegistrar('RUC', '10467793549');

    expect(resultado).toMatchObject({ prellenado: { nombres: null, apellidoPaterno: null, razonSocial: 'ROJAS PEREZ PEDRO' } });
  });

  it.each([
    ['un solo apellido', 'Smith', 'Smith', null],
    ['apellido compuesto, mal partido a propósito', 'De la Cruz Rojas', 'De', 'la Cruz Rojas'],
    ['espacios de más', '  Quispe   Mamani ', 'Quispe', 'Mamani'],
    ['sin apellidos', '', null, null],
  ])('separa apellidos por el primer espacio: %s', async (_caso, apellidos, paterno, materno) => {
    dobles.identidad.resultado = respuestaDni('Ana', apellidos);

    const resultado = await buscarParaRegistrar('DNI', DNI_JUANA);

    expect(resultado).toMatchObject({ prellenado: { apellidoPaterno: paterno, apellidoMaterno: materno } });
  });

  it.each([
    ['proveedor caído', new ProveedorNoDisponibleError(), 'IDENTIDAD_NO_DISPONIBLE'],
    ['cuota agotada', new CuotaAgotadaError(), 'CUOTA_AGOTADA'],
    ['documento que el proveedor no conoce', new DocumentoNoEncontradoError(), 'NO_ENCONTRADO_EN_IDENTIDAD'],
  ])('TR-RNF-007: %s → prellenado nulo con aviso y el registro manual sigue', async (_caso, error, aviso) => {
    dobles.identidad.resultado = error;

    const resultado = await buscarParaRegistrar('DNI', DNI_JUANA);
    const registrada = await new RegistrarPersona(dobles).ejecutar(JUANA);

    expect(resultado).toEqual({ encontrada: false, prellenado: null, aviso });
    expect(registrada.numeroDocumento).toBe(DNI_JUANA);
  });

  it('un error inesperado de TR-IDN no se disfraza de aviso', async () => {
    dobles.identidad.resultado = new TypeError('fallo de programación');

    await expect(buscarParaRegistrar('DNI', DNI_JUANA)).rejects.toBeInstanceOf(TypeError);
  });

  it('documento inválido o tipo no admitido fallan antes de buscar', async () => {
    await expect(buscarParaRegistrar('DNI', '4578123A')).rejects.toBeInstanceOf(DocumentoInvalidoPersonaError);
    await expect(buscarParaRegistrar('DOC_0', '1')).rejects.toBeInstanceOf(TipoDocumentoNoAdmitidoError);
    expect(dobles.unidadDeTrabajo.transacciones).toBe(0);
  });

  it('la consulta a TR-IDN va fuera de la transacción de la búsqueda', async () => {
    let transaccionesAlConsultar = -1;
    const consultarReal = dobles.identidad.consultar.bind(dobles.identidad);
    dobles.identidad.consultar = (consulta) => {
      transaccionesAlConsultar = dobles.unidadDeTrabajo.enCurso;
      return consultarReal(consulta);
    };

    await buscarParaRegistrar('DNI', DNI_JUANA);

    expect(transaccionesAlConsultar).toBe(0);
  });
});

describe('ServicioPersonas (PersonaPort)', () => {
  let dobles: Dobles;
  let servicio: ServicioPersonas;

  beforeEach(() => {
    dobles = crearDobles();
    servicio = new ServicioPersonas({
      buscarPorDocumento: new BuscarPersonaPorDocumento(dobles),
      obtener: new ObtenerPersona(dobles),
      registrar: new RegistrarPersona(dobles),
      asignarRol: new AsignarRolPersona(dobles),
    });
  });

  it('registra, busca, obtiene y asigna un rol', async () => {
    const registrada = await servicio.registrar(JUANA);

    expect(await servicio.buscarPorDocumento('DNI', DNI_JUANA)).toMatchObject({ id: registrada.id });
    expect(await servicio.asignarRol({ personaId: registrada.id, productoCodigo: 'CLI', rol: 'PACIENTE' })).toEqual({
      asignado: true,
    });
    expect((await servicio.obtener(registrada.id)).roles).toHaveLength(1);
  });

  it('buscarPorDocumento devuelve null sin consultar TR-IDN', async () => {
    expect(await servicio.buscarPorDocumento('DNI', DNI_JUANA)).toBeNull();
    expect(dobles.identidad.consultas).toEqual([]);
  });
});
