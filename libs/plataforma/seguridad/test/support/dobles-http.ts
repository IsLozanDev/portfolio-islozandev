import type { CanActivate, ExecutionContext } from '@nestjs/common';

export const ANA = '0193f3a0-0000-7000-8000-000000000901';

/** Sustituye a los guards de seg: pone el principal (las pruebas de los guards reales están aparte). */
export class PrincipalDePrueba implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.principal = { usuarioId: ANA, tenantId: null, tipo: 'INTERNO', aal: 'aal1', sesionId: 's', amr: [] };
    return true;
  }
}

/** Doble de un caso de uso: guarda los comandos y responde lo programado, en orden. */
export class Doble {
  llamadas: unknown[] = [];
  private respuestas: Array<() => Promise<unknown>> = [];
  private siempre: () => Promise<unknown> = async () => undefined;

  ejecutar = (comando: unknown): Promise<unknown> => {
    this.llamadas.push(comando);
    return (this.respuestas.shift() ?? this.siempre)();
  };

  responde(valor: unknown): this {
    this.siempre = async () => valor;
    return this;
  }

  falla(error: Error): this {
    this.siempre = async () => {
      throw error;
    };
    return this;
  }

  fallaUnaVez(error: Error): this {
    this.respuestas.push(async () => {
      throw error;
    });
    return this;
  }

  reiniciar(): void {
    this.llamadas = [];
    this.respuestas = [];
    this.siempre = async () => undefined;
  }
}
