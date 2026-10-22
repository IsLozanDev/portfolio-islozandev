export default {
  extends: ['@commitlint/config-conventional'],
  // Los cuerpos generados por Copilot traen líneas largas; el límite de 100 no aporta.
  rules: { 'body-max-line-length': [0] },
};
