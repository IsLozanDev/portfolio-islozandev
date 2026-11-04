// Permite `import html from './index.html' with { loader: 'text' }` en las pruebas.
declare module '*.html' {
  const contenido: string;
  export default contenido;
}
