# Screen Mirror VR

App web para duplicar la pantalla del PC al móvil. En el receptor (móvil) puedes elegir cómo se ve: pantalla completa o vista dividida **VR (SBS)** para usar el móvil con unas gafas tipo cardboard.

**100% local**: no depende de ningún servidor remoto. Todo corre en tu máquina.

## Requisitos

- **Node.js** 18 o superior
- Navegador con soporte para **getDisplayMedia** y **WebRTC** (Chrome, Edge, Firefox; en Windows y Linux)
- PC y móvil en la **misma red** (WiFi o móvil con USB tethering al PC)

## Cómo ejecutar

1. Clona el repo e instala dependencias:

   ```bash
   npm install
   ```

2. Arranca el servidor en tu PC:

   ```bash
   npm start
   ```

3. En el **PC**: abre en el navegador `http://localhost:3000`, pulsa **Compartir pantalla (PC)** y luego **Compartir pantalla**. Acepta el permiso de captura. Verás una URL.

4. En el **móvil** (misma WiFi, o conectado por USB con tethering): abre en el navegador la URL que muestra la app (ej. `http://192.168.1.x:3000`), pulsa **Ver pantalla (móvil)** y luego **Ver pantalla**.

5. La señalización va por el WebSocket del servidor que corre en tu PC; el vídeo y el audio van **P2P** entre navegador del PC y del móvil. En el móvil puedes cambiar la vista a **Normal** o **VR (SBS)**.

No hay cuentas ni backend en la nube; el único proceso es el que tú ejecutas con `npm start`.

## Conexión del móvil

- **Wireless**: PC y móvil en el mismo WiFi. En la app del PC se muestra una URL con la IP local (ej. `http://192.168.1.x:3000`). Ábrela en el navegador del móvil.
- **Wired**: Conecta el móvil al PC por USB y activa **Compartir Internet / USB tethering**. El móvil obtendrá IP de la red del PC; usa la URL que muestra la app en el PC.

## STUN / TURN (opcional)

Por defecto no se usa ningún servidor STUN ni TURN. La app puede funcionar en la misma red (PC y móvil en el mismo WiFi) si el navegador ofrece candidatos ICE alcanzables.

Si **no se ve la pantalla** en el receptor (móvil o segunda pestaña), prueba:

1. **Abrir la consola del navegador** (F12 → Consola) en el emisor y en el receptor. Deberías ver mensajes como `[Sender] Offer sent`, `[Receiver] Offer received`, `[Receiver] Answer sent`, `[Sender] Answer received` y `Connection state: connected`. Si el estado se queda en `checking` o pasa a `failed`, suele ser un problema de red/NAT.
2. **Usar STUN** para que WebRTC descubra direcciones alcanzables. Reinicia el servidor con:

```bash
STUN_URL=stun:stun.l.google.com:19302 npm start
```

Para no depender de servicios externos, puedes montar tu propio STUN (p. ej. [coturn](https://github.com/coturn/coturn)) en tu red y usar:

```bash
STUN_URL=stun:192.168.1.10:3478 npm start
```

El tráfico de vídeo/audio sigue siendo P2P; STUN solo se usa para descubrir direcciones.

## Puerto

Por defecto el servidor usa el puerto **3000**. Para usar otro:

```bash
PORT=8080 npm start
```

## Licencia

MIT
