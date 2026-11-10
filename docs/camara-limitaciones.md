# Revisión de digitación por cámara: limitaciones y trabajo futuro

Qué no resuelve hoy la revisión con cámara (`/acordes` → "Revisar con cámara"), por qué, y qué
haría falta para resolverlo. El registro de las pruebas que llevaron a estas conclusiones está en
[pruebas-manuales.md](pruebas-manuales.md).

## Limitaciones conocidas

### 1. La punta del dedo según el modelo de mano (la principal)
- **Qué pasa:** en Am, G y D los fallos se desplazan una cuerda hacia la 1ª de forma consistente; la
  punta del dedo se ubica a distinta altura del dedo según el dedo y el ángulo (2026-11-09).
- **Por qué:** MediaPipe Hand Landmarker se entrenó con manos vistas de forma abierta, no curvadas
  detrás del mástil de una guitarra; además la punta queda ~1 cm sobre el diapasón y la cámara la ve
  desde un ángulo (paralaje).
- **Qué se hizo:** punto de presión medido (0,15 hacia el nudillo, `PRESS_PULLBACK`), suavizado con
  detección de temblor, fijación estricta del dedo correcto. Atenúan el problema, no lo eliminan.
- **No se descartó como causa:** el mapeo del mástil. Con los trastes medidos y el mástil seguido, el
  usuario atribuye el desfase a la detección de la mano.

### 2. Una sola cámara 2D no ve si el dedo presiona
Un dedo apoyado y uno que flota justo encima se ven igual. La espera de 150 ms antes de aceptar una
lectura lo aproxima ("presionando, no pasando"), pero no lo comprueba. Combinar con el micrófono
(qué cuerdas suenan) lo resolvería en parte: quedó fuera del plan por decisión (2026-11-08).

### 3. Equipo y entorno
- **Solo computador:** en teléfono la cámara va lenta, los puntos de calibración son muy pequeños
  para tocarlos y no se puede mantener quieto. La revisión muestra un aviso en dispositivos táctiles.
- **Luz:** con poca luz la cámara baja a ~15 fps y la mano que se mueve sale borrosa. La exposición
  manual existe en la app, pero la cámara USB de las pruebas no la ofrece al navegador.
- **Lente gran angular:** dobla las líneas rectas cerca de los bordes; la medición de trastes lo
  compensa a lo largo del mástil, no a lo ancho.
- **Movimientos bruscos:** el seguimiento del mástil se tuerce o se pierde; hay que recalibrar.

### 4. Trabajo previo
La idea no es nueva: Guitar-Learning (navegador, MediaPipe, calibración de 4 puntos), JamCam,
Burns y Wanderley (NIME 2006), la identificación de acordes audio+video (ISMIR 2010), TapToTab (2024)
y GuiFiR (2026). Lo propio de PlainChord: integrado en una referencia tranquila con acordes,
transiciones y tablaturas; modelo de mástil en abanico; medición de trastes; seguimiento del mástil
propio (Shi-Tomasi + Lucas-Kanade + RANSAC con similitud); todo en el navegador, sin servidor.

## Trabajo futuro: mejorar la punta del dedo con datos

### Dataset existente: GuiFiR
- **Qué es:** "GuiFiR: Weakly-Supervised Learning of Hand Pose Estimation for Guitar Finger Reading"
  (IEEE Access, 2026). Repositorio: https://github.com/kmu-ee-ailab/guifir_dataset
- **Contenido:** 1.030 clips reales de guitarra, 29.051 fotogramas anotados (traste por cuerda 0-20,
  esquinas del diapasón, caja de la mano y puntas de los dedos con los **mismos índices de
  MediaPipe** que usa PlainChord: 4, 8, 12, 16, 20). Más un conjunto sintético (manos compuestas sobre
  diapasones con coordenadas). El entrenamiento usa solo la tablatura (supervisión débil); validación
  y prueba tienen la pose de la mano verificada.
- **Licencia de los datos:** solo investigación no comercial, educación y reproducibilidad. Sirve
  para la tesis; antes de publicar un modelo entrenado con ellos en la app hay que revisarla (la app
  es gratuita, pero contempla un plan premium a futuro).

### Cómo se usaría (de menor a mayor esfuerzo)
1. **Medir antes de entrenar:** correr el pipeline actual sobre los fotogramas de validación/prueba
   de GuiFiR y calcular cuántas lecturas (cuerda, traste) coinciden con la etiqueta. Da la línea
   base honesta para el informe.
2. **Modelo de corrección pequeño:** en vez de reentrenar MediaPipe, aprender una corrección de la
   punta: entrada = los 21 puntos de la mano + la posición del mástil; salida = el punto de contacto
   real. Un modelo chico (regresión o red pequeña) que corre en el navegador sin costo apreciable.
3. **Datos propios:** grabar acordes conocidos con la cámara de la demo y etiquetarlos (el acorde
   ya dice dónde va cada dedo, lo que abarata el etiquetado), para ajustar al ángulo y la cámara reales.
4. **Reentrenar o ajustar el modelo de mano** con GuiFiR: lo más caro; solo si 1-3 no alcanzan.

### Qué se podría reportar
Precisión (cuerda, traste) por dedo antes y después de la corrección, sobre GuiFiR y sobre las
grabaciones propias; confusión típica (¿siempre una cuerda hacia la 1ª?).
