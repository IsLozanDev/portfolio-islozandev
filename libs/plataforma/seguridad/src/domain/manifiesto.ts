import { ALCANCES, type Alcance } from './alcance.js';
import { CodigoPermiso } from './codigo-permiso.js';
import { ManifiestoInvalidoError, ManifiestoVersionAlteradaError, ManifiestoVersionAnteriorError } from './errores.js';

export interface ModuloManifiesto {
  codigo: string;
  nombre: string;
  orden: number;
}

export interface OpcionManifiesto {
  codigo: string;
  modulo: string;
  padre: string | null;
  nombre: string;
  ruta: string | null;
  icono: string | null;
  orden: number;
  permisos: string[];
}

export interface PermisoManifiesto {
  codigo: string;
  descripcion: string;
  alcanceMinimo: Alcance;
  sensible: boolean;
}

export interface RolManifiesto {
  codigo: string;
  nombre: string;
  permisos: string[];
}

/** Lo que hoy hay en seg para el producto. `obsoleto` marca lo retirado por una versión anterior. */
export interface CatalogoProducto {
  vigente: { version: string; hash: string } | null;
  modulos: (ModuloManifiesto & { obsoleto: boolean })[];
  opciones: (OpcionManifiesto & { obsoleto: boolean })[];
  permisos: (PermisoManifiesto & { obsoleto: boolean })[];
  roles: (RolManifiesto & { obsoleto: boolean })[];
}

export interface CambiosDe<T> {
  /** Nuevos. */
  insertados: T[];
  /** Cambiados o que vuelven a aparecer (dejan de estar obsoletos). */
  actualizados: T[];
  /** Códigos retirados: quedan `obsoleto = true`, no se borran. */
  obsoletos: string[];
}

export interface CambiosManifiesto {
  modulos: CambiosDe<ModuloManifiesto>;
  opciones: CambiosDe<OpcionManifiesto>;
  permisos: CambiosDe<PermisoManifiesto>;
  roles: CambiosDe<RolManifiesto>;
}

export type ResumenCambios = Record<keyof CambiosManifiesto, { insertados: number; actualizados: number; obsoletos: number }>;

export interface PlanManifiesto {
  /** Misma versión y mismo contenido: no se escribe nada (TR-CA-023). */
  yaAplicado: boolean;
  cambios: CambiosManifiesto;
}

const CLAVES_RAIZ = ['producto_codigo', 'nombre', 'version', 'modulos', 'opciones', 'permisos', 'roles_predefinidos', 'parametros', 'indicadores', 'reportes'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Manifiesto funcional de un producto (TR-RF-008), ya validado. Parámetros, indicadores y reportes solo se validan. */
export class Manifiesto {
  private constructor(
    readonly productoCodigo: string,
    readonly nombre: string,
    readonly version: string,
    readonly modulos: readonly ModuloManifiesto[],
    readonly opciones: readonly OpcionManifiesto[],
    readonly permisos: readonly PermisoManifiesto[],
    readonly roles: readonly RolManifiesto[],
  ) {}

  /** Valida todo antes de devolver: un solo error rechaza el manifiesto completo (TR-CA-024). */
  static leer(json: unknown): Manifiesto {
    const v = new Validador();
    const raiz = v.objeto(json, '');
    if (raiz === null) throw new ManifiestoInvalidoError(v.errores);

    for (const clave of Object.keys(raiz)) if (!CLAVES_RAIZ.includes(clave)) v.error(clave, 'clave desconocida');
    const producto = v.texto(raiz.producto_codigo, 'producto_codigo', 2, 5, /^[A-Z]+$/);
    const nombre = v.texto(raiz.nombre, 'nombre', 1, 80);
    const version = v.texto(raiz.version, 'version', 1, 20, SEMVER);

    const permisos = v.lista(raiz.permisos, 'permisos', (p, ruta) => {
      const codigo = v.texto(p.codigo, `${ruta}.codigo`, 1, 80);
      if (codigo !== null && !CodigoPermiso.esValido(codigo)) v.error(`${ruta}.codigo`, codigo);
      else if (codigo !== null && producto !== null && !codigo.startsWith(`${producto.toLowerCase()}.`)) {
        v.error(`${ruta}.codigo`, `${codigo} no es del producto ${producto}`);
      }
      const alcance = p.alcance_minimo;
      if (!ALCANCES.includes(alcance as Alcance)) v.error(`${ruta}.alcance_minimo`, String(alcance));
      if (p.sensible !== undefined && typeof p.sensible !== 'boolean') v.error(`${ruta}.sensible`, 'debe ser booleano');
      return {
        codigo: codigo ?? '',
        descripcion: v.texto(p.descripcion, `${ruta}.descripcion`, 1, 200) ?? '',
        alcanceMinimo: alcance as Alcance,
        sensible: p.sensible === true,
      };
    });
    const codigosPermiso = v.unicos(permisos, 'permisos');

    const modulos = v.lista(raiz.modulos, 'modulos', (m, ruta) => ({
      codigo: v.texto(m.codigo, `${ruta}.codigo`, 1, 40) ?? '',
      nombre: v.texto(m.nombre, `${ruta}.nombre`, 1, 100) ?? '',
      orden: v.orden(m.orden, `${ruta}.orden`),
    }));
    const codigosModulo = v.unicos(modulos, 'modulos');

    const opciones = v.lista(raiz.opciones, 'opciones', (o, ruta) => {
      const modulo = v.texto(o.modulo, `${ruta}.modulo`, 1, 40);
      if (modulo !== null && !codigosModulo.has(modulo)) v.error(`${ruta}.modulo`, `${modulo} no está en modulos`);
      return {
        codigo: v.texto(o.codigo, `${ruta}.codigo`, 1, 60) ?? '',
        modulo: modulo ?? '',
        padre: o.padre === undefined || o.padre === null ? null : v.texto(o.padre, `${ruta}.padre`, 1, 60),
        nombre: v.texto(o.nombre, `${ruta}.nombre`, 1, 100) ?? '',
        ruta: v.textoOpcional(o.ruta, `${ruta}.ruta`, 150),
        icono: v.textoOpcional(o.icono, `${ruta}.icono`, 40),
        orden: v.orden(o.orden, `${ruta}.orden`),
        permisos: v.referencias(o.permisos, `${ruta}.permisos`, codigosPermiso),
      };
    });
    v.unicos(opciones, 'opciones');
    v.jerarquia(opciones);

    const roles = v.lista(raiz.roles_predefinidos, 'roles_predefinidos', (r, ruta) => ({
      codigo: v.texto(r.codigo, `${ruta}.codigo`, 3, 50) ?? '',
      nombre: v.texto(r.nombre, `${ruta}.nombre`, 3, 100) ?? '',
      permisos: v.referencias(r.permisos, `${ruta}.permisos`, codigosPermiso),
    }));
    v.unicos(roles, 'roles_predefinidos');

    for (const clave of ['parametros', 'indicadores', 'reportes']) {
      v.lista(raiz[clave], clave, (x, ruta) => v.texto(x.codigo, `${ruta}.codigo`, 1, 80), true);
    }

    if (v.errores.length > 0 || producto === null || nombre === null || version === null) throw new ManifiestoInvalidoError(v.errores);
    return new Manifiesto(producto, nombre, version, modulos, opciones, permisos, roles);
  }

  /** JSON con claves en orden fijo: dos manifiestos iguales dan el mismo texto y el mismo hash. */
  canonico(): string {
    const { productoCodigo, nombre, version, modulos, opciones, permisos, roles } = this;
    const porCodigo = <T extends { codigo: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.codigo.localeCompare(b.codigo));
    return JSON.stringify({
      productoCodigo,
      nombre,
      version,
      modulos: porCodigo(modulos),
      opciones: porCodigo(opciones).map((o) => ({ ...o, permisos: [...o.permisos].sort() })),
      permisos: porCodigo(permisos),
      roles: porCodigo(roles).map((r) => ({ ...r, permisos: [...r.permisos].sort() })),
    });
  }

  /** Reglas de versión y diferencias contra lo que hay en seg. `hash` es el de `canonico()`. */
  planificar(actual: CatalogoProducto, hash: string): PlanManifiesto {
    const vigente = actual.vigente;
    if (vigente !== null && vigente.version === this.version) {
      if (vigente.hash !== hash) throw new ManifiestoVersionAlteradaError(this.productoCodigo, this.version);
      return { yaAplicado: true, cambios: sinCambios() };
    }
    if (vigente !== null && compararSemver(this.version, vigente.version) < 0) {
      throw new ManifiestoVersionAnteriorError(this.productoCodigo, this.version, vigente.version);
    }
    return {
      yaAplicado: false,
      cambios: {
        modulos: comparar(this.modulos, actual.modulos),
        opciones: comparar(this.opciones, actual.opciones),
        permisos: comparar(this.permisos, actual.permisos),
        roles: comparar(this.roles, actual.roles),
      },
    };
  }
}

export function resumir(cambios: CambiosManifiesto): ResumenCambios {
  const contar = (c: CambiosDe<unknown>) => ({ insertados: c.insertados.length, actualizados: c.actualizados.length, obsoletos: c.obsoletos.length });
  return { modulos: contar(cambios.modulos), opciones: contar(cambios.opciones), permisos: contar(cambios.permisos), roles: contar(cambios.roles) };
}

export function totalCambios(cambios: CambiosManifiesto): number {
  return Object.values(resumir(cambios)).reduce((n, c) => n + c.insertados + c.actualizados + c.obsoletos, 0);
}

export function compararSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function sinCambios(): CambiosManifiesto {
  const vacio = () => ({ insertados: [], actualizados: [], obsoletos: [] });
  return { modulos: vacio(), opciones: vacio(), permisos: vacio(), roles: vacio() };
}

function comparar<T extends { codigo: string }>(nuevos: readonly T[], actuales: readonly (T & { obsoleto: boolean })[]): CambiosDe<T> {
  const porCodigo = new Map(actuales.map((a) => [a.codigo, a]));
  const enManifiesto = new Set(nuevos.map((n) => n.codigo));
  const cambios: CambiosDe<T> = { insertados: [], actualizados: [], obsoletos: [] };
  for (const nuevo of nuevos) {
    const actual = porCodigo.get(nuevo.codigo);
    if (actual === undefined) cambios.insertados.push(nuevo);
    else if (actual.obsoleto || !iguales(nuevo, actual)) cambios.actualizados.push(nuevo);
  }
  cambios.obsoletos = actuales.filter((a) => !a.obsoleto && !enManifiesto.has(a.codigo)).map((a) => a.codigo).sort();
  return cambios;
}

/** Compara solo los campos del manifiesto; las listas de permisos, sin importar el orden. */
function iguales<T extends object>(nuevo: T, actual: T): boolean {
  return Object.entries(nuevo).every(([clave, valor]) => {
    const otro = (actual as Record<string, unknown>)[clave];
    if (Array.isArray(valor) && Array.isArray(otro)) return valor.length === otro.length && [...valor].sort().join() === [...otro].sort().join();
    return valor === otro;
  });
}

type Objeto = Record<string, unknown>;

/** Acumula errores con su ruta en vez de cortar en el primero. */
class Validador {
  readonly errores: string[] = [];

  error(ruta: string, detalle: string): void {
    this.errores.push(ruta === '' ? detalle : `${ruta}: ${detalle}`);
  }

  objeto(valor: unknown, ruta: string): Objeto | null {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      this.error(ruta, 'debe ser un objeto');
      return null;
    }
    return valor as Objeto;
  }

  texto(valor: unknown, ruta: string, min: number, max: number, formato?: RegExp): string | null {
    if (typeof valor !== 'string' || valor.trim().length < min || valor.trim().length > max) {
      this.error(ruta, `texto de ${min} a ${max} caracteres`);
      return null;
    }
    if (formato && !formato.test(valor)) {
      this.error(ruta, valor);
      return null;
    }
    return valor.trim();
  }

  textoOpcional(valor: unknown, ruta: string, max: number): string | null {
    return valor === undefined || valor === null ? null : this.texto(valor, ruta, 1, max);
  }

  orden(valor: unknown, ruta: string): number {
    if (valor === undefined) return 0;
    if (!Number.isInteger(valor) || (valor as number) < 0 || (valor as number) > 32767) {
      this.error(ruta, 'entero de 0 a 32767');
      return 0;
    }
    return valor as number;
  }

  /** `opcional`: la clave puede faltar (parámetros, indicadores, reportes). */
  lista<T>(valor: unknown, ruta: string, leer: (x: Objeto, ruta: string) => T, opcional = false): T[] {
    if (valor === undefined && opcional) return [];
    if (!Array.isArray(valor)) {
      this.error(ruta, 'debe ser un arreglo');
      return [];
    }
    return valor.flatMap((x, i) => {
      const obj = this.objeto(x, `${ruta}[${i}]`);
      return obj === null ? [] : [leer(obj, `${ruta}[${i}]`)];
    });
  }

  unicos(xs: readonly { codigo: string }[], ruta: string): Set<string> {
    const vistos = new Set<string>();
    for (const { codigo } of xs) {
      if (codigo !== '' && vistos.has(codigo)) this.error(ruta, `código repetido ${codigo}`);
      vistos.add(codigo);
    }
    return vistos;
  }

  referencias(valor: unknown, ruta: string, permisos: Set<string>): string[] {
    if (!Array.isArray(valor) || valor.some((x) => typeof x !== 'string')) {
      this.error(ruta, 'debe ser un arreglo de códigos');
      return [];
    }
    for (const codigo of valor as string[]) if (!permisos.has(codigo)) this.error(ruta, `${codigo} no está en permisos`);
    return [...new Set(valor as string[])];
  }

  /** El padre existe, no es la misma opción y no forma ciclos. */
  jerarquia(opciones: readonly OpcionManifiesto[]): void {
    const padreDe = new Map(opciones.map((o) => [o.codigo, o.padre]));
    opciones.forEach((o, i) => {
      if (o.padre === null) return;
      if (!padreDe.has(o.padre)) return this.error(`opciones[${i}].padre`, `${o.padre} no está en opciones`);
      const visitados = new Set([o.codigo]);
      for (let p: string | null | undefined = o.padre; p; p = padreDe.get(p)) {
        if (visitados.has(p)) return this.error(`opciones[${i}].padre`, `ciclo en ${o.codigo}`);
        visitados.add(p);
      }
    });
  }
}
