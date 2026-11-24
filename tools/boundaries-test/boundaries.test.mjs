import { ESLint } from 'eslint';

const RAIZ = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const eslint = new ESLint({ cwd: RAIZ, overrideConfigFile: 'eslint.config.mjs' });

const BOUNDARIES = '@nx/enforce-module-boundaries';
const RESTRINGIDO = 'no-restricted-imports';
const FX = 'tools/boundaries-test/fixtures';
const PLAT = 'libs/plataforma';

// esperado: null = debe pasar; { regla, mensaje } = debe fallar con esa regla y ese texto.
const casos = [
  // scope
  ['scope:shared no importa de plataforma', 'libs/shared/util/src/probe.ts', "import '@vitrina/plataforma/kernel';", { regla: BOUNDARIES, mensaje: /scope:shared/ }],
  ['scope:plataforma no importa de un producto', `${FX}/aud/src/probe.ts`, "import '@vitrina-fixtures/psi';", { regla: BOUNDARIES, mensaje: /scope:plataforma/ }],
  ['scope:plataforma importa de shared', `${FX}/aud/src/probe.ts`, "import '@vitrina/shared/util';", null],
  // type
  // Fixture sin dependencia inversa: con kernel-infra la regla reporta el ciclo y no llega a evaluar los tags.
  ['type:domain no importa de type:backend', `${PLAT}/kernel/src/probe.ts`, "import '@vitrina-fixtures/aud';", { regla: BOUNDARIES, mensaje: /type:domain/ }],
  ['type:backend importa de type:domain', `${PLAT}/kernel-infra/src/probe.ts`, "import '@vitrina/plataforma/kernel';", null],
  // componente (PL-10)
  ['comp:cfg no importa de comp:aud', `${FX}/cfg/src/probe.ts`, "import '@vitrina-fixtures/aud';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['parametros (comp:cfg) no importa de org', `${PLAT}/parametros/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['parametros (comp:cfg) no importa de comp:aud', `${PLAT}/parametros/src/probe.ts`, "import '@vitrina-fixtures/aud';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['parametros (comp:cfg) importa de seguridad y kernel', `${PLAT}/parametros/src/probe.ts`, "import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/kernel';", null],
  ['correlativos (comp:seq) no importa de org', `${PLAT}/correlativos/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:seq/ }],
  ['correlativos (comp:seq) no importa de comp:cfg', `${PLAT}/correlativos/src/probe.ts`, "import '@vitrina/plataforma/parametros';", { regla: BOUNDARIES, mensaje: /comp:seq/ }],
  ['correlativos (comp:seq) no importa de comp:aud', `${PLAT}/correlativos/src/probe.ts`, "import '@vitrina-fixtures/aud';", { regla: BOUNDARIES, mensaje: /comp:seq/ }],
  ['correlativos (comp:seq) importa de seguridad y kernel', `${PLAT}/correlativos/src/probe.ts`, "import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/kernel';", null],
  ['catalogos (comp:cat) no importa de org', `${PLAT}/catalogos/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:cat/ }],
  ['catalogos (comp:cat) no importa de comp:cfg', `${PLAT}/catalogos/src/probe.ts`, "import '@vitrina/plataforma/parametros';", { regla: BOUNDARIES, mensaje: /comp:cat/ }],
  ['catalogos (comp:cat) no importa de comp:seq', `${PLAT}/catalogos/src/probe.ts`, "import '@vitrina/plataforma/correlativos';", { regla: BOUNDARIES, mensaje: /comp:cat/ }],
  ['catalogos (comp:cat) no importa de comp:aud', `${PLAT}/catalogos/src/probe.ts`, "import '@vitrina-fixtures/aud';", { regla: BOUNDARIES, mensaje: /comp:cat/ }],
  ['catalogos (comp:cat) importa de seguridad y kernel', `${PLAT}/catalogos/src/probe.ts`, "import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/kernel';", null],
  ['eventos (comp:evt) no importa de seguridad', `${PLAT}/eventos/src/probe.ts`, "import '@vitrina/plataforma/seguridad';", { regla: BOUNDARIES, mensaje: /comp:evt/ }],
  ['eventos (comp:evt) no importa de org', `${PLAT}/eventos/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:evt/ }],
  ['eventos (comp:evt) no importa de comp:cfg', `${PLAT}/eventos/src/probe.ts`, "import '@vitrina/plataforma/parametros';", { regla: BOUNDARIES, mensaje: /comp:evt/ }],
  ['eventos (comp:evt) no importa de comp:seq', `${PLAT}/eventos/src/probe.ts`, "import '@vitrina/plataforma/correlativos';", { regla: BOUNDARIES, mensaje: /comp:evt/ }],
  ['eventos (comp:evt) importa de kernel y kernel-infra', `${PLAT}/eventos/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/kernel-infra';", null],
  ['observabilidad (comp:obs) no importa de seguridad', `${PLAT}/observabilidad/src/probe.ts`, "import '@vitrina/plataforma/seguridad';", { regla: BOUNDARIES, mensaje: /comp:obs/ }],
  ['observabilidad (comp:obs) no importa de comp:aud', `${PLAT}/observabilidad/src/probe.ts`, "import '@vitrina/plataforma/auditoria';", { regla: BOUNDARIES, mensaje: /comp:obs/ }],
  ['observabilidad (comp:obs) importa de kernel, kernel-infra y eventos', `${PLAT}/observabilidad/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/kernel-infra'; import '@vitrina/plataforma/eventos';", null],
  ['identidad (comp:idn) no importa de org', `${PLAT}/identidad/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:idn/ }],
  ['identidad (comp:idn) no importa de comp:obs', `${PLAT}/identidad/src/probe.ts`, "import '@vitrina/plataforma/observabilidad';", { regla: BOUNDARIES, mensaje: /comp:idn/ }],
  ['identidad (comp:idn) no importa de comp:cfg', `${PLAT}/identidad/src/probe.ts`, "import '@vitrina/plataforma/parametros';", { regla: BOUNDARIES, mensaje: /comp:idn/ }],
  ['identidad (comp:idn) no importa de comp:aud', `${PLAT}/identidad/src/probe.ts`, "import '@vitrina-fixtures/aud';", { regla: BOUNDARIES, mensaje: /comp:idn/ }],
  ['identidad (comp:idn) importa de kernel, seguridad y shared', `${PLAT}/identidad/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/seguridad'; import '@vitrina/shared/util';", null],
  ['comp:cfg no importa de comp:idn', `${FX}/cfg/src/probe.ts`, "import '@vitrina-fixtures/idn';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['personas (comp:per) no importa de comp:cfg', `${PLAT}/personas/src/probe.ts`, "import '@vitrina/plataforma/parametros';", { regla: BOUNDARIES, mensaje: /comp:per/ }],
  ['personas (comp:per) no importa de comp:obs', `${PLAT}/personas/src/probe.ts`, "import '@vitrina/plataforma/observabilidad';", { regla: BOUNDARIES, mensaje: /comp:per/ }],
  // Spec 37: PER valida la evidencia en ARC y audita en AUD; ninguno de los dos importa de PER.
  ['personas (comp:per) importa de archivos (comp:arc) y auditoria (comp:aud)', `${PLAT}/personas/src/probe.ts`, "import '@vitrina/plataforma/archivos'; import '@vitrina/plataforma/auditoria';", null],
  ['comp:aud no importa de comp:per', `${FX}/aud/src/probe.ts`, "import '@vitrina-fixtures/per';", { regla: BOUNDARIES, mensaje: /comp:aud/ }],
  ['personas (comp:per) importa de kernel, seguridad, org, catalogos, identidad y shared', `${PLAT}/personas/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/org'; import '@vitrina/plataforma/catalogos'; import '@vitrina/plataforma/identidad'; import '@vitrina/shared/util';", null],
  ['comp:cfg no importa de comp:per', `${FX}/cfg/src/probe.ts`, "import '@vitrina-fixtures/per';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['archivos (comp:arc) no importa de org', `${PLAT}/archivos/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:arc/ }],
  ['archivos (comp:arc) no importa de comp:cat', `${PLAT}/archivos/src/probe.ts`, "import '@vitrina/plataforma/catalogos';", { regla: BOUNDARIES, mensaje: /comp:arc/ }],
  // Con personas importando archivos (spec 37) la regla reporta el ciclo antes que los tags: se prueba con fixtures.
  ['comp:arc no importa de comp:per', `${FX}/arc/src/probe.ts`, "import '@vitrina-fixtures/per';", { regla: BOUNDARIES, mensaje: /comp:arc/ }],
  ['archivos (comp:arc) no importa de comp:obs', `${PLAT}/archivos/src/probe.ts`, "import '@vitrina/plataforma/observabilidad';", { regla: BOUNDARIES, mensaje: /comp:arc/ }],
  ['archivos (comp:arc) importa de kernel, seguridad, auditoria, eventos y shared', `${PLAT}/archivos/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/kernel-infra'; import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/auditoria'; import '@vitrina/plataforma/eventos'; import '@vitrina/shared/util';", null],
  ['comp:cfg no importa de comp:arc', `${FX}/cfg/src/probe.ts`, "import '@vitrina-fixtures/arc';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['secretos (comp:sec) no importa de seguridad', `${PLAT}/secretos/src/probe.ts`, "import '@vitrina/plataforma/seguridad';", { regla: BOUNDARIES, mensaje: /comp:sec/ }],
  ['secretos (comp:sec) no importa de org', `${PLAT}/secretos/src/probe.ts`, "import '@vitrina/plataforma/org';", { regla: BOUNDARIES, mensaje: /comp:sec/ }],
  ['secretos (comp:sec) no importa de comp:arc', `${PLAT}/secretos/src/probe.ts`, "import '@vitrina/plataforma/archivos';", { regla: BOUNDARIES, mensaje: /comp:sec/ }],
  ['secretos (comp:sec) no importa de comp:evt', `${PLAT}/secretos/src/probe.ts`, "import '@vitrina/plataforma/eventos';", { regla: BOUNDARIES, mensaje: /comp:sec/ }],
  ['secretos (comp:sec) importa de kernel, kernel-infra, auditoria y shared', `${PLAT}/secretos/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/kernel-infra'; import '@vitrina/plataforma/auditoria'; import '@vitrina/shared/util';", null],
  ['comp:arc no importa de comp:sec', `${PLAT}/archivos/src/probe.ts`, "import '@vitrina/plataforma/secretos';", { regla: BOUNDARIES, mensaje: /comp:arc/ }],
  ['notificaciones (comp:not) importa de kernel, seguridad, org, eventos, personas, observabilidad, auditoria y shared', `${PLAT}/notificaciones/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/kernel-infra'; import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/org'; import '@vitrina/plataforma/eventos'; import '@vitrina/plataforma/personas'; import '@vitrina/plataforma/observabilidad'; import '@vitrina/plataforma/auditoria'; import '@vitrina/shared/util';", null],
  ['notificaciones (comp:not) no importa de identidad', `${PLAT}/notificaciones/src/probe.ts`, "import '@vitrina/plataforma/identidad';", { regla: BOUNDARIES, mensaje: /comp:not/ }],
  ['notificaciones (comp:not) no importa de secretos', `${PLAT}/notificaciones/src/probe.ts`, "import '@vitrina/plataforma/secretos';", { regla: BOUNDARIES, mensaje: /comp:not/ }],
  ['notificaciones (comp:not) no importa de archivos', `${PLAT}/notificaciones/src/probe.ts`, "import '@vitrina/plataforma/archivos';", { regla: BOUNDARIES, mensaje: /comp:not/ }],
  ['comprobantes (comp:fe) importa de kernel, org, secretos, catalogos, parametros, auditoria, seguridad, eventos y shared', `${PLAT}/comprobantes/src/probe.ts`, "import '@vitrina/plataforma/kernel'; import '@vitrina/plataforma/kernel-infra'; import '@vitrina/plataforma/org'; import '@vitrina/plataforma/secretos'; import '@vitrina/plataforma/catalogos'; import '@vitrina/plataforma/parametros'; import '@vitrina/plataforma/auditoria'; import '@vitrina/plataforma/seguridad'; import '@vitrina/plataforma/eventos'; import '@vitrina/shared/util';", null],
  ['comprobantes (comp:fe) no importa de comp:not', `${PLAT}/comprobantes/src/probe.ts`, "import '@vitrina/plataforma/notificaciones';", { regla: BOUNDARIES, mensaje: /comp:fe/ }],
  ['comprobantes (comp:fe) no importa de comp:arc', `${PLAT}/comprobantes/src/probe.ts`, "import '@vitrina/plataforma/archivos';", { regla: BOUNDARIES, mensaje: /comp:fe/ }],
  ['comprobantes (comp:fe) no importa de comp:per', `${PLAT}/comprobantes/src/probe.ts`, "import '@vitrina/plataforma/personas';", { regla: BOUNDARIES, mensaje: /comp:fe/ }],
  ['comprobantes (comp:fe) no importa de comp:idn', `${PLAT}/comprobantes/src/probe.ts`, "import '@vitrina/plataforma/identidad';", { regla: BOUNDARIES, mensaje: /comp:fe/ }],
  ['comp:cfg no importa de comp:fe', `${FX}/cfg/src/probe.ts`, "import '@vitrina/plataforma/comprobantes';", { regla: BOUNDARIES, mensaje: /comp:cfg/ }],
  ['observabilidad-arranque (comp:obs) no importa de seguridad', `${PLAT}/observabilidad-arranque/src/probe.ts`, "import '@vitrina/plataforma/seguridad';", { regla: BOUNDARIES, mensaje: /comp:obs/ }],
  ['comp:aud importa de comp:evt', `${FX}/aud/src/probe.ts`, "import '@vitrina-fixtures/evt';", null],
  ['componente solo vía index (ruta relativa a otro proyecto)', `${FX}/aud/src/probe.ts`, "import '../../evt/src/index';", { regla: BOUNDARIES, mensaje: /relative or absolute path/ }],
  // capas
  ['domain no importa application', `${PLAT}/kernel-infra/src/domain/probe.ts`, "import '../application/x';", { regla: RESTRINGIDO, mensaje: /application/ }],
  ['domain no importa infrastructure', `${PLAT}/kernel-infra/src/domain/probe.ts`, "import '../infrastructure/x';", { regla: RESTRINGIDO, mensaje: /infrastructure/ }],
  ['domain no importa interface', `${PLAT}/kernel-infra/src/domain/probe.ts`, "import '../interface/x';", { regla: RESTRINGIDO, mensaje: /interface/ }],
  ['domain no importa NestJS', `${PLAT}/kernel-infra/src/domain/probe.ts`, "import '@nestjs/common';", { regla: RESTRINGIDO, mensaje: /NestJS/ }],
  ['domain no importa TypeORM', `${PLAT}/kernel-infra/src/domain/probe.ts`, "import 'typeorm';", { regla: RESTRINGIDO, mensaje: /TypeORM/ }],
  ['kernel completo es dominio (sin NestJS)', `${PLAT}/kernel/src/probe.ts`, "import '@nestjs/common';", { regla: RESTRINGIDO, mensaje: /NestJS/ }],
  ['application no importa infrastructure', `${PLAT}/kernel-infra/src/application/probe.ts`, "import '../infrastructure/x';", { regla: RESTRINGIDO, mensaje: /infrastructure/ }],
  ['application no importa interface', `${PLAT}/kernel-infra/src/application/probe.ts`, "import '../interface/x';", { regla: RESTRINGIDO, mensaje: /interface/ }],
  ['application no importa TypeORM', `${PLAT}/kernel-infra/src/application/probe.ts`, "import 'typeorm';", { regla: RESTRINGIDO, mensaje: /TypeORM/ }],
  ['infrastructure no importa interface', `${PLAT}/kernel-infra/src/infrastructure/probe.ts`, "import '../interface/x';", { regla: RESTRINGIDO, mensaje: /interface/ }],
  ['@supabase/* fuera de infrastructure/supabase', `${PLAT}/kernel-infra/src/infrastructure/probe.ts`, "import '@supabase/supabase-js';", { regla: RESTRINGIDO, mensaje: /Supabase/ }],
  ['@supabase/* en application', `${PLAT}/kernel-infra/src/application/probe.ts`, "import '@supabase/supabase-js';", { regla: RESTRINGIDO, mensaje: /Supabase/ }],
  ['@supabase/* dentro de infrastructure/supabase', `${PLAT}/kernel-infra/src/infrastructure/supabase/probe.ts`, "import '@supabase/supabase-js';", null],
  ['application importa domain y NestJS', `${PLAT}/kernel-infra/src/application/probe.ts`, "import '../domain/x'; import '@nestjs/common';", null],
];

describe('reglas de límites', () => {
  test.each(casos)('%s', async (_nombre, filePath, code, esperado) => {
    const [resultado] = await eslint.lintText(code + '\n', { filePath });
    const errores = resultado.messages.filter((m) => m.severity === 2 && m.ruleId !== null);
    if (esperado === null) {
      expect(errores).toEqual([]);
    } else {
      expect(errores.map((m) => m.ruleId)).toContain(esperado.regla);
      expect(errores.find((m) => m.ruleId === esperado.regla).message).toMatch(esperado.mensaje);
    }
  }, 60000);
});
