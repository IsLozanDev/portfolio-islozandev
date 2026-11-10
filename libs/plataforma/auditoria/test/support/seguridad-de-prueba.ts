import { Global, Module } from '@nestjs/common';
import { ALCANCE_ACTOR, DIRECTORIO_SEG, type AlcanceActor, type DirectorioSeg } from '@vitrina/plataforma/seguridad';

/** Alcance programable por usuario: los que estén en `tenant` alcanzan todo el tenant (AlcanceActorSeg se prueba en seguridad). */
export class AlcanceActorDePrueba implements AlcanceActor {
  readonly tenant = new Set<string>();

  async cubre(): Promise<boolean> {
    return true;
  }

  async alcanzaTenant(usuarioId: string): Promise<boolean> {
    return this.tenant.has(usuarioId);
  }
}

export const directorioVacio: DirectorioSeg = {
  buscarUsuarios: async () => [],
  usuarios: async () => [],
  sucursales: async () => [],
};

/** En lugar de SeguridadModule: los puertos que usa AuditoriaModule.registrarApi. */
@Global()
@Module({
  providers: [
    { provide: ALCANCE_ACTOR, useValue: new AlcanceActorDePrueba() },
    { provide: DIRECTORIO_SEG, useValue: directorioVacio },
  ],
  exports: [ALCANCE_ACTOR, DIRECTORIO_SEG],
})
export class SeguridadDePruebaModule {}
