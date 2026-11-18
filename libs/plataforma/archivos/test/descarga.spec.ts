import { AnalizarArchivo } from '../src/application/analizar-archivo.js';
import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import { EmitirUrlDescarga } from '../src/application/emitir-url-descarga.js';
import type { SolicitarCargaComando } from '../src/application/ports/archivo.port.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import { AccesoEntidadDenegadoError, ArchivoNoDisponibleError, ArchivoNoEncontradoError, VigenciaInvalidaError } from '../src/domain/errores.js';
import { UrlFirmadaRechazadaError } from '../src/infrastructure/memoria/almacen-archivos.memoria.js';
import { ejecutable, pdf, png, texto } from './support/contenidos.js';
import { AutorizadorFijo, crearDobles, ENTIDAD_CON_AUTORIZADOR, TENANT_B, USUARIO, type Dobles } from './support/dobles.js';

// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
const pdfInfectado = (): Uint8Array => Uint8Array.from([...pdf(), ...texto(CADENA_EICAR)]);
const IMAGEN: Partial<SolicitarCargaComando> = { categoria: 'IMAGEN', mime: 'image/png', nombreOriginal: 'logo.png', entidadTipo: 'PRODUCTO' };

describe('EmitirUrlDescarga', () => {
  let dobles: Dobles;
  let emitir: EmitirUrlDescarga;

  beforeEach(() => {
    dobles = crearDobles();
    emitir = new EmitirUrlDescarga(dobles);
  });

  async function solicitar(contenido: Uint8Array, cambios: Partial<SolicitarCargaComando> = {}): Promise<string> {
    const solicitada = await new SolicitarCarga(dobles).ejecutar({
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      tamano: contenido.byteLength,
      mime: 'application/pdf',
      entidadTipo: ENTIDAD_CON_AUTORIZADOR,
      entidadId: 'E-1',
      ...cambios,
    });
    dobles.almacen.subirConUrl(solicitada.carga.url, contenido);
    return solicitada.archivoId;
  }

  /** Solicita, sube, confirma y analiza: según el contenido queda DISPONIBLE, RECHAZADO o en CUARENTENA. */
  async function cargarYAnalizar(contenido: Uint8Array, cambios: Partial<SolicitarCargaComando> = {}): Promise<string> {
    const archivoId = await solicitar(contenido, cambios);
    await new ConfirmarCarga(dobles).ejecutar(archivoId);
    for (const trabajo of dobles.cola.tomarTodos()) await new AnalizarArchivo(dobles).ejecutar(trabajo);
    return archivoId;
  }

  it('TR-CA-204: DOCUMENTO de una entidad con autorizador que permite → URL de 15 minutos y una fila de auditoría', async () => {
    const autorizador = new AutorizadorFijo();
    dobles.autorizadores.push(autorizador);
    const archivoId = await cargarYAnalizar(pdf());

    const descarga = await emitir.ejecutar({ archivoId });

    expect(descarga.expiraEn).toEqual(new Date('2026-11-18T15:15:00.000Z'));
    expect(dobles.almacen.descargarConUrl(descarga.url)).toEqual(pdf());
    expect(autorizador.consultas).toContainEqual(['leer', 'E-1']);
    expect(dobles.auditoria.entradas).toEqual([
      {
        accion: 'plat.archivo.descargar',
        entidadTipo: 'ARCHIVO',
        entidadId: archivoId,
        despues: { categoria: 'DOCUMENTO', entidad_tipo: ENTIDAD_CON_AUTORIZADOR, entidad_id: 'E-1', disposicion: 'attachment' },
      },
    ]);
  });

  it('firma fuera de la transacción y audita después, dentro de una', async () => {
    const archivoId = await cargarYAnalizar(pdf());

    await emitir.ejecutar({ archivoId });

    expect(dobles.almacen.descargasFirmadasEnTransaccion).toEqual([false]);
    expect(dobles.auditoria.registradasEnTransaccion).toEqual([true]);
    expect(dobles.unidadDeTrabajo.enCurso).toBe(0);
  });

  it('la auditoría no lleva el nombre original ni la URL', async () => {
    const archivoId = await cargarYAnalizar(pdf());

    const { url } = await emitir.ejecutar({ archivoId });

    const registrado = JSON.stringify(dobles.auditoria.entradas);
    expect(registrado).not.toContain('contrato');
    expect(registrado).not.toContain(url);
  });

  it('TR-CA-206: la URL usada 16 minutos después se rechaza por expirada', async () => {
    const archivoId = await cargarYAnalizar(pdf());
    const { url } = await emitir.ejecutar({ archivoId });

    dobles.reloj.adelantarMinutos(16);

    expect(() => dobles.almacen.descargarConUrl(url)).toThrow(UrlFirmadaRechazadaError);
    expect(() => dobles.almacen.descargarConUrl(url)).toThrow('EXPIRADA');
  });

  it('por defecto y con attachment la URL descarga con el nombre original; con inline, sin nombre', async () => {
    const archivoId = await cargarYAnalizar(pdf());

    const porDefecto = await emitir.ejecutar({ archivoId });
    const comoAdjunto = await emitir.ejecutar({ archivoId, disposicion: 'attachment' });
    const enLinea = await emitir.ejecutar({ archivoId, disposicion: 'inline' });

    expect(new URL(porDefecto.url).searchParams.get('download')).toBe('contrato.pdf');
    expect(new URL(comoAdjunto.url).searchParams.get('download')).toBe('contrato.pdf');
    expect(new URL(enLinea.url).searchParams.has('download')).toBe(false);
    expect(dobles.auditoria.entradas.map((entrada) => (entrada.despues as { disposicion: string }).disposicion)).toEqual([
      'attachment',
      'attachment',
      'inline',
    ]);
  });

  it('sin vigencia la URL vale 900 s; con 60 s expira al minuto', async () => {
    const archivoId = await cargarYAnalizar(pdf());

    const maxima = await emitir.ejecutar({ archivoId });
    const minima = await emitir.ejecutar({ archivoId, vigenciaSegundos: 60 });

    expect(maxima.expiraEn).toEqual(new Date('2026-11-18T15:15:00.000Z'));
    expect(minima.expiraEn).toEqual(new Date('2026-11-18T15:01:00.000Z'));
    dobles.reloj.adelantarMinutos(1);
    expect(() => dobles.almacen.descargarConUrl(minima.url)).toThrow('EXPIRADA');
    expect(dobles.almacen.descargarConUrl(maxima.url)).toEqual(pdf());
  });

  it.each([901, 59])('vigencia de %i segundos → VIGENCIA_INVALIDA, sin firma ni auditoría', async (vigenciaSegundos) => {
    const archivoId = await cargarYAnalizar(pdf());

    await expect(emitir.ejecutar({ archivoId, vigenciaSegundos })).rejects.toThrow(VigenciaInvalidaError);

    expect(dobles.almacen.descargasFirmadasEnTransaccion).toEqual([]);
    expect(dobles.auditoria.entradas).toEqual([]);
  });

  it('un archivo pendiente de carga o en análisis → ARCHIVO_NO_DISPONIBLE con su estado', async () => {
    const archivoId = await solicitar(pdf());
    await expect(emitir.ejecutar({ archivoId })).rejects.toMatchObject({ code: 'ARCHIVO_NO_DISPONIBLE', estado: 'PENDIENTE_CARGA' });

    await new ConfirmarCarga(dobles).ejecutar(archivoId);
    await expect(emitir.ejecutar({ archivoId })).rejects.toMatchObject({ code: 'ARCHIVO_NO_DISPONIBLE', estado: 'EN_ANALISIS' });

    expect(dobles.almacen.descargasFirmadasEnTransaccion).toEqual([]);
  });

  it.each([
    ['RECHAZADO', ejecutable],
    ['CUARENTENA', pdfInfectado],
  ])('un archivo %s → ARCHIVO_NO_DISPONIBLE con su estado (TR-CA-201)', async (estado, contenido) => {
    const archivoId = await cargarYAnalizar(contenido());

    await expect(emitir.ejecutar({ archivoId })).rejects.toThrow(ArchivoNoDisponibleError);
    await expect(emitir.ejecutar({ archivoId })).rejects.toMatchObject({ estado });

    expect(dobles.almacen.descargasFirmadasEnTransaccion).toEqual([]);
    expect(dobles.auditoria.entradas).toEqual([]);
  });

  it('una categoría no sensible (IMAGEN) no deja fila de auditoría', async () => {
    const archivoId = await cargarYAnalizar(png(), IMAGEN);

    const descarga = await emitir.ejecutar({ archivoId });

    expect(dobles.almacen.descargarConUrl(descarga.url)).toEqual(png());
    expect(dobles.auditoria.entradas).toEqual([]);
  });

  it('si la auditoría falla en una categoría sensible, no se devuelve la URL', async () => {
    const archivoId = await cargarYAnalizar(pdf());
    dobles.auditoria.caida = true;

    await expect(emitir.ejecutar({ archivoId })).rejects.toThrow('la auditoría no responde');
  });

  it('la auditoría caída no afecta a una categoría no sensible', async () => {
    const archivoId = await cargarYAnalizar(png(), IMAGEN);
    dobles.auditoria.caida = true;

    await expect(emitir.ejecutar({ archivoId })).resolves.toMatchObject({ url: expect.any(String) });
  });

  it('autorizador que niega leer → ACCESO_ENTIDAD_DENEGADO, sin firma ni auditoría', async () => {
    const archivoId = await cargarYAnalizar(pdf());
    const autorizador = new AutorizadorFijo();
    autorizador.permiteLeer = false;
    dobles.autorizadores.push(autorizador);

    await expect(emitir.ejecutar({ archivoId })).rejects.toThrow(AccesoEntidadDenegadoError);

    expect(dobles.almacen.descargasFirmadasEnTransaccion).toEqual([]);
    expect(dobles.auditoria.entradas).toEqual([]);
  });

  it('el autorizador que niega decide antes que el estado: no se revela que el archivo no está disponible', async () => {
    const archivoId = await solicitar(pdf());
    const autorizador = new AutorizadorFijo();
    autorizador.permiteLeer = false;
    dobles.autorizadores.push(autorizador);

    await expect(emitir.ejecutar({ archivoId })).rejects.toThrow(AccesoEntidadDenegadoError);
  });

  it('entidad_tipo sin autorizador registrado pasa con el permiso y el tenant', async () => {
    dobles.autorizadores.push(new AutorizadorFijo('OTRA_ENTIDAD'));
    const archivoId = await cargarYAnalizar(pdf());

    await expect(emitir.ejecutar({ archivoId })).resolves.toBeDefined();
    expect(dobles.autorizadores[0]?.consultas).toEqual([]);
  });

  it('TR-CA-205: un archivo de otro tenant o inexistente → NO_ENCONTRADO', async () => {
    const archivoId = await cargarYAnalizar(pdf());

    await expect(emitir.ejecutar({ archivoId: '99999999-0000-4000-8000-000000000009' })).rejects.toThrow(ArchivoNoEncontradoError);
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };
    await expect(emitir.ejecutar({ archivoId })).rejects.toThrow(ArchivoNoEncontradoError);

    expect(dobles.almacen.descargasFirmadasEnTransaccion).toEqual([]);
    expect(dobles.auditoria.entradas).toEqual([]);
  });
});
