import type { AgregarContacto } from './agregar-contacto.js';
import type { AgregarDireccion } from './agregar-direccion.js';
import type { AsignarRolPersona } from './asignar-rol.js';
import type { BuscarPersonaPorDocumento } from './buscar-persona.js';
import type { ObtenerPersona } from './obtener-persona.js';
import type {
  AgregarContactoComando,
  AgregarDireccionComando,
  AsignarRolComando,
  PersonaDetalle,
  PersonaPort,
  PersonaResumen,
  RegistrarPersonaComando,
} from './ports/persona.port.js';
import type { RegistrarPersona } from './registrar-persona.js';

export interface CasosDeUsoPersonas {
  buscarPorDocumento: BuscarPersonaPorDocumento;
  obtener: ObtenerPersona;
  registrar: RegistrarPersona;
  asignarRol: AsignarRolPersona;
  agregarContacto: AgregarContacto;
  agregarDireccion: AgregarDireccion;
}

export class ServicioPersonas implements PersonaPort {
  constructor(private readonly casosDeUso: CasosDeUsoPersonas) {}

  async buscarPorDocumento(tipo: string, numero: string): Promise<PersonaResumen | null> {
    const resultado = await this.casosDeUso.buscarPorDocumento.ejecutar({ tipo, numero, puedePrellenar: false });
    return resultado.encontrada ? resultado.persona : null;
  }

  obtener(personaId: string): Promise<PersonaDetalle> {
    return this.casosDeUso.obtener.ejecutar(personaId);
  }

  registrar(comando: RegistrarPersonaComando): Promise<PersonaDetalle> {
    return this.casosDeUso.registrar.ejecutar(comando);
  }

  asignarRol(comando: AsignarRolComando): Promise<{ asignado: boolean }> {
    return this.casosDeUso.asignarRol.ejecutar(comando);
  }

  agregarContacto(comando: AgregarContactoComando): Promise<PersonaDetalle> {
    return this.casosDeUso.agregarContacto.ejecutar(comando);
  }

  agregarDireccion(comando: AgregarDireccionComando): Promise<PersonaDetalle> {
    return this.casosDeUso.agregarDireccion.ejecutar(comando);
  }
}
