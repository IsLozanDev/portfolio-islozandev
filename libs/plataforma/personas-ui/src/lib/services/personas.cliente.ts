import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { map, type Observable } from 'rxjs';
import {
  aListadoPersonas,
  aParametrosListado,
  aResultadoBusquedaDocumento,
  type BusquedaDocumentoRespuesta,
  type CriteriosListado,
  type ListadoPersonas,
  type ListadoPersonasRespuesta,
  type ResultadoBusquedaDocumento,
} from '../models/busqueda';
import {
  aPersonaDetalle,
  type PersonaDetalle,
  type PersonaDetalleRespuesta,
  type ProductoCodigo,
  type TipoDocumento,
} from '../models/persona';
import {
  aCuerpoDatosBasicos,
  aCuerpoRegistro,
  aCuerpoRol,
  type AsignacionRol,
  type CambiosDatosBasicos,
  type RegistroPersona,
} from '../models/solicitudes-persona';
import { conErroresDePersonas, solicitar } from '../utils/solicitar';

export const RUTA_PERSONAS = '/personas';

/** Rutas de TR-PER (specs 31, 32 y 38). Los errores salen como `ErrorPersonas`. */
@Injectable({ providedIn: 'root' })
export class PersonasCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPersonas = inject(CONFIG_AUTH).apiUrl + RUTA_PERSONAS;

  listar(criterios: CriteriosListado): Promise<ListadoPersonas> {
    return solicitar(this.observarListado(criterios));
  }

  /** Como `listar`, sin convertir a promesa: desuscribirse aborta la petición (sugerencias mientras se escribe). */
  observarListado(criterios: CriteriosListado): Observable<ListadoPersonas> {
    const peticion = this.http.get<ListadoPersonasRespuesta>(this.urlPersonas, { params: aParametrosListado(criterios) });
    return conErroresDePersonas(peticion).pipe(map(aListadoPersonas));
  }

  /** La persona del tenant o, si no existe, el prellenado de TR-IDN (solo DNI y RUC). */
  buscarPorDocumento(tipo: TipoDocumento, numero: string): Promise<ResultadoBusquedaDocumento> {
    return solicitar(this.observarBusquedaDocumento(tipo, numero));
  }

  observarBusquedaDocumento(tipo: TipoDocumento, numero: string): Observable<ResultadoBusquedaDocumento> {
    const peticion = this.http.get<BusquedaDocumentoRespuesta>(`${this.urlPersonas}/busqueda`, { params: { tipo, numero } });
    return conErroresDePersonas(peticion).pipe(map(aResultadoBusquedaDocumento));
  }

  async registrar(registro: RegistroPersona): Promise<PersonaDetalle> {
    return aPersonaDetalle(await solicitar(this.http.post<PersonaDetalleRespuesta>(this.urlPersonas, aCuerpoRegistro(registro))));
  }

  async obtener(personaId: string): Promise<PersonaDetalle> {
    return aPersonaDetalle(await solicitar(this.http.get<PersonaDetalleRespuesta>(this.urlPersona(personaId))));
  }

  async actualizarDatosBasicos(personaId: string, cambios: CambiosDatosBasicos): Promise<PersonaDetalle> {
    const peticion = this.http.patch<PersonaDetalleRespuesta>(this.urlPersona(personaId), aCuerpoDatosBasicos(cambios));
    return aPersonaDetalle(await solicitar(peticion));
  }

  /** Falso si la persona ya tenía ese rol vigente (la API responde 200 en vez de 201). */
  async asignarRol(personaId: string, asignacion: AsignacionRol): Promise<{ asignado: boolean }> {
    return solicitar(this.http.post<{ asignado: boolean }>(`${this.urlPersona(personaId)}/roles`, aCuerpoRol(asignacion)));
  }

  /** Productos con suscripción vigente: los que ofrece «Asignar rol». */
  async productosSuscritos(): Promise<ProductoCodigo[]> {
    const productos = await solicitar(this.http.get<{ producto_codigo: ProductoCodigo }[]>(`${this.urlPersonas}/productos-suscritos`));
    return productos.map((producto) => producto.producto_codigo);
  }

  private urlPersona(personaId: string): string {
    return `${this.urlPersonas}/${encodeURIComponent(personaId)}`;
  }
}
