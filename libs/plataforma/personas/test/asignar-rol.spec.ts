import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import { ObtenerPersona } from '../src/application/obtener-persona.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { PersonaNoEncontradaError, ProductoNoSuscritoError } from '../src/domain/errores.js';
import { crearDobles, HOY_EN_LIMA, RelojFalso, TENANT_B, type Dobles } from './support/dobles.js';

const PERSONA_INEXISTENTE = '99999999-0000-4000-8000-000000000009';

describe('AsignarRolPersona', () => {
  let dobles: Dobles;
  let asignarRol: AsignarRolPersona;
  let personaId: string;

  const rolesDeLaPersona = async () => (await new ObtenerPersona(dobles).ejecutar(personaId)).roles;

  beforeEach(async () => {
    dobles = crearDobles();
    asignarRol = new AsignarRolPersona(dobles);
    const juana = await new RegistrarPersona(dobles).ejecutar({
      tipoPersona: 'NATURAL',
      tipoDocumento: 'DNI',
      numeroDocumento: '45781236',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      celular: '987654321',
    });
    personaId = juana.id;
    dobles.publicador.eventos.length = 0;
  });

  it('TR-CA-103: PACIENTE en CLI y SOCIO en GYM sobre una sola persona, con dos eventos', async () => {
    expect(await asignarRol.ejecutar({ personaId, productoCodigo: 'CLI', rol: 'PACIENTE' })).toEqual({ asignado: true });
    expect(await asignarRol.ejecutar({ personaId, productoCodigo: 'GYM', rol: 'SOCIO' })).toEqual({ asignado: true });

    expect(dobles.personas.guardadas).toHaveLength(1);
    expect(await rolesDeLaPersona()).toEqual([
      { productoCodigo: 'CLI', rol: 'PACIENTE', desde: HOY_EN_LIMA, hasta: null },
      { productoCodigo: 'GYM', rol: 'SOCIO', desde: HOY_EN_LIMA, hasta: null },
    ]);
    expect(dobles.publicador.tipos()).toEqual(['persona.rol_asignado', 'persona.rol_asignado']);
    expect(dobles.publicador.eventos[1].payload).toEqual({
      persona_id: personaId,
      producto_codigo: 'GYM',
      rol: 'SOCIO',
      desde: HOY_EN_LIMA,
    });
  });

  it('desde es la fecha de Lima, no la de UTC', async () => {
    // 03:00 UTC del 19 todavía es 18 a las 22:00 en Lima.
    dobles.reloj = new RelojFalso(new Date('2026-11-19T03:00:00Z'));
    asignarRol = new AsignarRolPersona(dobles);

    await asignarRol.ejecutar({ personaId, productoCodigo: 'CLI', rol: 'PACIENTE' });

    expect((await rolesDeLaPersona())[0].desde).toBe('2026-11-18');
  });

  it('un rol ya vigente responde asignado: false, sin fila nueva ni evento', async () => {
    await asignarRol.ejecutar({ personaId, productoCodigo: 'CLI', rol: 'PACIENTE' });

    const repetido = await asignarRol.ejecutar({ personaId, productoCodigo: 'CLI', rol: 'PACIENTE' });

    expect(repetido).toEqual({ asignado: false });
    expect(await rolesDeLaPersona()).toHaveLength(1);
    expect(dobles.publicador.tipos()).toEqual(['persona.rol_asignado']);
  });

  it('TR-CA-104: sin suscripción vigente de ECO → ProductoNoSuscritoError, sin rol ni evento', async () => {
    const asignarEnEco = asignarRol.ejecutar({ personaId, productoCodigo: 'ECO', rol: 'CLIENTE' });

    await expect(asignarEnEco).rejects.toBeInstanceOf(ProductoNoSuscritoError);
    await expect(asignarEnEco).rejects.toMatchObject({ code: 'PRODUCTO_NO_SUSCRITO', message: 'Producto no suscrito' });
    expect(await rolesDeLaPersona()).toEqual([]);
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it('una persona inexistente o de otro tenant → PersonaNoEncontradaError', async () => {
    const aInexistente = asignarRol.ejecutar({ personaId: PERSONA_INEXISTENTE, productoCodigo: 'CLI', rol: 'PACIENTE' });
    const desdeOtroTenant = dobles.contexto.run({ tenantId: TENANT_B }, () =>
      asignarRol.ejecutar({ personaId, productoCodigo: 'CLI', rol: 'PACIENTE' }),
    );

    await expect(aInexistente).rejects.toBeInstanceOf(PersonaNoEncontradaError);
    await expect(desdeOtroTenant).rejects.toBeInstanceOf(PersonaNoEncontradaError);
  });
});
