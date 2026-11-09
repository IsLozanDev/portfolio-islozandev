import type { Provider } from '@angular/core';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { AdaptadorFechaPeru } from '../services/adaptador-fecha-peru.service';
import { CalendarioEnEspanol } from '../services/calendario-en-espanol.service';

const LOCALE_PERU = 'es-PE';

/** El datepicker en `dd/MM/yyyy` y con los textos en español, para las páginas que lo usan. */
export function provideFechaPeru(): Provider[] {
  return [
    provideNativeDateAdapter(),
    { provide: DateAdapter, useClass: AdaptadorFechaPeru },
    { provide: MAT_DATE_LOCALE, useValue: LOCALE_PERU },
    { provide: MatDatepickerIntl, useClass: CalendarioEnEspanol },
  ];
}
