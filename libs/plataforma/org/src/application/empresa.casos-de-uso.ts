import { ValidationError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { advertenciasDelPadron } from '../domain/advertencias-padron.js';
import { Empresa, type DatosEmpresa, type LogoEdicion } from '../domain/empresa.js';
import { LogoInvalidoError } from '../domain/errores.js';
import { LogoValidado } from '../domain/logo.js';
import { Sucursal } from '../domain/sucursal.js';
import { Ruc } from '../domain/valores.js';
import { buscarTenant, cupoSucursales, existe } from './comunes.js';
import type { PadronRucPort } from './ports/padron-ruc.port.js';
import type { RepositorioEmpresas, RepositorioSucursales, RepositorioSuscripciones, RepositorioTenants } from './ports/repositorios.js';
import type { ValidadorLogoPort } from './ports/validador-logo.port.js';
import { publicarEventos } from './publicar-eventos.js';
import { exigirVersion } from './version-obsoleta.js';

export interface RegistrarEmpresaComando {
  ruc: string;
  /** Obligatoria mientras el padrón no devuelva datos (TR-IDN, R2). */
  razonSocial: string | null;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
}

export interface EditarEmpresaComando extends DatosEmpresa {
  empresaId: string;
  /** null quita el logo. */
  logoArchivoId: string | null;
  /** La que leyó el cliente. */
  version: number;
}

export interface EmpresaRegistrada {
  empresaId: string;
  sucursalPrincipalId: string;
  /** TR-RN-019: contribuyente no apto según el padrón; no bloquea el registro. */
  advertencias: string[];
}

export interface EmpresaRepos {
  tenants: RepositorioTenants;
  empresas: RepositorioEmpresas;
  sucursales: RepositorioSucursales;
  suscripciones: RepositorioSuscripciones;
}

/** TR-RF-002: crea la empresa y su sucursal principal 0000 en una sola transacción. */
export class RegistrarEmpresa {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly repos: EmpresaRepos,
    private readonly padron: PadronRucPort,
  ) {}

  async ejecutar(comando: RegistrarEmpresaComando): Promise<EmpresaRegistrada> {
    // Fuera de la transacción: el RUC se valida sin tocar la base y el padrón es una llamada externa.
    const ruc = Ruc.de(comando.ruc).valor;
    const padron = await this.padron.consultar(ruc);
    const razonSocial = padron?.razonSocial ?? comando.razonSocial;
    if (!razonSocial?.trim()) throw new ValidationError('La razón social es obligatoria');

    return this.uow.run(async () => {
      const tenant = await buscarTenant(this.repos.tenants, this.contexto);
      tenant.exigirOperativo();

      const empresa = Empresa.crear(this.ids.next(), tenant.id, ruc, { ...comando, razonSocial });
      const principal = Sucursal.crearPrincipal(this.ids.next(), empresa, await cupoSucursales(this.repos));

      await this.repos.empresas.guardar(empresa);
      await this.repos.sucursales.guardar(principal);
      await publicarEventos(this.eventos, empresa, principal);
      return { empresaId: empresa.id, sucursalPrincipalId: principal.id, advertencias: advertenciasDelPadron(padron) };
    });
  }
}

export class EditarEmpresa {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly eventos: EventPublisher,
    private readonly repos: Pick<EmpresaRepos, 'tenants' | 'empresas'>,
    private readonly validadorLogo: ValidadorLogoPort,
  ) {}

  async ejecutar({ empresaId, version, logoArchivoId, ...datos }: EditarEmpresaComando): Promise<void> {
    await this.uow.run(async () => {
      (await buscarTenant(this.repos.tenants, this.contexto)).exigirOperativo();
      const empresa = existe(await this.repos.empresas.buscar(empresaId), 'La empresa no existe');
      exigirVersion(empresa, version);

      empresa.editar(datos, await this.logoTrasValidar(empresa, logoArchivoId));
      await this.repos.empresas.guardar(empresa);
      await publicarEventos(this.eventos, empresa);
    });
  }

  /** Solo un logo nuevo pasa por ARC: el que ya tenía o quitarlo no se validan. */
  private async logoTrasValidar(empresa: Empresa, logoArchivoId: string | null): Promise<LogoEdicion> {
    if (logoArchivoId === null || logoArchivoId === empresa.logoArchivoId) return logoArchivoId;
    const resultado = await this.validadorLogo.validar(logoArchivoId, empresa.id);
    if (!resultado.valido) throw new LogoInvalidoError(resultado.motivo);
    return LogoValidado.confirmado(logoArchivoId);
  }
}
