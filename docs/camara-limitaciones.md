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
- **Licencia de los datos** (`DATASET_TERMS.md`): investigación no comercial y educación. Permite
  publicar resultados y **pesos de modelos derivados**; prohíbe redistribuir los datos y el uso
  comercial sin permiso escrito de los autores. Un modelo entrenado con GuiFiR puede ir en la app
  gratuita citando el artículo; si el plan premium llega a cobrar, hay que pedir ese permiso.
  Los datos viven fuera del repositorio y nunca se suben.
- **Detalles encontrados al usarlo (2026-11-11):** el entrenamiento trae solo la tablatura, no la
  posición de los dedos; las puntas verificadas están solo en validación y prueba (~2.600
  fotogramas). Las etiquetas de fotograma van en base de 30 fps sin importar la del video. Esquinas
  `rt/rb` = cejuela, `lt/lb` = fin del diapasón, "t" = lado de la 6ª. Son en su mayoría notas sueltas
  (1-2 por fotograma), no acordes completos, grabadas desde el frente como en PlainChord.
- **Línea base:** `scripts/guifir/landmarks.py` (corre el mismo modelo de mano de la app sobre los
  clips) y `scripts/guifir/baseline.mjs` (lo puntúa con `lib/fretMapping.ts`).

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

### Línea base medida (2026-11-11)
GuiFiR validación + prueba: 2.591 fotogramas, 130 clips, 2.975 notas pisadas. Las esquinas
etiquetadas reemplazan la calibración, así que lo medido es el modelo de mano y el mapeo.

| Puntos usados | Notas leídas exactas (cuerda y traste) | Con la mano hallada |
|---|---|---|
| Puntas etiquetadas a mano (techo del mapeo) | 81,4 % | 81,4 % |
| Modelo de mano, punto de presión 0,15 (la app) | 41,0 % | 55,8 % |

- El modelo **no encuentra la mano en el 29 %** de los fotogramas (1.837 de 2.591).
- Cuando la encuentra, el error está **a lo ancho del mástil**, no a lo largo: mediana de
  0,4-0,6 cuerdas contra 0,1 trastes. Entre el 40 % (índice) y el 56 % (meñique) de las puntas
  queda a más de media cuerda, es decir, en la cuerda equivocada.
- El sesgo depende del dedo: índice y medio casi sin sesgo, anular hacia la 6ª (−0,23 cuerdas),
  meñique hacia la 1ª (+0,67). Un solo `PRESS_PULLBACK` para todos los dedos no puede corregirlo
  (0 y 0,15 dan lo mismo: 41,1 % y 41,0 %). Una corrección por dedo tampoco: ver abajo.

### Correcciones probadas, sin mejora (2026-11-11)
`scripts/guifir/evaluate.mjs` las reproduce. Evaluadas con validación cruzada en 5 grupos **por
canción** (35 canciones): cada lectura viene de una canción (guitarrista, guitarra, cámara) que la
corrección no vio. La división val/prueba de GuiFiR comparte canciones y 30 clips de validación
resultaron muy pocos: entrenada solo con ellos, la corrección mejoraba sus propios clips (de ~43 % a
~28 % de puntas en la cuerda equivocada) y nada en los de prueba.

| Corrección | Notas leídas exactas |
|---|---|
| Ninguna (la app) | 41,0 % |
| Regresión lineal por dedo desde la forma del dedo (articulaciones relativas a la punta, en el plano del mástil) | 40,5 % |
| Desvío fijo por dedo medido en los primeros 5 fotogramas de cada clip (como "pon un acorde conocido") | 28,9 % (vs 36,1 % de la app en esos mismos fotogramas) |

**Conclusión:** el error de MediaPipe en la punta no es un sesgo estable (ni por dedo, ni por
guitarrista, ni por cámara) que se pueda restar: cambia de un fotograma a otro con la pose de la
mano. Una corrección fija sobre los puntos de MediaPipe no lo arregla; haría falta una señal nueva
(micrófono) o reentrenar el modelo de mano (lo que hace GuiFiR, con ~29.000 fotogramas).
Matiz: GuiFiR son videos de YouTube con fingerpicking rápido; la app se usa con acordes quietos
frente a una webcam. Falta medir ese caso (paso 3, grabaciones propias).

### Lo que sí funcionó: refinador de punta sobre el diapasón aplanado (2026-11-12)
**Diagnóstico** (viendo los fotogramas de las grabaciones propias): MediaPipe acorta el dedo que se
estira hasta la cuerda lejana (en G, el dedo de la 6ª se lee en la 5ª), y las cuerdas están a solo
~9 px en un cuadro de 720p, menos que la precisión de un modelo de mano general.

**Probado y medido** (grabaciones propias: "dedos en su casilla"; GuiFiR: notas leídas con la mano hallada):

| Enfoque | Propias | GuiFiR |
|---|---|---|
| MediaPipe (la app antes) | 70 % | 56 % |
| Seguir el color de piel hasta el final del dedo | 57 % | no medido |
| Otro modelo de mano: RTMPose-m (rtmlib, sobre las cajas de MediaPipe) | 80 % | 64 % |
| MediaPipe + refinador | 83 % | 66 % |
| RTMPose + refinador | 91 % | 69 % |

**El refinador** (`scripts/refiner/`, `lib/fingerRefiner.ts`, `lib/fingerRefinerModel.ts`): la
calibración ya dice dónde está el mástil, así que el entorno de cada punta se remuestrea a una vista
canónica (x a lo largo del mástil, y a lo ancho, las seis cuerdas siempre en seis filas a 8 px) más
un canal guía que marca de qué dedo se pregunta. Una red convolucional pequeña (~630.000 parámetros,
2,5 MB) responde dónde presiona el dedo. Entrenada con las puntas etiquetadas de GuiFiR y con las
grabaciones propias, donde el acorde dice la cuerda de cada dedo sin etiquetar a mano.

**Evaluación honesta:** 5 grupos; cada uno se prueba en canciones de GuiFiR y en un acorde propio
que la red no vio. Puntas en la cuerda equivocada: GuiFiR 43 % → 31 %; propias 28 % → 11 %. El G
pasó de 0 % a 100 % (de frente y en 3/4) sin haber entrenado con ningún G.

**Regla del alambre** (`WIRE_SLACK = 0,15` en `lib/fretMapping.ts`): una punta medida sobre un
alambre, o apenas pasada, cuenta como el traste de atrás, porque los dedos pisan pegados al alambre.
Arregló el D (el dedo medio queda sobre el alambre 2). Neutral en GuiFiR.

**Acordes bien armados leídos bien** (grabaciones propias, pipeline completo, acorde no visto en el
entrenamiento): 56 % antes → 64 % solo con la regla del alambre → **85 %** con MediaPipe + refinador
→ 93 % con RTMPose + refinador. Los dos acordes armados mal a propósito nunca se aceptaron.

**En la app:** MediaPipe + refinador + regla del alambre. El modelo corre con onnxruntime-web (WASM,
en un worker, autoalojado en `public/onnxruntime/`); tarda ~0,4 s por respuesta en un hilo, así que
la respuesta se guarda como desvío respecto de la punta de MediaPipe y se aplica a los fotogramas
siguientes (`TipOffsets`). Si el modelo no carga, la revisión sigue con las puntas de MediaPipe.
Verificado repitiendo las grabaciones por el mismo código TypeScript de la app
(`REFINER=… node scripts/own-videos/evaluate.mjs`): 93 % con el modelo final (que ya vio esos
videos; la cifra honesta sigue siendo 85 %).

**Modo de alta precisión (2026-11-12):** opción "Precisión: Alta" en los ajustes de la cámara.
RTMPose-m hand (MMPose, Apache 2.0, 55 MB, `lib/rtmPose.ts`) vuelve a leer la mano que encontró
MediaPipe y el refinador entrenado con sus puntos corrige la punta; MediaPipe sigue la mano en cada
fotograma igual que antes. Se descarga solo al elegirlo. ~0,8 s por corrección en un hilo.
Repetición de las grabaciones por el código de la app con la demora real simulada (la respuesta
llega 0,4 s tarde en normal, 0,8 s en alta), modelos finales: normal 88 %, alta 94 % de acordes
bien armados leídos bien; los armados mal, nunca. Lo que más cambia: D con la otra toma, 11 % → 92 %.

**Pendiente:** probar el modo alto con la cámara real (fluidez y demora); más grabaciones (más acordes, tomas y personas); casos que aún fallan: dedo tapado por
la mano (meñique del G con otra toma).

**Licencia:** el modelo se entrenó en parte con GuiFiR (uso no comercial, investigación y
educación; citar doi:10.1109/ACCESS.2026.3713562). Mismo criterio que arriba si el plan premium cobra.

### Qué se podría reportar
Precisión (cuerda, traste) por dedo antes y después de la corrección, sobre GuiFiR y sobre las
grabaciones propias; confusión típica (¿siempre una cuerda hacia la 1ª?).
