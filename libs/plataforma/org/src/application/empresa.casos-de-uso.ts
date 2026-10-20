import { ValidationError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { Empresa, type DatosEmpresa } from '../domain/empresa.js';
import { Sucursal } from '../domain/sucursal.js';
import { Ruc } from '../domain/valores.js';
import { buscarTenant, cupoSucursales, existe } from './comunes.js';
import type { PadronRucPort } from './ports/padron-ruc.port.js';
import type { RepositorioEmpresas, RepositorioSucursales, RepositorioSuscripciones, RepositorioTenants } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface RegistrarEmpresaComando {
  ruc: string;
  /** Obligatoria mientras el padrón no devuelva datos (TR-IDN, R2). */
  razonSocial: string | null;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
}

export interface EditarEmpresaComando extends DatosEmpresa {
  empresaId: string;
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

  async ejecutar(comando: RegistrarEmpresaComando): Promise<{ empresaId: string; sucursalPrincipalId: string }> {
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
      return { empresaId: empresa.id, sucursalPrincipalId: principal.id };
    });
  }
}

export class EditarEmpresa {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly eventos: EventPublisher,
    private readonly repos: Pick<EmpresaRepos, 'tenants' | 'empresas'>,
  ) {}

  async ejecutar({ empresaId, ...datos }: EditarEmpresaComando): Promise<void> {
    await this.uow.run(async () => {
      (await buscarTenant(this.repos.tenants, this.contexto)).exigirOperativo();
      const empresa = existe(await this.repos.empresas.buscar(empresaId), 'La empresa no existe');

      empresa.editar(datos);
      await this.repos.empresas.guardar(empresa);
      await publicarEventos(this.eventos, empresa);
    });
  }
}
