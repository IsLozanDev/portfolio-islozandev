import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { ConsultarPlantilla } from '../src/application/plantillas/consultar-plantilla.js';
import { ListarPlantillas } from '../src/application/plantillas/listar-plantillas.js';
import { ListarVersionesPlantilla } from '../src/application/plantillas/listar-versiones-plantilla.js';
import { PersonalizarPlantilla } from '../src/application/plantillas/personalizar-plantilla.js';
import { RestaurarPlantillaBase } from '../src/application/plantillas/restaurar-plantilla-base.js';
import { VistaPreviaPlantilla } from '../src/application/plantillas/vista-previa-plantilla.js';
import {
  CanalNoHabilitadoError,
  ContenidoPlantillaInvalidoError,
  PlantillaBaseNoEncontradaError,
  SinPersonalizacionError,
  VariableNoPermitidaError,
  VersionObsoletaPlantillaError,
} from '../src/domain/errores.js';
import { escenario, PLANTILLA_PRUEBA, TENANT_A, TENANT_B } from './support/dobles.js';

const CODIGO = 'PRUEBA_CORREO';
const CORREO = 'CORREO';
const ACTOR = '43000000-0000-7000-8000-0000000000f1';
const CUERPO_PROPIO = '<p>Hola {{nombre}}, este es el correo propio de A en {{producto}}.</p>';

describe('casos de uso de plantillas (spec 43)', () => {
  let mundo: ReturnType<typeof escenario>;
  let personalizar: PersonalizarPlantilla;
  let consultar: ConsultarPlantilla;
  let restaurar: RestaurarPlantillaBase;

  const enA = <Resultado>(trabajo: () => Promise<Resultado>) => mundo.enTenant(TENANT_A, trabajo, ACTOR);
  const enB = <Resultado>(trabajo: () => Promise<Resultado>) => mundo.enTenant(TENANT_B, trabajo, ACTOR);
  const guardar = (version: number | null, cambios: { asunto?: string; cuerpo?: string } = {}) =>
    personalizar.ejecutar(CODIGO, CORREO, { asunto: 'Asunto de A {{producto}}', cuerpo: CUERPO_PROPIO, version, ...cambios });

  beforeEach(() => {
    mundo = escenario();
    personalizar = new PersonalizarPlantilla(mundo.gestionPlantillas);
    consultar = new ConsultarPlantilla(mundo.gestionPlantillas);
    restaurar = new RestaurarPlantillaBase(mundo.gestionPlantillas);
  });

  it('sin personalizar, el detalle es la base con version null y sus variables con ejemplo', async () => {
    const detalle = await enA(() => consultar.ejecutar(CODIGO, CORREO));

    expect(detalle).toMatchObject({ origen: 'BASE', version: null, asunto: PLANTILLA_PRUEBA.asunto, cuerpo: PLANTILLA_PRUEBA.cuerpo });
    expect(detalle.variables).toEqual(PLANTILLA_PRUEBA.variables);
    expect(detalle.base).toEqual({ asunto: PLANTILLA_PRUEBA.asunto, cuerpo: PLANTILLA_PRUEBA.cuerpo });
  });

  it('TR-CA-184: A personaliza; su siguiente envío usa la versión propia y B sigue con la base', async () => {
    const guardada = await enA(() => guardar(null));
    expect(guardada).toMatchObject({ origen: 'PERSONALIZADA', version: 1, cuerpo: CUERPO_PROPIO });

    const enviar = new EnviarNotificacion(mundo.envio);
    const comando = () => ({
      plantilla: CODIGO,
      destinatario: { correo: 'ana@ejemplo.pe' },
      variables: { nombre: 'Ana', producto: 'SazónPOS' },
      finalidad: 'TRANSACCIONAL' as const,
      claveIdempotencia: uuidV7(),
    });
    const deA = await enA(() => enviar.enviar(comando()));
    const deB = await enB(() => enviar.enviar(comando()));

    expect(mundo.mensajes.guardado(deA.mensajeId).instantanea()).toMatchObject({
      asunto: 'Asunto de A SazónPOS',
      cuerpo: '<p>Hola Ana, este es el correo propio de A en SazónPOS.</p>',
    });
    expect(mundo.mensajes.guardado(deB.mensajeId).instantanea()).toMatchObject({ asunto: 'Prueba de correo de SazónPOS' });
  });

  it('cada PUT crea una versión + 1 y desactiva la anterior; el historial lista todas sin texto', async () => {
    await enA(() => guardar(null));
    await enA(() => guardar(1));
    const tercera = await enA(() => guardar(2));

    expect(tercera.version).toBe(3);
    const historial = await enA(() => new ListarVersionesPlantilla(mundo.gestionPlantillas).ejecutar(CODIGO, CORREO));
    expect(historial.map(({ version, activa, creadoPor }) => [version, activa, creadoPor])).toEqual([
      [3, true, ACTOR],
      [2, false, ACTOR],
      [1, false, ACTOR],
    ]);
    expect(Object.keys(historial[0])).toEqual(['version', 'activa', 'creadoPor', 'creadoEn']);
  });

  it('VERSION_OBSOLETA con una versión que no es la vigente y no guarda nada', async () => {
    await enA(() => guardar(null));

    await expect(enA(() => guardar(null))).rejects.toThrow(VersionObsoletaPlantillaError);
    await expect(enA(() => guardar(5))).rejects.toThrow(VersionObsoletaPlantillaError);
    expect(mundo.plantillas.plantillas.filter((plantilla) => plantilla.tenantId === TENANT_A)).toHaveLength(1);
  });

  it('TR-CA-185: {{diagnostico}} no declarada no guarda versión', async () => {
    await expect(enA(() => guardar(null, { cuerpo: '<p>{{diagnostico}}</p>' }))).rejects.toThrow(VariableNoPermitidaError);
    expect(mundo.plantillas.plantillas).toHaveLength(1);
    expect(mundo.auditoria.entradas).toEqual([]);
  });

  it('TR-RNF-012: guarda el cuerpo saneado y lo devuelve; {{nombre}} en texto y href sobrevive', async () => {
    const cuerpo = '<p onclick="robar()">Hola {{nombre}}</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="{{nombre}}">y</a>';

    const guardada = await enA(() => guardar(null, { cuerpo }));

    const saneado = '<p>Hola {{nombre}}</p><a>x</a><a href="{{nombre}}">y</a>';
    expect(guardada.cuerpo).toBe(saneado);
    expect(mundo.plantillas.plantillas.find((plantilla) => plantilla.tenantId === TENANT_A)?.cuerpo).toBe(saneado);
  });

  it('un cuerpo que queda vacío tras sanear → CONTENIDO_PLANTILLA_INVALIDO', async () => {
    await expect(enA(() => guardar(null, { cuerpo: '<script>alert(1)</script>' }))).rejects.toThrow(ContenidoPlantillaInvalidoError);
  });

  it('código sin base → PLANTILLA_NO_ENCONTRADA; canal SMS → CANAL_NO_HABILITADO', async () => {
    await expect(enA(() => consultar.ejecutar('NO_EXISTE', CORREO))).rejects.toThrow(PlantillaBaseNoEncontradaError);
    await expect(enA(() => personalizar.ejecutar('NO_EXISTE', CORREO, { asunto: 'a', cuerpo: 'b', version: null }))).rejects.toThrow(
      PlantillaBaseNoEncontradaError,
    );
    await expect(enA(() => consultar.ejecutar(CODIGO, 'SMS'))).rejects.toThrow(CanalNoHabilitadoError);
    await expect(enA(() => restaurar.ejecutar(CODIGO, 'WHATSAPP'))).rejects.toThrow(CanalNoHabilitadoError);
  });

  it('restaurar desactiva las del tenant: rige la base, que no cambió, y al volver a personalizar sigue la numeración', async () => {
    await enA(() => guardar(null));
    await enA(() => guardar(1));

    await enA(() => restaurar.ejecutar(CODIGO, CORREO));

    expect(await enA(() => consultar.ejecutar(CODIGO, CORREO))).toMatchObject({ origen: 'BASE', version: null });
    expect(mundo.plantillas.plantillas[0]).toEqual(PLANTILLA_PRUEBA);
    await expect(enA(() => restaurar.ejecutar(CODIGO, CORREO))).rejects.toThrow(SinPersonalizacionError);
    expect((await enA(() => guardar(null))).version).toBe(3);
  });

  it('aislamiento: B no ve ni restaura la personalización de A', async () => {
    await enA(() => guardar(null));

    expect(await enB(() => consultar.ejecutar(CODIGO, CORREO))).toMatchObject({ origen: 'BASE' });
    await expect(enB(() => restaurar.ejecutar(CODIGO, CORREO))).rejects.toThrow(SinPersonalizacionError);
    expect(await enA(() => consultar.ejecutar(CODIGO, CORREO))).toMatchObject({ origen: 'PERSONALIZADA', version: 1 });
  });

  it('TR-RNF-013: personalizar y restaurar auditan versión antes y después, sin el texto', async () => {
    await enA(() => guardar(null));
    await enA(() => restaurar.ejecutar(CODIGO, CORREO));

    expect(mundo.auditoria.entradas).toEqual([
      {
        accion: 'plat.plantilla_notificacion.personalizar',
        entidadTipo: 'plantilla_notificacion',
        entidadId: 'PRUEBA_CORREO/CORREO',
        antes: { origen: 'BASE', version: 1, largo_asunto: PLANTILLA_PRUEBA.asunto?.length, largo_cuerpo: PLANTILLA_PRUEBA.cuerpo.length },
        despues: { origen: 'PERSONALIZADA', version: 1, largo_asunto: 'Asunto de A {{producto}}'.length, largo_cuerpo: CUERPO_PROPIO.length },
      },
      {
        accion: 'plat.plantilla_notificacion.restaurar',
        entidadTipo: 'plantilla_notificacion',
        entidadId: 'PRUEBA_CORREO/CORREO',
        antes: { origen: 'PERSONALIZADA', version: 1, largo_asunto: 'Asunto de A {{producto}}'.length, largo_cuerpo: CUERPO_PROPIO.length },
        despues: { origen: 'BASE', version: 1, largo_asunto: PLANTILLA_PRUEBA.asunto?.length, largo_cuerpo: PLANTILLA_PRUEBA.cuerpo.length },
      },
    ]);
    expect(JSON.stringify(mundo.auditoria.entradas)).not.toContain('correo propio');
  });

  it('lista una fila por código con la personalizada vigente y filtra por texto sin distinguir mayúsculas', async () => {
    await enA(() => guardar(null));
    const listar = new ListarPlantillas(mundo.gestionPlantillas);

    const deA = await enA(() => listar.ejecutar({ pagina: 1, tamano: 25 }));
    expect(deA).toMatchObject({ total: 1, items: [{ codigo: CODIGO, origen: 'PERSONALIZADA', version: 1 }] });
    expect((await enB(() => listar.ejecutar({ pagina: 1, tamano: 25 }))).items[0]).toMatchObject({ origen: 'BASE' });
    expect((await enA(() => listar.ejecutar({ q: 'prueba_c', pagina: 1, tamano: 25 }))).total).toBe(1);
    expect((await enA(() => listar.ejecutar({ q: 'no-coincide', pagina: 1, tamano: 25 }))).total).toBe(0);
    await expect(enA(() => listar.ejecutar({ canal: 'PUSH', pagina: 1, tamano: 25 }))).rejects.toThrow(CanalNoHabilitadoError);
  });

  describe('vista previa', () => {
    let previa: VistaPreviaPlantilla;
    beforeEach(() => {
      previa = new VistaPreviaPlantilla(mundo.gestionPlantillas);
    });

    it('renderiza la vigente con los valores de ejemplo y no registra mensaje ni llama al proveedor', async () => {
      const vista = await enA(() => previa.ejecutar(CODIGO, CORREO, {}));

      expect(vista).toEqual({ asunto: 'Prueba de correo de SazónPOS', cuerpoHtml: '<p>Hola María Quispe:</p><p>Prueba de SazónPOS.</p>' });
      expect(mundo.mensajes.filas.size).toBe(0);
      expect(mundo.proveedor.enviados).toEqual([]);
      expect(mundo.plantillas.plantillas).toHaveLength(1);
    });

    it('renderiza el texto recibido saneado, sin guardarlo', async () => {
      const vista = await enA(() => previa.ejecutar(CODIGO, CORREO, { cuerpo: '<p onclick="x()">Hola {{ nombre }}</p><script>1</script>' }));

      expect(vista.cuerpoHtml).toBe('<p>Hola María Quispe</p>');
      expect(vista.asunto).toBe('Prueba de correo de SazónPOS');
      expect(mundo.plantillas.plantillas).toHaveLength(1);
    });

    it('TR-CA-185 y contenido inválido, como al guardar', async () => {
      await expect(enA(() => previa.ejecutar(CODIGO, CORREO, { cuerpo: '{{diagnostico}}' }))).rejects.toThrow('Variable no permitida: diagnostico');
      await expect(enA(() => previa.ejecutar(CODIGO, CORREO, { asunto: 'Dos\nlíneas' }))).rejects.toThrow(ContenidoPlantillaInvalidoError);
    });
  });
});
