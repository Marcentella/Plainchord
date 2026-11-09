# Registro de pruebas manuales

Pruebas hechas con hardware real (guitarra, cámara, micrófono, teléfono), en orden. Cada entrada:
qué se probó, con qué equipo, qué se observó, y qué cambió en el código por eso. Las pruebas
automáticas viven en `lib/*.test.ts` (`node --test lib/*.test.ts`); esto es lo que solo se puede
ver con una guitarra en la mano.

**Equipo de las pruebas** (salvo que se diga otra cosa): PC Windows 11 con Chrome; cámara web USB
(1280×720, ~15 fps con poca luz); interfaz de audio Focusrite (guitarra en la entrada 2, canal
derecho); guitarra eléctrica tipo Stratocaster, diapasón oscuro con marcadores de punto. Pieza con
poca luz y una lámpara blanca.

---

## Transcripción audio → tablatura (experimento, `/tablatura?debug`)

### 2026-11-05 — Primera prueba con guitarra real
- **Probado:** grabar unas notas sueltas a 80 BPM con la guitarra por la Focusrite.
- **Observado:** salían 1-2 notas, todas incorrectas, aunque la Focusrite mostraba señal.
- **Causa:** la Focusrite pone el instrumento en la entrada 2 (canal derecho) y Chrome entrega el
  estéreo sin mezclar cuando se desactiva la cancelación de eco; la grabación leía solo el canal
  izquierdo (la entrada de micrófono, vacía).
- **Cambio:** la grabación mezcla a mono antes de analizar (`components/RecordTabModal.tsx`).

### 2026-11-05 — Segunda prueba (3 tomas guardadas en WAV con `?debug`)
- **Observado:** casi no detectaba notas; la grabación sonaba bien; la toma parecía empezar tarde.
- **Análisis de las tomas:** la señal estaba sana (pico 0,35-0,45). Fallaban dos cosas: las cuerdas
  siguen sonando bajo la nota siguiente (sin un tono único: Pitchy daba 20-50 Hz) y el pulsado nuevo
  solo subía el volumen 1,4-1,6× (el umbral era 1,6×). El "empieza tarde" era la reacción normal
  (~0,4 s después de la cuenta).
- **Cambio:** detección rehecha: inicios por flujo espectral (SuperFlux), tono de cada pulsado por
  lo que el pulsado añadió al espectro, corrección de octava, y la grilla anclada a la primera nota.
  Con eso dos tomas dieron E2 · C3 · E3 · G3 · C4.
- **Decisión (2026-11-07):** sigue siendo impreciso para uso real y nadie querría transcribir así;
  queda como experimento detrás de `?debug`, no como función.

---

## Revisión de digitación por cámara

### 2026-11-08 — Paso 1: cámara + esqueleto de la mano (`/dev/camera`)
- **Medido:** aceleración GPU; inferencia ~28 ms con la mano en cuadro, 5-15 ms sin mano; 15 fps a
  1280×720 (límite de la cámara con poca luz, no de la app).
- **Observado:** funciona y es rápido; con piel clara y bien iluminada el esqueleto blanco casi no se
  veía; la mano que rasguea sale borrosa (exposición larga).
- **Cambio:** esqueleto celeste; se pide 30 fps a la cámara; controles de exposición en el Paso 2.

### 2026-11-08 — Paso 2: calibración y lectura de cuerda/traste
- **Observado:**
  - "Lee bastante bien"; a veces confunde la cuerda vecina (difícil mantener la guitarra quieta).
  - El pulgar, escondido tras el mástil, hacía saltar el esqueleto.
  - Permitía una calibración imposible (puntos del traste cruzados: forma de corbatín).
  - Faltaban ayudas visuales para saber qué es la cejuela y qué alambre tocar.
  - Un acorde de Do se leyó con las cuerdas espejadas: los clics se hicieron empezando por la 1ª cuerda.
- **Cambio:** el orden de los clics ya no importa (la 6ª cuerda es el borde de arriba en pantalla);
  se rechazan formas imposibles con su motivo; traste de calibración elegible (5/7/12); dibujo guía
  de qué tocar; pulgar oculto.

### 2026-11-08 — Calibración en el traste 12
- **Observado:** lectura menos precisa que calibrando en el 5; la cuadrícula comprimía los trastes
  hacia la cejuela. El selector de traste no respondía.
- **Causa:** el mástil se modelaba como rectángulo, pero las cuerdas se abren (≈35 mm en la cejuela,
  ≈44 mm en el traste 12); la apertura se leía como perspectiva. En prueba sintética: un traste de
  error a mitad del mástil. El selector estaba deshabilitado mientras se calibraba.
- **Cambio:** modelo de mástil en abanico; selector siempre activo; texto de los clics corregido.

### 2026-11-08 — Seguimiento del mástil (Paso 2b)
- **Observado:** "se ve fantástico", calza mejor con el mástil real; a 15 fps funciona; solo se
  tuerce con movimientos violentos; se pierde en momentos razonables.
- **Cambio:** los clics de calibración se ocultan al terminar (quedaban donde estuvo el mástil).

### 2026-11-08 — Punto de presión del dedo
- **Observado:** con 0,3 (hacia el nudillo) la lectura caía una cuerda más abajo. Se probó el
  deslizador: con **0,15** la mayoría de los dedos de un Do leían la cuerda y traste correctos.
- **Hipótesis del usuario (confirmada en el código):** se pisa con la punta, y desde una cámara de
  frente los dedos suben desde el borde de la 1ª cuerda, así que retroceder hacia el nudillo baja una cuerda.
- **Cambio:** valor por defecto 0,15.

### 2026-11-09 — Paso 3: comparación con el acorde (`/acordes` → "Revisar con cámara")
- **Acordes probados:** Am, G, D (y F en la lista).
- **Observado:**
  - Desfase sistemático de una cuerda hacia la 1ª en todos los fallos: Am índice cuerda 1 en vez de
    2; G anular 5 en vez de 6; G meñique 2 en vez de 1; D índice 2 en vez de 3.
  - La punta del dedo se detecta a distinta altura del dedo (el modelo no espera manos tras un mástil).
  - Esqueleto con temblor.
  - El mástil digital gira en sentido antihorario cuando la mano lo tapa mucho, sin mover la guitarra.
  - No gustó el círculo punteado grande en el diagrama.
  - El recuadro negro antes de activar la cámara era muy alto y el texto quedaba abajo.
- **Cambio:** ajuste de similitud (sin giro falso; en prueba con ruido: 25 px de deriva antes, <1 px
  después); toda la mano suavizada; puntos en los nudillos; punto gris del tamaño normal en el
  diagrama; recuadro 16:9 con el texto centrado.

### 2026-11-09 — Después de los cambios del Paso 3
- **Observado:** el dedo 3 se ve claramente en la 6ª cuerda pero se lee en la 5ª (mismo desfase).
  Pidió suavizado extra contra el temblor, quitar los contornos y "fijar" el dedo correcto.
- **Cambio:** fijación de dedos (estricta: solo desde una lectura exacta, se suelta al moverse una
  cuerda completa); detección de temblor en el suavizado; sin contornos en el esqueleto.
- **Resultado:** "se ve y se siente un poco mejor".
- **Pendiente:** el desfase de una cuerda (paso "Ajustar dedos", o detección de cuerdas para saber
  si es el mapeo de cuerdas o el paralaje de la punta).

### 2026-11-09 — Teléfono (Xiaomi antiguo) en producción (plainchord.vercel.app)
- **Observado:** la cámara va lenta; los puntos de calibración son demasiado pequeños para tocarlos;
  es casi imposible mantener el teléfono quieto mientras se toca la pantalla.
- **Cambio:** en dispositivos táctiles la revisión muestra un aviso ("funciona en un computador con
  cámara web") en lugar de la cámara, sin pedir permiso de cámara.

### 2026-11-09 — Espacios entre trastes "a veces sí, a veces no"
- **Observado:** la lectura de cada espacio entre trastes era irregular.
- **Causa probable:** error de los clics, distorsión del lente gran angular y trastes lejanos de pocos
  píxeles (la escala del mástil no influye: dos clics la fijan).
- **Cambio:** medición de los alambres de los trastes tras calibrar (`lib/fretDetection.ts`). En
  prueba sintética: error ≤0,15 traste hasta el 18, frente a hasta 2,1 trastes solo con el modelo.
- **Pendiente:** probarlo con la cámara real.

---

## Pruebas pendientes
- Medición de trastes con la cámara real: ¿cuántos alambres encuentra (estado "Trastes medidos: N de 20")?
  ¿La cuadrícula cae sobre los alambres reales del 1 al 15?
- Desfase de una cuerda: repetir Am, G, D tras la medición de trastes y anotar si persiste.
- Exposición manual: ¿la cámara USB ofrece los ajustes? ¿Mejora con la lámpara hacia el mástil?
- Otra cámara (integrada de notebook) y otra luz, para la demo.
- Acorde con cejilla (F) completo.
