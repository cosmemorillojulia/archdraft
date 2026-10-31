---
name: commit-message
description: Convención de commits del proyecto. Usar siempre que se vaya a sugerir un commit tras implementar o modificar algo - tipo convencional (feat, fix, chore, docs...), mensaje en inglés y git add solo de los archivos concretos del cambio.
---

# Commits

## Regla de oro

Nunca ejecutes comandos de git que escriban (add, commit, push, merge...). Solo sugiere la línea para que el usuario la ejecute.

## Configuración recomendada

Para que todos los merges del repo creen siempre un commit de merge (`--no-ff`) y se conserve la historia de cada rama, el usuario debe ejecutar una vez en el repo:

```powershell
git config merge.ff false
```

Es una configuración local (`.git/config`): no se sube a GitHub y hay que repetirla en cada clon. Si al sugerir un merge no consta que esté aplicada, recuérdalo.

## Commits atómicos

Cada commit corresponde a **una única funcionalidad o cambio concreto**, sin mezclar funcionalidades distintas.

- **Una sola razón de ser:** si el mensaje necesita un "y" para describir el commit, probablemente son dos commits.
- **Autocontenido:** el proyecto debe compilar y pasar los tests en cada commit. El código y sus tests van juntos en el mismo commit.
- **Ni demasiado pequeño:** no separes lo que forma una unidad. Un renombrado y sus usos, o una función y su test, van juntos. Evita commits de una línea suelta, de "arreglo el typo del commit anterior" o de código a medias.
- **Ni demasiado grande:** no acumules varias funcionalidades, un refactor y un arreglo en un mismo commit. Si el diff cuesta de revisar de un vistazo, divídelo.
- **Cada tipo por separado:** un `refactor`, un `fix` y un `feat` nunca comparten commit, aunque salgan de la misma tarea.
- **Orden lógico:** si una tarea da varios commits, sugiérelos en el orden en que deben aplicarse (primero la preparación o el refactor, después la funcionalidad).

Cuando una tarea produzca varios commits, entrega una línea por commit, cada una con su propio `git add`.

## Formato del mensaje

```
<tipo>(<ámbito opcional>): <descripción>
```

- Siempre en **inglés**, una sola línea, profesional y positivo.
- Verbo en imperativo y minúscula, sin punto final: `add`, `fix`, `route`, `split`.
- Describe el cambio realizado, no el proceso. Máximo ~72 caracteres.
- El ámbito es opcional; en este monorepo se usa para distinguir paquetes (`web`, `core`, `layout`).

## Tipos

| Tipo       | Cuándo                                                |
| ---------- | ----------------------------------------------------- |
| `feat`     | Funcionalidad nueva para el usuario                   |
| `fix`      | Corrección de un error                                |
| `docs`     | Solo documentación                                    |
| `chore`    | Mantenimiento: configuración, Makefile, dependencias  |
| `refactor` | Cambio de código sin alterar el comportamiento        |
| `test`     | Añadir o corregir tests                               |
| `style`    | Formato, sin cambios de lógica                        |
| `perf`     | Mejora de rendimiento                                 |
| `build`    | Sistema de build o dependencias externas              |
| `ci`       | Workflows de CI/CD                                    |

Si el cambio rompe compatibilidad, añade `!` tras el tipo: `feat(core)!: rename the export format`.

## Qué añadir con `git add`

**Nunca `git add .`**. Lista solo los archivos que forman parte de este cambio:

1. Identifica los archivos tocados en esta tarea (los que has creado o editado tú).
2. Si dudas, comprueba con `git status --short` qué hay modificado y descarta lo que no pertenezca al cambio.
3. Si hay cambios sin relación en el árbol de trabajo, no los incluyas y avísalo.
4. Si el cambio mezcla funcionalidades o tipos distintos (por ejemplo una feature y un arreglo no relacionado), propón **commits separados** según la sección de commits atómicos, cada uno con su propio `git add`.
5. Si un mismo archivo contiene cambios de dos commits distintos, avísalo: el usuario puede separarlos con `git add -p`.

## Formato de la sugerencia

Una línea lista para copiar en PowerShell 5.1, con `;` como separador (no `&&`):

```powershell
git add apps/web/src/Editor.tsx apps/web/src/Editor.test.tsx ; git commit -m "feat(web): add keyboard shortcuts to the editor"
```

- Usa rutas relativas a la raíz del repo con `/`.
- Si el cambio toca muchos archivos de una misma carpeta, puedes añadir la carpeta concreta (`git add packages/core/src/`), pero nunca la raíz.
- Si el mensaje lleva comillas dobles dentro, escápalas o reformula para evitarlas.

## Antes de sugerir

- El commit es atómico: una sola funcionalidad, ni trivial ni sobredimensionada.
- El mensaje describe todo lo que incluye el `git add`, y nada más.
- El tipo coincide con la tabla.
- Está en inglés.
