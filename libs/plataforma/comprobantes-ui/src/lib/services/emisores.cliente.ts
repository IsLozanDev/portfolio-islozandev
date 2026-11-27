import { HttpClient, HttpStatusCode } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { catchError, map, of, throwError, type Observable } from 'rxjs';
import {
  aEmisor,
  aEmpresaConEmisor,
  type CargaConfigurarEmisor,
  type Emisor,
  type EmisorRespuesta,
  type EmpresaConEmisor,
  type EmpresaConEmisorRespuesta,
} from '../models/emisor';
import { aErrorFe } from '../models/error-fe';
import { conErroresFe, solicitar } from '../utils/solicitar';

export const RUTA_EMISORES = '/fe/emisores';
const CAMPO_ARCHIVO = 'archivo';
const CAMPO_CLAVE = 'clave';

/** Rutas del emisor electrónico (specs 49, 50 y 62). Los errores salen como `ErrorFe`. */
@Injectable({ providedIn: 'root' })
export class EmisoresCliente {
  private readonly http = inject(HttpClient);
  private readonly urlEmisores = inject(CONFIG_AUTH).apiUrl + RUTA_EMISORES;

  listar(): Promise<EmpresaConEmisor[]> {
    return solicitar(this.http.get<EmpresaConEmisorRespuesta[]>(this.urlEmisores).pipe(map((empresas) => empresas.map(aEmpresaConEmisor))));
  }

  /** null si la empresa aún no tiene emisor (404). */
  obtener(empresaId: string): Promise<Emisor | null> {
    return solicitar(this.observarEmisor(empresaId));
  }

  /** Como `obtener`, sin convertir a promesa: desuscribirse aborta la petición (consulta de la prueba). */
  observarEmisor(empresaId: string): Observable<Emisor | null> {
    return this.http.get<EmisorRespuesta>(this.urlDe(empresaId)).pipe(
      map(aEmisor),
      catchError((error: unknown) => {
        const errorFe = aErrorFe(error);
        return errorFe.estado === HttpStatusCode.NotFound ? of(null) : throwError(() => errorFe);
      }),
    );
  }

  configurar(empresaId: string, carga: CargaConfigurarEmisor): Promise<Emisor> {
    return this.pedirEmisor(this.http.put<EmisorRespuesta>(this.urlDe(empresaId), carga));
  }

  /** Multipart a la API: el .pfx es un secreto y no pasa por Storage (spec 49). */
  cargarCertificado(empresaId: string, archivo: File, clave: string): Promise<Emisor> {
    const formulario = new FormData();
    formulario.append(CAMPO_ARCHIVO, archivo);
    formulario.append(CAMPO_CLAVE, clave);
    return this.pedirEmisor(this.http.post<EmisorRespuesta>(`${this.urlDe(empresaId)}/certificado`, formulario));
  }

  /** 202: la prueba queda EN_PROCESO y el worker la envía; se sigue con `SeguimientoPruebaService`. */
  solicitarPrueba(empresaId: string): Promise<Emisor> {
    return this.pedirEmisor(this.http.post<EmisorRespuesta>(`${this.urlDe(empresaId)}/prueba`, null));
  }

  pasarAProduccion(empresaId: string): Promise<Emisor> {
    return this.pedirEmisor(this.http.post<EmisorRespuesta>(`${this.urlDe(empresaId)}/produccion`, null));
  }

  private pedirEmisor(peticion: Observable<EmisorRespuesta>): Promise<Emisor> {
    return solicitar(conErroresFe(peticion).pipe(map(aEmisor)));
  }

  private urlDe(empresaId: string): string {
    return `${this.urlEmisores}/${encodeURIComponent(empresaId)}`;
  }
}
