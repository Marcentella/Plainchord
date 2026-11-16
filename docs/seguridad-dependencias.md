# Seguridad de dependencias

Registro de las alertas de seguridad de dependencias (Dependabot en GitHub y `npm audit`): qué se revisó, si afecta a quien usa PlainChord, qué se hizo y qué queda pendiente. Una entrada por revisión, con fecha.

Criterio general: PlainChord procesa todo en el navegador y no tiene servidor propio con datos de usuarios, así que lo primero en cada alerta es ver si el código vulnerable llega al navegador del usuario o si solo corre en herramientas de desarrollo (lint, compilación).

---

## 2026-11-16

**Estado al revisar:** Dependabot mostraba 2 alertas abiertas (23 ya cerradas). `npm audit` mostraba además una tercera, aún no publicada en GitHub.

| Alerta | Gravedad | De dónde viene | ¿Llega al usuario? |
|---|---|---|---|
| minimatch: posible denegación de servicio con patrones glob (#26) | Moderada | `typescript-eslint` → `@typescript-eslint/typescript-estree` → minimatch 10.2.6. Solo herramientas de lint. | No. Solo corre al revisar el código propio con ESLint, con patrones que define el proyecto. |
| deepmerge: `mergeObject()` permite contaminar el prototipo del objeto devuelto (#25) | Baja | `meyda` 5.6.3 declara `@rollup/plugin-node-resolve` como dependencia normal (debería ser de desarrollo), y ese plugin trae deepmerge 4.3.1. | No. Es un plugin de empaquetado de Rollup; la app nunca lo ejecuta, y el código de detección de acordes no lo usa. |
| zod: consumo excesivo de memoria al validar colecciones muy grandes | Alta | `eslint-config-next` → `eslint-plugin-react-hooks` → zod 4.6.2. Solo herramientas de lint. | No. |

**Qué se hizo:**

- `npm audit fix` (solo actualizaciones compatibles, sin `--force`): zod 4.6.2 → 4.6.7 (alerta resuelta) y typescript-eslint 8.70.0 → 8.72.2, más ajustes menores de otras dependencias de lint. Solo cambió `package-lock.json`.
- Verificado después: ESLint da exactamente los mismos resultados que antes (31 errores y 60 avisos, todos previos a este cambio).

**Qué queda abierto y por qué:**

- **minimatch (#26):** el arreglo existe en minimatch 11.0.1 en adelante, pero la última versión de typescript-eslint (8.72.2) sigue pidiendo minimatch 10. Forzarlo con `overrides` arriesga romper el lint por un cambio de versión mayor, para un riesgo que solo existe en desarrollo. Se espera a que typescript-eslint publique una versión que use minimatch corregido; revisar con `npm audit` en la próxima sesión.
- **deepmerge (#25):** no hay versión corregida (todas las versiones desde la 4.2.0 están afectadas). La única "solución" que ofrece npm es bajar meyda a 5.6.2, lo que toca la librería de detección de acordes por un código que no se ejecuta. Se acepta el riesgo. En GitHub se puede descartar la alerta con el motivo "El código vulnerable no se usa realmente" (*Vulnerable code is not actually used*).
