import type { Clock } from '@vitrina/plataforma/kernel';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
