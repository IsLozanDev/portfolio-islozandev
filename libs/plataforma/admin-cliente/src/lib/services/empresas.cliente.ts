import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  cuerpoDatosEmpresa,
  filaAEmpresa,
  type DatosEmpresa,
  type Empresa,
  type EmpresaRegistrada,
  type EmpresaRegistradaRespuesta,
  type FilaEmpresaRespuesta,
  type PaginaOrganizacion,
} from '../models/empresa';
import { aListado, type Listado } from '../models/listado';
import { solicitar } from '../utils/solicitar';

const RUTA_EMPRESAS = '/org/empresas';

/** Empresas del tenant (spec 17a y 17c, TR-RF-002). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class EmpresasCliente {
  private readonly http = inject(HttpClient);
  private readonly urlEmpresas = inject(CONFIG_AUTH).apiUrl + RUTA_EMPRESAS;

  async listar(pagina: PaginaOrganizacion): Promise<Listado<Empresa>> {
    const parametros = new HttpParams().set('pagina', pagina.pagina).set('tamano', pagina.tamano);
    const respuesta = await solicitar(this.http.get<Listado<FilaEmpresaRespuesta>>(this.urlEmpresas, { params: parametros }));
    return aListado(respuesta, filaAEmpresa);
  }

  async consultar(empresaId: string): Promise<Empresa> {
    return filaAEmpresa(await solicitar(this.http.get<FilaEmpresaRespuesta>(this.urlDe(empresaId))));
  }

  /** TR-CA-004: crea la empresa y su sucursal principal 0000. */
  async registrar(ruc: string, datos: DatosEmpresa): Promise<EmpresaRegistrada> {
    const respuesta = await solicitar(this.http.post<EmpresaRegistradaRespuesta>(this.urlEmpresas, { ruc, ...cuerpoDatosEmpresa(datos) }));
    return { empresaId: respuesta.empresa_id, sucursalPrincipalId: respuesta.sucursal_principal_id };
  }

  async editar(empresaId: string, version: number, datos: DatosEmpresa): Promise<void> {
    await solicitar(this.http.put(this.urlDe(empresaId), { version, ...cuerpoDatosEmpresa(datos) }));
  }

  private urlDe(empresaId: string): string {
    return `${this.urlEmpresas}/${encodeURIComponent(empresaId)}`;
  }
}
