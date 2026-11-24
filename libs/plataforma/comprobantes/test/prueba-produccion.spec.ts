import { CargarCertificado } from '../src/application/cargar-certificado.js';
import { ConfigurarEmisor, type ConfigurarEmisorComando } from '../src/application/configurar-emisor.js';
import { DESCRIPCION_REGISTRADO_POR_PSE, EjecutarPruebaEmisor, ErrorTecnicoPseError, type DependenciasPrueba } from '../src/application/ejecutar-prueba-emisor.js';
import { EncolarPruebaEmisor } from '../src/application/encolar-prueba-emisor.js';
import { HabilitarProduccion } from '../src/application/habilitar-produccion.js';
import type { TrabajoPruebaFe } from '../src/application/ports/cola-pruebas-fe.js';
import type { ProveedorFe } from '../src/application/ports/proveedores-fe.js';
import type { CredencialesPse, PseOsePort } from '../src/application/ports/pse-ose.port.js';
import { SolicitarPruebaEmisor } from '../src/application/solicitar-prueba-emisor.js';
import type { DocumentoElectronico } from '../src/domain/documento-electronico.js';
import { Emisor } from '../src/domain/emisor.js';
import {
  CertificadoVencidoError,
  EmisorEnProduccionError,
  EmisorNoEncontradoError,
  EstadoEmisorInvalidoError,
  ProduccionNoPermitidaError,
  ProveedorFeInvalidoError,
  ProveedorSimuladoEnProduccionError,
  PruebaBetaRequeridaError,
  PruebaEnCursoError,
  UrlProveedorNoPermitidaError,
} from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import type { RespuestaPse } from '../src/domain/respuesta-pse.js';
import { ResolutorPseMapa } from '../src/infrastructure/pse/resolutor-pse.js';
import { CODIGO_RECHAZO_SIMULADO, PseSimulador, TOKEN_SIMULAR_ERROR, TOKEN_SIMULAR_RECHAZO } from '../src/infrastructure/pse/simulador/pse.simulador.js';
import { CLAVE_PFX, crearPfx } from './support/certificados.js';
import {
  AHORA,
  crearDobles,
  EMPRESA,
  NUBEFACT,
  SIMULADO,
  TENANT_A,
  TENANT_B,
  URL_NUBEFACT,
  URL_SIMULADOR,
  USUARIO,
  type Dobles,
} from './support/dobles.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const TOKEN = 'token-del-pse-secreto';
const INTENTO_INTERMEDIO = { numero: 1, esUltimo: false };
const ULTIMO_INTENTO = { numero: 3, esUltimo: true };

/** PSE que responde lo que se le pida y recuerda cada envío. */
class PseGrabado implements PseOsePort {
  envios: { credenciales: CredencialesPse; documento: DocumentoElectronico }[] = [];
  respuesta: RespuestaPse = { resultado: 'ACEPTADO', codigo: '0', descripcion: 'aceptada', observaciones: [] };

  enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    this.envios.push({ credenciales, documento });
    return Promise.resolve(this.respuesta);
  }
}

const comando = (cambios: Partial<ConfigurarEmisorComando> = {}): ConfigurarEmisorComando => ({
  empresaId: EMPRESA,
  proveedor: NUBEFACT,
  usuarioProveedor: 'MODDATOS',
  clave: TOKEN,
  regimenIgv: 'GENERAL',
  urlProveedor: URL_NUBEFACT,
  ...cambios,
});

describe('Prueba en beta y paso a producción (spec 50)', () => {
  let dobles: Dobles;
  let pse: PseGrabado;
  let encolados: TrabajoPruebaFe[];
  let registros: Record<string, unknown>[];
  let ejecutar: EjecutarPruebaEmisor;

  const avanzar = (milisegundos: number) => {
    dobles.reloj.instante = new Date(dobles.reloj.instante.getTime() + milisegundos);
  };
  const configurar = async (cambios: Partial<ConfigurarEmisorComando> = {}) => {
    const existente = dobles.emisores.filas[0];
    return (await new ConfigurarEmisor(dobles).ejecutar(comando({ version: existente?.version, ...cambios }))).vista;
  };
  const solicitar = async () => {
    const vista = await new SolicitarPruebaEmisor(dobles).ejecutar(EMPRESA);
    const [ultimo] = dobles.publicador.eventos.filter((evento) => evento.eventType === EVENTOS_FE.pruebaSolicitada).slice(-1);
    await new EncolarPruebaEmisor({ encolar: async (trabajo) => void encolados.push(trabajo) }).ejecutar(TENANT_A, ultimo.payload as never);
    return vista;
  };
  const procesar = (intento = INTENTO_INTERMEDIO) => ejecutar.ejecutar(encolados[encolados.length - 1], intento);
  /** Cambia el ítem NUBEFACT del catálogo de prueba. */
  const cambiarNubefact = (cambios: Partial<ProveedorFe>) => {
    const actual = dobles.proveedores.proveedores.get(NUBEFACT) as ProveedorFe;
    dobles.proveedores.proveedores.set(NUBEFACT, { ...actual, ...cambios });
  };
  const emisor = () => dobles.emisores.filas[0];
  const verificar = async () => {
    await configurar();
    await solicitar();
    await procesar();
  };

  beforeEach(() => {
    dobles = crearDobles();
    pse = new PseGrabado();
    encolados = [];
    registros = [];
    const dependencias: DependenciasPrueba = {
      unidadDeTrabajo: dobles.unidadDeTrabajo,
      contexto: dobles.contexto,
      reloj: dobles.reloj,
      publicador: dobles.publicador,
      emisores: dobles.emisores,
      empresas: dobles.empresas,
      proveedores: dobles.proveedores,
      boveda: dobles.boveda,
      resolutor: new ResolutorPseMapa({ [NUBEFACT]: pse, [SIMULADO]: new PseSimulador() }),
      informar: (_mensaje, datos) => registros.push(datos),
    };
    ejecutar = new EjecutarPruebaEmisor(dependencias);
  });

  describe('SolicitarPruebaEmisor y EjecutarPruebaEmisor', () => {
    it('TR-CA-133: 202 EN_PROCESO sin llamar al PSE; el worker envía la boleta B001-1, queda ACEPTADA y VERIFICADO con un evento', async () => {
      await configurar();
      const vista = await solicitar();
      expect(vista.prueba).toMatchObject({ estado: 'EN_PROCESO', numero: 1 });
      expect(pse.envios).toHaveLength(0);
      expect(dobles.publicador.tipos().at(-1)).toBe(EVENTOS_FE.pruebaSolicitada);
      expect(dobles.publicador.enTransaccion.at(-1)).toBe(true);
      expect(encolados).toEqual([{ tenantId: TENANT_A, emisorId: vista.emisorId, numeroPrueba: 1 }]);
      expect(dobles.auditoria.entradas.at(-1)).toMatchObject({ accion: 'fe.emisor.solicitar_prueba', entidadId: vista.emisorId });

      await procesar();
      const [envio] = pse.envios;
      expect(envio.documento).toMatchObject({ serie: 'B001', numero: 1, emisorRuc: '20601234561', fechaEmision: '2026-11-22' });
      expect(envio.credenciales).toEqual({ url: URL_NUBEFACT, usuario: 'MODDATOS', token: TOKEN, ambiente: 'BETA' });
      expect(emisor().datos).toMatchObject({ estado: 'VERIFICADO', prueba: expect.objectContaining({ estado: 'ACEPTADA', codigo: '0' }) });
      expect(dobles.publicador.tipos().filter((tipo) => tipo === EVENTOS_FE.emisorVerificado)).toHaveLength(1);
      expect(dobles.publicador.eventos.at(-1)?.payload).toEqual({ emisor_id: vista.emisorId, empresa_id: EMPRESA, proveedor: NUBEFACT });

      // El mismo trabajo otra vez (evento repetido): no envía ni publica.
      await procesar();
      expect(pse.envios).toHaveLength(1);
      expect(dobles.publicador.tipos().filter((tipo) => tipo === EVENTOS_FE.emisorVerificado)).toHaveLength(1);
    });

    it('cada prueba usa un número nuevo con la serie del catálogo', async () => {
      await verificar();
      avanzar(MINUTO);
      expect((await solicitar()).prueba?.numero).toBe(2);
      await procesar();
      expect(pse.envios.map((envio) => `${envio.documento.serie}-${envio.documento.numero}`)).toEqual(['B001-1', 'B001-2']);
    });

    it('rechazo → RECHAZADA con código y descripción; el emisor sigue CONFIGURADO', async () => {
      await configurar();
      await solicitar();
      pse.respuesta = { resultado: 'RECHAZADO', codigo: '2017', descripcion: 'El numero de documento de identidad del receptor debe ser RUC', observaciones: [] };
      await procesar();
      expect(emisor().datos).toMatchObject({ estado: 'CONFIGURADO', prueba: expect.objectContaining({ estado: 'RECHAZADA', codigo: '2017' }) });
      expect(dobles.publicador.tipos()).not.toContain(EVENTOS_FE.emisorVerificado);
    });

    it('ERROR_TECNICO se relanza para que BullMQ reintente y en el último intento deja la prueba en ERROR', async () => {
      await configurar();
      await solicitar();
      pse.respuesta = { resultado: 'ERROR_TECNICO', codigo: 'HTTP_503', descripcion: null, observaciones: [] };
      await expect(procesar(INTENTO_INTERMEDIO)).rejects.toBeInstanceOf(ErrorTecnicoPseError);
      await expect(procesar({ numero: 2, esUltimo: false })).rejects.toBeInstanceOf(ErrorTecnicoPseError);
      expect(emisor().prueba?.estado).toBe('EN_PROCESO');
      await procesar(ULTIMO_INTENTO);
      expect(emisor().datos).toMatchObject({ estado: 'CONFIGURADO', prueba: expect.objectContaining({ estado: 'ERROR', codigo: 'HTTP_503' }) });
      expect(pse.envios).toHaveLength(3);
    });

    it('EN_PROCESO del PSE (registrado, SUNAT sin responder) cuenta como ACEPTADA y deja VERIFICADO', async () => {
      await configurar();
      await solicitar();
      pse.respuesta = { resultado: 'EN_PROCESO', codigo: null, descripcion: null, observaciones: [] };
      await procesar();
      expect(emisor().datos).toMatchObject({
        estado: 'VERIFICADO',
        prueba: expect.objectContaining({ estado: 'ACEPTADA', descripcion: DESCRIPCION_REGISTRADO_POR_PSE }),
      });
    });

    it('segunda solicitud antes de 10 min → PRUEBA_EN_CURSO; después se acepta y el resultado viejo se ignora', async () => {
      await configurar();
      await solicitar();
      const vieja = encolados[0];
      avanzar(9 * MINUTO);
      await expect(new SolicitarPruebaEmisor(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(PruebaEnCursoError);
      avanzar(2 * MINUTO);
      await solicitar();

      await ejecutar.ejecutar(vieja, INTENTO_INTERMEDIO);
      expect(pse.envios).toHaveLength(0);
      expect(emisor().prueba).toMatchObject({ estado: 'EN_PROCESO', numero: 2 });
    });

    it('BORRADOR → ESTADO_EMISOR_INVALIDO; sin emisor u otro tenant → EMISOR_NO_ENCONTRADO', async () => {
      await expect(new SolicitarPruebaEmisor(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(EmisorNoEncontradoError);
      await configurar({ proveedor: SIMULADO, urlProveedor: URL_SIMULADOR });
      expect(emisor().datos.estado).toBe('BORRADOR');
      await expect(new SolicitarPruebaEmisor(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(EstadoEmisorInvalidoError);

      dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };
      await expect(new SolicitarPruebaEmisor(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(EmisorNoEncontradoError);
      await expect(new HabilitarProduccion(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(EmisorNoEncontradoError);
    });

    it('si el catálogo dejó de permitir la URL, registra el rechazo sin llamar al PSE', async () => {
      await configurar();
      await solicitar();
      cambiarNubefact({ dominiosPermitidos: ['api.pse.pe'] });
      await procesar();
      expect(pse.envios).toHaveLength(0);
      expect(emisor().prueba).toMatchObject({ estado: 'RECHAZADA', codigo: 'URL_NO_PERMITIDA' });
    });

    it('TR-RNF-113 y 026: el token no aparece en la vista, el log, los eventos, la auditoría ni la prueba', async () => {
      await verificar();
      const visible = JSON.stringify([
        dobles.publicador.eventos,
        dobles.auditoria.entradas,
        emisor().datos,
        registros,
      ]);
      expect(visible).not.toContain(TOKEN);
      expect(registros).toEqual([{ emisor_id: emisor().id, numero_prueba: 1, intento: 1, resultado: 'ACEPTADO' }]);
    });

    it('el simulador: SIMULAR_RECHAZO → RECHAZADA 2800; SIMULAR_ERROR × 3 → ERROR; otro token → VERIFICADO', async () => {
      const conSimulador = async (token: string) => {
        dobles = crearDobles();
        ejecutar = new EjecutarPruebaEmisor({ ...dobles, resolutor: new ResolutorPseMapa({ [SIMULADO]: new PseSimulador() }), informar: () => undefined });
        await new ConfigurarEmisor(dobles).ejecutar(comando({ proveedor: 'SIN_CERTIFICADO', urlProveedor: URL_SIMULADOR, clave: token }));
        dobles.emisores.filas[0] = Emisor.reconstituir({ ...emisor().datos, proveedor: SIMULADO });
        encolados = [];
        await solicitar();
      };
      await conSimulador(TOKEN_SIMULAR_RECHAZO);
      await procesar();
      expect(emisor().prueba).toMatchObject({ estado: 'RECHAZADA', codigo: CODIGO_RECHAZO_SIMULADO });

      await conSimulador(TOKEN_SIMULAR_ERROR);
      await expect(procesar()).rejects.toBeInstanceOf(ErrorTecnicoPseError);
      await procesar(ULTIMO_INTENTO);
      expect(emisor().prueba?.estado).toBe('ERROR');

      await conSimulador('cualquier-token');
      await procesar();
      expect(emisor().datos.estado).toBe('VERIFICADO');
    });
  });

  describe('HabilitarProduccion', () => {
    it('con prueba aceptada, entorno que lo permite y proveedor real: PRODUCCION, evento y auditoría', async () => {
      await verificar();
      avanzar(HORA);
      const vista = await new HabilitarProduccion(dobles).ejecutar(EMPRESA);
      expect(vista).toMatchObject({ estado: 'PRODUCCION', ambiente: 'PRODUCCION', produccionHabilitadaEn: dobles.reloj.now() });
      expect(dobles.publicador.tipos().at(-1)).toBe(EVENTOS_FE.produccionHabilitada);
      expect(dobles.publicador.eventos.at(-1)?.payload).toEqual({ emisor_id: vista.emisorId, empresa_id: EMPRESA, proveedor: NUBEFACT });
      expect(dobles.auditoria.entradas.at(-1)).toMatchObject({ accion: 'fe.emisor.habilitar_produccion', despues: expect.objectContaining({ estado: 'PRODUCCION' }) });
    });

    it('sin prueba aceptada → PRUEBA_BETA_REQUERIDA; aceptada hace 25 h → PRUEBA_BETA_REQUERIDA', async () => {
      await configurar();
      await expect(new HabilitarProduccion(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(PruebaBetaRequeridaError);
      await solicitar();
      await procesar();
      avanzar(25 * HORA);
      await expect(new HabilitarProduccion(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(PruebaBetaRequeridaError);
    });

    it('FE_PRODUCCION_PERMITIDA=false → PRODUCCION_NO_PERMITIDA; SIMULADO → PROVEEDOR_SIMULADO_EN_PRODUCCION', async () => {
      await verificar();
      dobles.entorno = { ...dobles.entorno, produccionPermitida: false };
      await expect(new HabilitarProduccion(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(ProduccionNoPermitidaError);

      dobles.entorno = { ...dobles.entorno, produccionPermitida: true };
      dobles.emisores.filas[0] = Emisor.reconstituir({ ...emisor().datos, proveedor: SIMULADO });
      await expect(new HabilitarProduccion(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(ProveedorSimuladoEnProduccionError);
    });

    it('proveedor que pide certificado sin certificado vigente → CERTIFICADO_VENCIDO', async () => {
      await verificar();
      cambiarNubefact({ requiereCertificado: true });
      await expect(new HabilitarProduccion(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(CertificadoVencidoError);
    });
  });

  describe('ConfigurarEmisor y CargarCertificado con la prueba', () => {
    it('FE_SIMULADO_PERMITIDO=false: configurar SIMULADO → PROVEEDOR_FE_INVALIDO', async () => {
      dobles.entorno = { ...dobles.entorno, simuladoPermitido: false };
      await expect(configurar({ proveedor: SIMULADO, urlProveedor: URL_SIMULADOR })).rejects.toBeInstanceOf(ProveedorFeInvalidoError);
      expect(dobles.boveda.secretos.size).toBe(0);
    });

    it.each([
      ['falta', null],
      ['otro dominio', 'https://api.pse.pe/api/v1/x'],
      ['sin https', 'http://api.nubefact.com/api/v1/x'],
      ['con credenciales', 'https://u:p@api.nubefact.com/api/v1/x'],
      ['otro puerto', 'https://api.nubefact.com:8443/api/v1/x'],
    ])('URL %s → URL_PROVEEDOR_NO_PERMITIDA sin tocar la bóveda', async (_caso, url) => {
      await expect(configurar({ urlProveedor: url })).rejects.toBeInstanceOf(UrlProveedorNoPermitidaError);
      expect(dobles.boveda.secretos.size).toBe(0);
    });

    it('VERIFICADO: cambiar la URL o la credencial vuelve a CONFIGURADO', async () => {
      await verificar();
      expect((await configurar({ urlProveedor: `${URL_NUBEFACT}0`, clave: undefined })).estado).toBe('CONFIGURADO');
      await solicitar();
      await procesar();
      expect(emisor().datos.estado).toBe('VERIFICADO');
      expect((await configurar({ clave: 'token-nuevo' })).estado).toBe('CONFIGURADO');
    });

    it('PRODUCCION: rotar la credencial o el certificado sigue en PRODUCCION; cambiar proveedor o URL → EMISOR_EN_PRODUCCION', async () => {
      await verificar();
      await new HabilitarProduccion(dobles).ejecutar(EMPRESA);

      expect((await configurar({ clave: 'token-rotado' })).estado).toBe('PRODUCCION');
      const vista = await new CargarCertificado(dobles).ejecutar({ empresaId: EMPRESA, pfx: crearPfx(new Date(AHORA)), clave: CLAVE_PFX });
      expect(vista.estado).toBe('PRODUCCION');

      await expect(configurar({ urlProveedor: `${URL_NUBEFACT}0` })).rejects.toBeInstanceOf(EmisorEnProduccionError);
      await expect(configurar({ proveedor: 'SIN_CERTIFICADO', urlProveedor: URL_SIMULADOR })).rejects.toBeInstanceOf(EmisorEnProduccionError);
      expect(emisor().datos).toMatchObject({ proveedor: NUBEFACT, urlProveedor: URL_NUBEFACT, estado: 'PRODUCCION' });
      expect(dobles.boveda.texto(emisor().secretoCredencialId)).toBe('token-rotado');
    });
  });
});
