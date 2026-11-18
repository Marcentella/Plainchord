# PlainChord

**Lo justo para empezar a tocar guitarra.**

Cuando uno recién empieza con la guitarra, el problema casi nunca es la falta de información. Es el exceso. Abres una página de acordes y aparecen veinte herramientas, afinadores, métricas, rachas y avisos, y todavía no sabes cuáles necesitas. PlainChord va por el lado contrario: te muestra lo que necesitas para la canción que quieres tocar, y el resto aparece cuando te hace falta.

Pruébalo en [plainchord.vercel.app](https://plainchord.vercel.app).

> Proyecto de título, Ingeniería en Informática, INACAP. Desarrollado de forma individual.

## Por qué existe

Aprender guitarra por tu cuenta suele significar saltar entre sitios que no conversan entre sí: los acordes en uno, la tablatura en otro, y la técnica explicada (cuando se explica) en algún video. Los símbolos de una tablatura casi siempre se definen en teoría, pero no te dicen qué hacer con la mano. Y cuando practicas solo, nadie te dice si pusiste bien los dedos. Mucha gente abandona en ese punto. Lo confirmé en una entrevista con una persona con formación en pedagogía musical, y coincide con lo que describe la literatura ([Ruismäki, Juvonen y Lehtonen, 2012](https://www.sciencedirect.com/science/article/pii/S1877042812023105)).

Juntar todo en un mismo lugar ayuda, pero no alcanza. Varias herramientas ya lo hacen y aun así abruman al primer vistazo. La diferencia que busca PlainChord es que se sienta tranquilo, y que además lo sea: menos ruido, información elegida con cuidado, y herramientas que aparecen recién cuando sirven.

## Qué puedes hacer

- **Escribir una progresión y ver todos los acordes.** Escribes `G D Em C` y aparecen los diagramas de digitación de cada uno, juntos en una pantalla.
- **Saber qué cambio te va a costar.** Entre cada par de acordes ves si el cambio es fácil, medio o difícil, para practicar primero el que más cuesta.
- **Explorar por tonalidad.** Eliges una tonalidad y ves sus acordes, qué papel cumple cada uno (reposo, preparación o tensión) y progresiones comunes que puedes escuchar y sumar a la tuya.
- **Tocar con la app escuchando.** Presionas "Tocar", el micrófono escucha, y cada acorde se marca cuando suena bien antes de iluminar el siguiente. No hay puntaje ni sonidos de premio: solo te dice "eso fue un D".
- **Revisar cómo pones los dedos.** Con la cámara apuntando al mástil, PlainChord compara cada dedo con el diagrama. Si además rasgueas, el micrófono revisa cuerda por cuerda y te dice cuál no sonó y qué dedo la está apagando.
- **Afinar.** Un afinador cromático con varias afinaciones alternativas, desde el menú.
- **Aprender lo básico.** Una guía corta, en orden, para leer un diagrama, leer una tablatura y entender lo que tocas.
- **Entender la notación.** Un glosario que explica cada símbolo de tablatura en dos partes: qué significa y cómo se hace con la mano.
- **Traer tu propia tablatura.** Pegas el texto o abres un archivo Guitar Pro, y PlainChord la dibuja, la reproduce con sonido real y la sigue con el cursor. Si no entiendes un símbolo, lo tocas y te explica qué es.
- **Usarlo a tu manera.** En español o inglés, con notación americana (C, D, E) o latina (Do, Re, Mi), en modo claro u oscuro y con cuatro paletas de color. Todo se puede usar con teclado, salvo la calibración de la cámara.

## Lo que dejamos fuera, a propósito

- **Cuentas obligatorias.** Todo funciona sin registrarte.
- **Anuncios.**
- **Rachas, puntos y recordatorios.** PlainChord no lleva la cuenta de tu progreso ni te escribe para que vuelvas.
- **Herramientas que todavía no necesitas.**

La dificultad de un cambio de acordes es un dato del cambio, no una nota sobre ti. Es la misma para todos y no se adapta a tu historial. Tú ves la información y decides qué practicar, como en una buena referencia, no como en un juego.

PlainChord es gratis y va a seguir siéndolo.

## Cómo está hecho

| Parte | Tecnología | Por qué |
|---|---|---|
| Aplicación | Next.js (React y TypeScript) | Rutas incluidas y despliegue directo en Vercel |
| Estilos | Tailwind CSS | Poco que configurar para un proyecto de una persona |
| Datos | JSON | Los acordes y el glosario son datos pequeños y estables; no hace falta una base de datos que mantener ni pagar |
| Tablaturas Guitar Pro | alphaTab | Solo como lector de archivos; el dibujo es propio |
| Sonido | alphaSynth con el soundfont Fluid R3 (MIT) | Reproducción en el navegador, recortado a los sonidos de guitarra |
| Afinador | Pitchy | Detecta una sola nota con precisión de cents |
| Detección de acordes | Meyda y Web Audio API | Reduce el audio a 12 notas y lo compara con cada acorde de la biblioteca |
| Cámara | MediaPipe Hand Landmarker y un refinador propio con ONNX Runtime Web | Ubica la mano en cada cuadro; el refinador corrige dónde presiona cada dedo |
| Guardado local | IndexedDB | Tus tablaturas importadas quedan en tu equipo, sin cuenta |
| Íconos | Phosphor | Se ven igual en cualquier sistema, a diferencia de los emoji |
| Hosting | Vercel | Despliegue con muy poca configuración |

Todo el audio y el video se procesan en tu navegador. No hay servidor que reciba lo que tocas ni lo que muestra tu cámara.

## Sobre las tablaturas y los derechos de autor

PlainChord no aloja, no indexa y no distribuye tablaturas de canciones con derechos de autor. Cada tablatura que ves la trajo el propio usuario, queda en su equipo y no se comparte con nadie (los detalles están en los Términos de Servicio, en `/terminos`). La biblioteca de acordes y el glosario son teoría musical básica: hechos, no obras creativas, así que no tienen esa restricción.

## Probarlo en tu equipo

Necesitas Node.js 22.18 o superior.

```bash
git clone https://github.com/Marcentella/Plainchord
cd Plainchord
npm install
npm run dev
```

Después abre [http://localhost:3000](http://localhost:3000). Las pruebas se corren con `node --test lib/*.test.ts i18n/*.test.ts`.

La cámara y el micrófono piden permiso al navegador, y el navegador solo lo da en `localhost` o con HTTPS.

## Estado

Versión del proyecto de título (noviembre de 2026). Las pruebas hechas con guitarra, cámara y usuarios reales están en [`docs/pruebas-manuales.md`](docs/pruebas-manuales.md), y lo que la cámara todavía no logra está en [`docs/camara-limitaciones.md`](docs/camara-limitaciones.md).

## Créditos

- Fluid R3 GM SoundFont, de Frank Wen y Toby Smithe (licencia MIT). La versión incluida conserva solo los sonidos de guitarra; el detalle está en `public/soundfont/LICENSE`.
- MediaPipe Hand Landmarker, de Google (licencia Apache 2.0).
- RTMPose, del proyecto MMPose de OpenMMLab (licencia Apache 2.0), para el modo de alta precisión de la cámara.
- Términos de Servicio y Política de Privacidad: `/terminos` y `/privacidad` dentro de la app.
