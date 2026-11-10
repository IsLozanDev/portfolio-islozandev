// Proceso de prueba: un servidor HTTP que escribe un log con pino en cada solicitud y anuncia su puerto.
import http from 'node:http';
import pino from 'pino';

const logger = pino();
const servidor = http.createServer((_solicitud, respuesta) => {
  logger.info('solicitud atendida');
  respuesta.end('ok');
});
servidor.listen(0, '127.0.0.1', () => process.stdout.write(`PUERTO ${servidor.address().port}\n`));
