# Omnifret

Aplicación web gratuita de aprendizaje visual de guitarra. Centraliza en una sola pantalla lo que hoy está disperso entre múltiples sitios: diagramas de acordes, notación técnica de tablatura, y qué tan difícil es cada transición entre acordes.

## El problema

Aprender guitarra por cuenta propia implica saltar entre fuentes no coordinadas: acordes en un sitio, tablaturas en otro, técnica explicada (o no) en YouTube. La notación técnica suele explicarse en teoría, pero no en ejecución física real (ej. cómo poner la mano en un acorde con cejilla).

## Filosofía de producto

Omnifret es una **referencia objetiva tipo wiki, no una app adaptativa/gamificada tipo Duolingo**. La dificultad de una transición entre acordes es una propiedad fija (cuánto se mueven los dedos, cambio de posición, etc.), no algo personalizado por usuario. No hay progreso individual rastreado ni "el sistema aprende de ti": el usuario ve el dato objetivo y decide qué practicar.

## Alcance del MVP

1. **Biblioteca de acordes** — el usuario ingresa una progresión (ej. "G - D - Em - C") y la app genera automáticamente los diagramas de digitación de todos los acordes en una sola vista.
2. **Glosario de notación técnica** — explica símbolos de tablatura (bend, hammer-on, pull-off, slide, pinch harmonic, etc.) con definición simple + consejo de ejecución física concreta.
3. **Sistema de dificultad de transiciones** — etiqueta objetiva (fácil/media/difícil) para cada par de acordes consecutivos.
4. **Freemium** — todo lo anterior es 100% gratis. Existe una página de planes con un tier "Premium — próximamente" (sin cobro real todavía).

Fuera de alcance por ahora: cuentas obligatorias, procesamiento de pagos real, personalización por usuario, guía de tono/amplificador, contribución comunitaria vía backend.

## Componente exploratorio (I+D)

Detección automática de acordes a partir de audio, usando **Meyda** para extracción de chroma features vía Web Audio API, procesado enteramente en el navegador (sin backend, sin subir audio a un servidor).

## Stack técnico

- **Next.js (React + TypeScript)**
- **Tailwind CSS**
- **Datos como JSON estructurado**, sin base de datos externa
- **Vercel** para despliegue
- **Meyda** para el componente de audio

## Contexto

Proyecto de Título individual — Ingeniería en Informática, INACAP - Sede Maipú.

Más detalle de producto, historias de usuario y decisiones en `CONTEXT.md` (no versionado).
