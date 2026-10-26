import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { MiContextoRespuesta } from '../lib/models/mi-contexto';
import { contextoDePrueba, DobleSupabase, proveerAuthDePrueba, responderMiContexto, sesionDePrueba } from './doble-supabase';

@Component({ template: 'pagina' })
export class PaginaDePrueba {}

/** Arnés de router para probar guards con el doble de Supabase y la API simulada. */
export class RutasDePrueba {
  readonly supabase = new DobleSupabase();
  private http: HttpTestingController | null = null;

  constructor(private readonly rutas: Routes) {}

  get api(): HttpTestingController {
    if (!this.http) throw new Error('Configurar antes de usar la API simulada');
    return this.http;
  }

  configurar(): void {
    TestBed.configureTestingModule({
      providers: [...proveerAuthDePrueba(this.supabase), provideRouter([...this.rutas, { path: '**', component: PaginaDePrueba }])],
    });
    this.http = TestBed.inject(HttpTestingController);
  }

  /** Navega mientras responde el `mi-contexto` que pide `iniciar()`. */
  async navegarConSesion(url: string, contexto: MiContextoRespuesta = contextoDePrueba()): Promise<string> {
    this.supabase.sesionGuardada = sesionDePrueba();
    this.configurar();
    const harness = await RouterTestingHarness.create();
    await Promise.all([harness.navigateByUrl(url), responderMiContexto(this.api, contexto)]);
    return TestBed.inject(Router).url;
  }

  async navegarSinSesion(url: string): Promise<string> {
    this.configurar();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  verificar(): void {
    this.http?.verify();
  }
}
