export {
  METODOS_MFA,
  mfaEn,
  mfaVigente,
  type Aal,
  type EntradaAmr,
  type Principal,
  type TipoUsuario,
} from './domain/principal.js';
export { AutenticacionNoDisponibleError, MfaRequeridaError, TokenInvalidoError } from './domain/errores.js';
export { VERIFICADOR_TOKEN, type VerificadorToken } from './application/ports/verificador-token.port.js';
export { SupabaseJwksVerificador, type OpcionesSupabase } from './infrastructure/supabase/supabase-jwks.verificador.js';
export { REGISTRO_ACCESO, type RegistroAcceso } from './application/ports/registro-acceso.port.js';
export { Permiso, PERMISO, PrincipalActual, PUBLICO, Publico, REQUIERE_MFA, RequiereMfa, type ContextoAutorizado } from './interface/decoradores.js';
export { AutenticacionGuard } from './interface/autenticacion.guard.js';
export { MfaGuard } from './interface/mfa.guard.js';
export { PermisoGuard } from './interface/permiso.guard.js';
export { ContextoTenantInterceptor } from './interface/contexto-tenant.interceptor.js';
export { MiContextoDto } from './interface/mi-contexto.controller.js';
export { SeguridadModule, type SeguridadOpciones } from './seguridad.module.js';

// Autorización (spec 06): dominio, casos de uso de rol y perfil, y esquemas de eventos.
export { ALCANCES, alcanceAlMenos, cubre, type Alcance, type Ambito } from './domain/alcance.js';
export { CodigoPermiso } from './domain/codigo-permiso.js';
export {
  AlcanceIncoherenteError,
  AlcanceInsuficienteError,
  ManifiestoInvalidoError,
  ManifiestoVersionAlteradaError,
  ManifiestoVersionAnteriorError,
  MembresiaNoAsignableError,
  OtorganteSinAlcanceError,
  PerfilPredefinidoNoEditableError,
  PermisoAjenoAlProductoError,
  ProductoNoContratadoError,
  RolOPerfilError,
  RolPredefinidoNoEditableError,
  VigenciaInvalidaError,
} from './domain/errores.js';
export { EVENTOS_SEG } from './domain/eventos.js';
export { PERMISOS_SEG } from './domain/permisos-seg.js';
export {
  CambiarPermisosRol,
  CopiarRol,
  CrearRol,
  InactivarRol,
  type CambiarPermisosRolComando,
  type CopiarRolComando,
  type CrearRolComando,
  type InactivarRolComando,
  type ResultadoInactivar,
} from './application/rol.casos-de-uso.js';
export { CambiarRolesPerfil, CrearPerfil, type CambiarRolesPerfilComando, type CrearPerfilComando } from './application/perfil.casos-de-uso.js';
export { OtorgarAsignacion, type Otorgante, type OtorgarAsignacionComando } from './application/otorgar-asignacion.js';
export { AplicarManifiesto, type ResultadoManifiesto } from './application/aplicar-manifiesto.js';
export type { RepositorioManifiestos, SesionManifiesto } from './application/ports/repositorios.js';
export { ManifiestoRepositorioTypeOrm } from './infrastructure/typeorm/manifiesto.repositorio.js';
export { clavePermisos, ResolverPermisos, TTL_PERMISOS_SEG } from './application/resolver-permisos.js';
export {
  CACHE_PERMISOS,
  PERMISOS_REPOSITORIO,
  type CachePermisos,
  type ConsultaPermisos,
  type OpcionMenu,
  type PermisosRepositorio,
  type PermisosResueltos,
  type SucursalAccesible,
} from './application/ports/permisos.port.js';
export { SucursalNoAsignadaError } from './domain/errores.js';
export { ObtenerMiContexto, type MiContexto, type MiContextoConsulta } from './application/obtener-mi-contexto.js';
export type { PreferenciaSucursal } from './application/ports/repositorios.js';
export { ESQUEMAS_SEG, registrarEsquemasSeg } from './infrastructure/event-schemas.js';

// Membresías (spec 08).
export {
  ActorSinAlcanceError,
  AlcanceSuperiorError,
  IdentidadNoDisponibleError,
  InvitacionExpiradaError,
  InvitacionOtroCorreoError,
  LimiteUsuariosError,
  MembresiaExistenteError,
  PropietarioUnicoError,
} from './domain/errores.js';
export type { EstadoMembresia } from './domain/membresia.js';
export { PROVEEDOR_IDENTIDAD, type ProveedorIdentidad } from './application/ports/proveedor-identidad.port.js';
export { InvitarUsuario, type InvitacionEmitida, type InvitarUsuarioComando } from './application/invitar-usuario.js';
export { AceptarInvitacion, ConsultarInvitacion } from './application/aceptar-invitacion.js';
export { FinalizarMembresia, ReactivarMembresia, RevocarAsignacion, SuspenderMembresia } from './application/membresia.casos-de-uso.js';

// Para componentes que dependen de seg (spec 09).
export { ALCANCE_ACTOR, type AlcanceActor, type DestinoAlcance } from './application/ports/alcance-actor.port.js';
export { AlcanceActorSeg } from './application/alcance-actor.js';
export { ConfirmacionRequeridaError } from './domain/errores.js';
