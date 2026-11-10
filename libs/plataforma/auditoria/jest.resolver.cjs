// Los imports ESM llevan extensión .js; en pruebas el archivo real es .ts.
module.exports = (ruta, opciones) => {
  try {
    return opciones.defaultResolver(ruta, opciones);
  } catch (error) {
    if (/^\.{1,2}\/.*\.js$/.test(ruta)) return opciones.defaultResolver(ruta.replace(/\.js$/, '.ts'), opciones);
    throw error;
  }
};
