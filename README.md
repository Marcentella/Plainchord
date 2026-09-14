# PlainChord

**Aprendizaje visual de guitarra, centralizado y gratuito.**

PlainChord centraliza en una sola pantalla lo que hoy está disperso entre múltiples sitios: diagramas de acordes, notación técnica de tablatura, y qué tan difícil es cada transición entre acordes. Sin cuentas obligatorias, sin muros de pago para lo esencial.

> Proyecto de Título — Ingeniería en Informática, INACAP. Desarrollado individualmente.

---

## El problema

Aprender guitarra por cuenta propia implica saltar entre fuentes no coordinadas: acordes en un sitio, tablaturas en otro, técnica explicada (o no) en video. La notación técnica suele explicarse en teoría, pero no en ejecución física real. Esto genera abandono — confirmado tanto por un levantamiento de información propio como por literatura académica existente sobre el tema ([Ruismäki, Juvonen & Lehtonen, 2012](https://www.sciencedirect.com/science/article/pii/S1877042812023105)).

## Qué incluye

- **Biblioteca de acordes** — ingresa una progresión, obtén todos los diagramas de digitación a la vez, generados desde datos estructurados.
- **Glosario de notación técnica** — explica símbolos de tablatura combinando definición simple con ejecución física real, no solo teoría.
- **Sistema de dificultad de transiciones** — clasificación objetiva de qué tan difícil es pasar de un acorde a otro.
- **Import de tablaturas propias** — el usuario trae su propia tablatura (texto plano o archivo Guitar Pro); PlainChord la visualiza, no la aloja ni la distribuye.
- **Modo claro/oscuro y paletas de color** predefinidas.
- **Modelo freemium** — todo lo anterior es gratuito. Funciones generativas (detección de acordes por audio) se ofrecen bajo un plan premium, actualmente marcado "próximamente".

## Filosofía de producto

PlainChord es una referencia objetiva, tipo wiki bien diseñada — no una aplicación adaptativa o gamificada. La dificultad de una transición es una propiedad fija de esa transición, no una recomendación personalizada. El usuario ve el dato y decide qué practicar.

## Stack técnico

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | Next.js (React + TypeScript) | Routing incluido, integración nativa con Vercel |
| Estilos | Tailwind CSS | Bajo overhead de setup para un desarrollo solo |
| Datos | JSON estructurado | Sin base de datos externa que mantener ni pagar |
| Hosting | Vercel | Despliegue con configuración mínima |
| Audio (exploratorio) | Meyda + Web Audio API | Procesamiento 100% en el navegador — privacidad y cero backend |
| Persistencia local | IndexedDB | Tablaturas importadas y preferencias, sin necesidad de cuenta |

## Empezar a desarrollar

```bash
git clone <url-del-repo>
cd plainchord
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Sobre el contenido y derechos de autor

PlainChord no aloja, indexa ni distribuye tablaturas de canciones protegidas por derechos de autor. Cualquier tablatura visualizada en la aplicación es importada voluntariamente por el propio usuario, bajo su responsabilidad — ver [Términos de Servicio](/terminos). La biblioteca de acordes y el glosario de notación son teoría musical básica (hechos, no expresión creativa) y no están sujetos a esta restricción.

## Estado del proyecto

En desarrollo activo. Ver `FEATURES.md` (no incluido en este repositorio público) para el detalle de fases y decisiones de alcance.

## Licencia

_Por definir._

## Documentos relacionados

- [Términos de Servicio](/terminos)
- [Política de Privacidad](/privacidad)
