import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { CONFIG_AUTH } from './config';
import { SesionService } from './sesion.service';

/** Agrega Authorization y X-Sucursal-Id SOLO a llamadas hacia la API propia. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const cfg = inject(CONFIG_AUTH);
  if (!req.url.startsWith(cfg.apiUrl)) return next(req);
  const sesion = inject(SesionService);
  const token = sesion.token();
  const sucursal = sesion.sucursalId();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (sucursal) headers['X-Sucursal-Id'] = sucursal;
  return next(req.clone({ setHeaders: headers }));
};
