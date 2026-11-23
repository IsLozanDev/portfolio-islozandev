import { Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SesionService } from '@vitrina/shared/auth';
import { ChipEstadoComponent } from '@vitrina/shared/ui';
import { catchError, concat, debounceTime, map, of, switchMap, type Observable } from 'rxjs';
import type { ModoBuscador, PedidoAlta, PersonaElegida, ResultadoBuscador } from '../../models/buscador';
import type { PersonaListada, ResultadoBusquedaDocumento } from '../../models/busqueda';
import { aErrorPersonas } from '../../models/error-personas';
import { ETIQUETAS_TIPO_DOCUMENTO } from '../../models/etiquetas-personas';
import { MENSAJES_BUSCADOR, TIPOS_BUSQUEDA } from '../../models/mensajes-buscador';
import { avisoSinPrellenado, ETIQUETAS_COINCIDENCIA, fuenteDeIdentidad, mensajeDeError } from '../../models/mensajes-personas';
import type { PersonaResumen, TipoDocumento } from '../../models/persona';
import { PERMISOS_PERSONAS } from '../../models/permisos-personas';
import { TONO_ROL, TONOS_COINCIDENCIA } from '../../models/tonos-personas';
import { PersonasCliente } from '../../services/personas.cliente';
import { clasificarEntrada, type EntradaClasificada, type TipoElegido } from '../../utils/clasificar-entrada';
import { denominacionDe, inicialesDe, inicialesDeTexto, nombreCompletoDe } from '../../utils/denominacion';
import { formatoCelular } from '../../utils/formato-contacto';
import { formatoDocumento, formatoRol } from '../../utils/formato-persona';

/** TR-RNF-001: espera tras la última tecla antes de buscar; una búsqueda nueva aborta la anterior. */
export const ESPERA_BUSQUEDA_MS = 300;
export const MAXIMO_SUGERENCIAS = 8;
/** CE y pasaporte no tienen longitud fija: se buscan al pulsar Enter. */
const TIPOS_CON_ENTER: readonly TipoDocumento[] = ['CE', 'PASAPORTE'];
const AVISO_POR_DEFECTO = 'NO_ENCONTRADO_EN_IDENTIDAD';
const TECLAS_NAVEGACION = { abajo: 'ArrowDown', arriba: 'ArrowUp', enter: 'Enter' } as const;

let siguienteBuscador = 0;

interface Busqueda {
  entrada: EntradaClasificada;
  confirmado: boolean;
}

/** El error del documento se muestra mientras se escribe, sin esperar a que el campo pierda el foco. */
const ERROR_AL_ESCRIBIR: ErrorStateMatcher = { isErrorState: (control) => !!control && control.invalid && (control.dirty || control.touched) };

/**
 * `<ui-persona-buscador>` del SRS: un campo que entiende nombre, DNI, RUC, celular o correo. En modo selección
 * sugiere personas, busca exacto por documento con el prellenado de TR-IDN y pide el alta; en modo lista solo
 * emite el texto. No registra: el alta la hace quien recibe `registrar` (`vit-panel-nueva-persona`).
 */
@Component({
  selector: 'vit-persona-buscador',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    ChipEstadoComponent,
  ],
  templateUrl: './persona-buscador.component.html',
  styleUrl: './persona-buscador.component.css',
})
export class PersonaBuscadorComponent implements OnInit {
  private readonly personas = inject(PersonasCliente);
  private readonly sesion = inject(SesionService);

  readonly modo = input<ModoBuscador>('seleccion');
  readonly permitirAlta = input(true);
  readonly etiqueta = input<string>(MENSAJES_BUSCADOR.etiqueta);
  readonly etiquetaUsar = input<string>(MENSAJES_BUSCADOR.usar);
  /** Texto con el que arranca (la lista lo restaura desde la URL). */
  readonly consultaInicial = input('');

  readonly seleccionada = output<PersonaElegida>();
  readonly registrar = output<PedidoAlta>();
  /** Modo lista: el texto a filtrar, tras la espera; vacío limpia el filtro. */
  readonly consulta = output<string>();

  protected readonly mensajes = MENSAJES_BUSCADOR;
  protected readonly tipos = TIPOS_BUSQUEDA;
  protected readonly errorAlEscribir = ERROR_AL_ESCRIBIR;
  protected readonly idLista = `vit-persona-buscador-${siguienteBuscador++}`;
  protected readonly tonoRol = TONO_ROL;

  protected readonly tipo = signal<TipoElegido>('AUTO');
  protected readonly texto = new FormControl('', { nonNullable: true, validators: (control) => this.validarDocumento(control) });
  private readonly valor = toSignal(this.texto.valueChanges, { initialValue: '' });
  private readonly confirmado = signal(false);
  protected readonly entrada = computed(() => clasificarEntrada(this.valor(), this.tipo()));
  protected readonly resultado = signal<ResultadoBuscador>({ tipo: 'nada' });
  protected readonly activa = signal(0);

  protected readonly enSeleccion = computed(() => this.modo() === 'seleccion');
  protected readonly textoTipo = computed(() => TIPOS_BUSQUEDA.find((opcion) => opcion.codigo === this.tipo())?.texto ?? '');
  protected readonly puedeRegistrar = computed(() => this.permitirAlta() && this.sesion.tiene(PERMISOS_PERSONAS.registrar));
  protected readonly ayuda = computed(() => this.ayudaDe(this.entrada(), this.confirmado()));
  protected readonly mensajeInvalido = computed(() => {
    const entrada = this.entrada();
    return entrada.clase === 'INVALIDA' ? entrada.mensaje : '';
  });
  protected readonly buscando = computed(() => this.resultado().tipo === 'buscando');

  protected readonly sugerencias = computed(() => {
    const resultado = this.resultado();
    if (resultado.tipo !== 'sugerencias') return [];
    return resultado.personas.slice(0, MAXIMO_SUGERENCIAS).map((persona, indice) => this.vistaSugerencia(persona, indice));
  });
  protected readonly conSugerencias = computed(() => this.sugerencias().length > 0);
  protected readonly idActiva = computed(() => (this.conSugerencias() ? `${this.idLista}-${this.activa()}` : null));
  protected readonly cantidad = computed(() => {
    const resultado = this.resultado();
    return resultado.tipo === 'sugerencias' ? resultado.total : 0;
  });
  protected readonly sinResultados = computed(() => this.resultado().tipo === 'sin-resultados');
  protected readonly error = computed(() => {
    const resultado = this.resultado();
    return resultado.tipo === 'error' ? resultado.mensaje : null;
  });
  protected readonly encontrada = computed(() => {
    const resultado = this.resultado();
    if (resultado.tipo !== 'encontrada') return null;
    const { persona } = resultado;
    return { persona, denominacion: denominacionDe(persona), iniciales: inicialesDe(persona), documento: formatoDocumento(persona.tipoDocumento, persona.numeroDocumento) };
  });
  protected readonly nueva = computed(() => {
    const resultado = this.resultado();
    if (resultado.tipo !== 'nueva') return null;
    const { pedido } = resultado;
    const documento = formatoDocumento(pedido.tipoDocumento, pedido.numeroDocumento);
    if (pedido.prellenado) {
      const nombre = nombreCompletoDe(pedido.prellenado);
      return { pedido, documento, prellenado: { nombre, iniciales: inicialesDe(pedido.prellenado), fuente: fuenteDeIdentidad(pedido.tipoDocumento) } };
    }
    return { pedido, documento, prellenado: null, aviso: avisoSinPrellenado(pedido.tipoDocumento, pedido.aviso ?? AVISO_POR_DEFECTO) };
  });
  protected readonly anuncio = computed(() => {
    const resultado = this.resultado();
    if (resultado.tipo === 'sugerencias') return MENSAJES_BUSCADOR.anuncioResultados(resultado.total);
    if (resultado.tipo === 'sin-resultados') return MENSAJES_BUSCADOR.sinResultados(this.valor());
    if (resultado.tipo === 'encontrada') return MENSAJES_BUSCADOR.yaRegistrada;
    return '';
  });

  constructor() {
    this.texto.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.confirmado.set(false));
    toObservable(computed<Busqueda>(() => ({ entrada: this.entrada(), confirmado: this.confirmado() })))
      .pipe(
        debounceTime(ESPERA_BUSQUEDA_MS),
        switchMap((busqueda) => this.resolver(busqueda)),
        takeUntilDestroyed(),
      )
      .subscribe((resultado) => {
        this.resultado.set(resultado);
        this.activa.set(0);
      });
  }

  ngOnInit(): void {
    if (this.consultaInicial()) this.texto.setValue(this.consultaInicial());
  }

  protected elegirTipo(tipo: TipoElegido): void {
    this.tipo.set(tipo);
    this.texto.updateValueAndValidity();
  }

  protected limpiar(): void {
    this.texto.setValue('');
  }

  protected tecla(evento: KeyboardEvent): void {
    const total = this.sugerencias().length;
    if (evento.key === TECLAS_NAVEGACION.abajo && total > 0) {
      evento.preventDefault();
      this.activa.set(Math.min(this.activa() + 1, total - 1));
      return;
    }
    if (evento.key === TECLAS_NAVEGACION.arriba && total > 0) {
      evento.preventDefault();
      this.activa.set(Math.max(this.activa() - 1, 0));
      return;
    }
    if (evento.key !== TECLAS_NAVEGACION.enter) return;
    evento.preventDefault();
    const activa = this.sugerencias()[this.activa()];
    if (activa) {
      this.elegir(activa.persona);
      return;
    }
    if (this.entrada().clase === 'DOCUMENTO') this.confirmado.set(true);
  }

  protected elegir(persona: PersonaListada): void {
    this.emitirSeleccion(persona, persona.denominacion);
  }

  protected usarEncontrada(): void {
    const encontrada = this.encontrada();
    if (!encontrada) return;
    this.emitirSeleccion(encontrada.persona, encontrada.denominacion);
  }

  protected pedirAlta(pedido: PedidoAlta): void {
    this.registrar.emit(pedido);
  }

  private emitirSeleccion({ id, tipoDocumento, numeroDocumento }: PersonaListada | PersonaResumen, denominacion: string): void {
    this.seleccionada.emit({ id, denominacion, tipoDocumento, numeroDocumento });
  }

  private validarDocumento(control: AbstractControl<string>): ValidationErrors | null {
    const entrada = clasificarEntrada(control.value ?? '', this.tipo());
    return entrada.clase === 'INVALIDA' ? { documento: entrada.motivo } : null;
  }

  /** Lo que se busca, tras la espera. En modo lista no se llama a la API: solo se avisa el texto. */
  private resolver({ entrada, confirmado }: Busqueda): Observable<ResultadoBuscador> {
    const nada: ResultadoBuscador = { tipo: 'nada' };
    if (entrada.clase === 'CORTA' || entrada.clase === 'INVALIDA') return of(nada);
    if (!this.enSeleccion()) {
      this.consulta.emit(entrada.clase === 'VACIA' ? '' : this.valor().trim());
      return of(nada);
    }
    if (entrada.clase === 'VACIA') return of(nada);
    if (entrada.clase === 'DOCUMENTO') {
      if (TIPOS_CON_ENTER.includes(entrada.tipo) && !confirmado) return of(nada);
      const peticion = this.personas.observarBusquedaDocumento(entrada.tipo, entrada.numero);
      return this.conEspera(peticion.pipe(map((encontrado) => this.resultadoDeDocumento(entrada.tipo, entrada.numero, encontrado))));
    }
    const peticion = this.personas.observarListado({ q: entrada.valor, tamano: MAXIMO_SUGERENCIAS });
    return this.conEspera(
      peticion.pipe(map((listado): ResultadoBuscador => (listado.total === 0 ? { tipo: 'sin-resultados' } : { tipo: 'sugerencias', personas: listado.items, total: listado.total }))),
    );
  }

  private conEspera(peticion: Observable<ResultadoBuscador>): Observable<ResultadoBuscador> {
    const fallo = (error: unknown) => of<ResultadoBuscador>({ tipo: 'error', mensaje: mensajeDeError(aErrorPersonas(error)) });
    return concat(of<ResultadoBuscador>({ tipo: 'buscando' }), peticion.pipe(catchError(fallo)));
  }

  private resultadoDeDocumento(tipoDocumento: TipoDocumento, numeroDocumento: string, encontrado: ResultadoBusquedaDocumento): ResultadoBuscador {
    if (encontrado.encontrada) return { tipo: 'encontrada', persona: encontrado.persona };
    return { tipo: 'nueva', pedido: { tipoDocumento, numeroDocumento, prellenado: encontrado.prellenado, aviso: encontrado.aviso } };
  }

  private ayudaDe(entrada: EntradaClasificada, confirmado: boolean): string {
    const ayuda = MENSAJES_BUSCADOR.ayuda;
    if (entrada.clase === 'CORTA') return entrada.mensaje;
    if (entrada.clase === 'DOCUMENTO') {
      const esperaEnter = this.enSeleccion() && TIPOS_CON_ENTER.includes(entrada.tipo) && !confirmado;
      return esperaEnter ? ayuda.esperaEnter : ayuda.documento(ETIQUETAS_TIPO_DOCUMENTO[entrada.tipo]);
    }
    if (entrada.clase === 'NUMERO') return ayuda.numero;
    if (entrada.clase === 'CORREO') return ayuda.correo;
    if (entrada.clase === 'TEXTO') return ayuda.texto;
    return ayuda.vacia;
  }

  private vistaSugerencia(persona: PersonaListada, indice: number) {
    return {
      persona,
      id: `${this.idLista}-${indice}`,
      activa: indice === this.activa(),
      iniciales: inicialesDeTexto(persona.denominacion),
      documento: formatoDocumento(persona.tipoDocumento, persona.numeroDocumento),
      celular: persona.celularPrincipal ? formatoCelular(persona.celularPrincipal) : null,
      coincidencia: persona.coincidencia ? { texto: ETIQUETAS_COINCIDENCIA[persona.coincidencia], tono: TONOS_COINCIDENCIA[persona.coincidencia] } : null,
      roles: persona.roles.map(({ productoCodigo, rol }) => formatoRol(productoCodigo, rol)),
    };
  }
}
