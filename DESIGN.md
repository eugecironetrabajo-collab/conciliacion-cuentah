# DESIGN.md — MEC (Método Externo de Conciliación)

Guía de diseño visual para Cursor. Define cómo debe verse la interfaz de MEC, un sistema que concilia la contabilidad de una concesionaria de autos contra la cuenta corriente de las terminales Peugeot y Citroën.

> Los valores de color y tamaño de este documento se estimaron a partir de capturas de pantalla. **Si el código ya define variables, tokens o valores propios, usá esos y tratá este documento como referencia.** No dupliques ni reemplaces lo que ya existe.

---

## 0. REGLA DE ORO: aplicar este documento NO debe alterar el funcionamiento

Este documento es **solo de presentación**. Aplicarlo no puede cambiar el comportamiento de la app en ningún caso.

### Permitido
- Editar CSS, hojas de estilo, variables CSS, tokens de tema y clases utilitarias de estilo.
- Cambiar textos visibles de marca (ver sección 1).
- Agregar clases de estilo a elementos existentes.

### Prohibido
- Tocar lógica de negocio, handlers de eventos, llamadas a API, consultas, modelos de datos, validaciones o rutas.
- Renombrar o eliminar `id`, `name`, `data-*`, `aria-*`, `for`, `class` o atributos que el JavaScript, los tests o los selectores usen. Antes de quitar o renombrar una clase, buscá si se referencia en JS, tests o selectores.
- Cambiar la estructura del DOM (anidar, mover, quitar o reordenar elementos) si algún script, test o selector depende de ella.
- Cambiar el formato de números, fechas o signos. El formato `es-AR` actual (ver sección 8) es funcional y se conserva tal cual.
- Renombrar archivos, carpetas, variables, funciones, tablas, columnas, nombres de base de datos (por ejemplo `conciliacion.db`), nombres de paquete o variables de entorno.
- Agregar dependencias o librerías sin consultar antes.
- Cambiar comportamientos como el doble clic sobre una línea conciliada, los filtros, la selección múltiple o los estados de botones deshabilitados.

### Cómo trabajar
1. Aplicá los cambios por capas: primero tokens y variables, después tipografía, luego componentes, una pantalla a la vez.
2. Después de cada capa, verificá que la app compila y que los tests existentes siguen pasando.
3. Si un cambio visual exige modificar estructura o lógica, **frená y consultá**. No lo resuelvas por tu cuenta.
4. Preferí cambios chicos y fáciles de revertir (un commit por capa).

---

## 1. Identidad de marca: SYC pasa a MEC

El producto se llama **MEC**, sigla de **Método Externo de Conciliación**.

| Dónde | Antes | Ahora |
|---|---|---|
| Wordmark del header | `SYC` | `MEC` |
| Letra del isotipo (cuadrado dorado) | `S` | `M` |
| Breadcrumb (arriba a la derecha) | `SYC / CUENTA H` | `MEC / CUENTA H` |
| `<title>` de la página | contiene SYC | `MEC — Método Externo de Conciliación` |
| Nombre completo | — | "Método Externo de Conciliación", en título de pestaña, pantalla de acceso, "Acerca de" y `aria-label` del logo |

Reglas del cambio de nombre:
- Es un cambio **solo de texto visible**. Buscá `SYC` en strings de interfaz, plantillas y títulos. **No** lo reemplaces en nombres internos (variables, rutas, clases, claves, base de datos, nombres de paquete, comentarios técnicos).
- Si el isotipo es una imagen o SVG, reemplazalo por una versión equivalente con la letra "M", **con el mismo tamaño, la misma ruta y el mismo nombre de archivo**, para no romper referencias.
- El subtítulo "CONCILIACIONES CUENTA H" bajo el wordmark se mantiene.

---

## 2. Principios visuales

El estilo es **corporativo pero amable**: serio donde hay dinero, cálido donde hay personas.

1. **Confianza primero.** Es una herramienta contable. Los números deben leerse sin esfuerzo y sin ambigüedad.
2. **Calidez medida.** El dorado y las esquinas suavemente redondeadas aportan amabilidad. No se usan sombras pesadas ni colores estridentes.
3. **Aire.** Espacios generosos entre bloques. Una pantalla densa en datos no debe sentirse apretada.
4. **Jerarquía clara.** Eyebrow, título, subtítulo y contenido siempre en ese orden y con esos pesos.
5. **El color informa.** Rojo, verde, ámbar y azul tienen significado fijo (sección 4). No se usan como decoración.
6. **Consistencia.** Un mismo elemento se ve igual en todas las pantallas.

---

## 3. Tokens de diseño

Valores aproximados. Si ya existen en el código, mapealos a los existentes en lugar de crear nuevos.

```css
:root {
  /* Marca: petróleo */
  --mec-primary-900: #0d3845;
  --mec-primary-700: #124857;
  --mec-primary-600: #1a5a6b;
  --mec-primary-100: #d9ebee;
  --mec-primary-50:  #e6f0f2;

  /* Acento: dorado */
  --mec-accent-300: #e9c25a;
  --mec-accent-500: #e0a21f;
  --mec-accent-700: #8a5f00;

  /* Superficies */
  --mec-bg-page:     #ecf0f1;
  --mec-surface:     #ffffff;
  --mec-surface-alt: #f4f7f8;
  --mec-border:      #d7dee1;
  --mec-border-soft: #e6ebed;

  /* Texto */
  --mec-text:        #12333d;
  --mec-text-soft:   #5b6b72;
  --mec-text-muted:  #8a979c;
  --mec-text-on-dark:#ffffff;

  /* Semánticos */
  --mec-danger:      #b3200f;
  --mec-danger-bg:   #fbe9e6;
  --mec-success:     #1f8a5b;
  --mec-success-bg:  #e3f3ec;
  --mec-warning-text:#7a5200;
  --mec-warning-bg:  #fbebb8;
  --mec-info:        #3b5bdb;
  --mec-info-bg:     #e6ecfb;

  /* Radios */
  --mec-radius-sm: 4px;
  --mec-radius-md: 6px;
  --mec-radius-pill: 999px;

  /* Espaciado: base 4px */
  --mec-space-1: 4px;
  --mec-space-2: 8px;
  --mec-space-3: 12px;
  --mec-space-4: 16px;
  --mec-space-5: 24px;
  --mec-space-6: 32px;

  /* Sombras: muy sutiles */
  --mec-shadow-nav: 0 2px 6px rgba(13, 56, 69, 0.08);
}
```

---

## 4. Significado de los colores

| Color | Uso | Ejemplo |
|---|---|---|
| Petróleo | Marca, acciones principales, títulos | Header, "Abrir conciliación", "Buscar partidas" |
| Dorado | Acento cálido y orientación | Isotipo, avatar, pestaña activa, eyebrow |
| Rojo | Importes negativos y errores | `$ -308.131.200,46` |
| Verde | Conciliado, operativo, éxito | Punto "Sistema operativo", ícono de conciliaciones |
| Ámbar | Pendiente, requiere atención | Pill `PENDIENTE` |
| Azul | Información neutra | Ícono de partidas pendientes |

No uses rojo para algo que no sea negativo o error, ni verde para algo que no sea correcto o completo.

---

## 5. Tipografía

Se combinan dos familias: una sans legible para la interfaz y una serif para la marca y las cifras destacadas, que aporta el toque institucional y amable.

| Rol | Familia | Tamaño | Peso | Notas |
|---|---|---|---|---|
| Wordmark `MEC` | Serif (Georgia o similar) | 22–24px | 700 | Mayúsculas, sobre fondo oscuro |
| Subtítulo de marca | Sans | 10–11px | 500 | Mayúsculas, `letter-spacing: .1em` |
| Eyebrow (`PANEL GENERAL`) | Sans | 11px | 700 | Mayúsculas, `letter-spacing: .12em`, color acento 700 |
| Título de página (H1) | Sans | 30–34px | 700 | Color petróleo, interlineado ajustado |
| Subtítulo de página | Sans | 13–14px | 400 | `--mec-text-soft` |
| Título de panel | Sans | 14–15px | 700 | `--mec-text` |
| Cifra destacada (KPI) | Serif | 28–32px | 700 | Color petróleo |
| Encabezado de tabla | Sans | 11px | 600 | Mayúsculas, `letter-spacing: .06em`, `--mec-text-soft` |
| Cuerpo y celdas | Sans | 13–14px | 400 | |
| Etiqueta de filtro | Sans | 10–11px | 700 | Mayúsculas, `letter-spacing: .08em` |
| Ayudas | Sans | 11–12px | 400 | `--mec-text-muted` |

- Fuente sans: usá la ya definida en el proyecto. Si no hay una, el stack del sistema (`"Segoe UI", system-ui, -apple-system, sans-serif`).
- Todas las columnas y cifras de importes usan `font-variant-numeric: tabular-nums` para que los dígitos se alineen.

---

## 6. Layout y espaciado

- Fondo de página `--mec-bg-page`. Contenido en bloques blancos con borde fino.
- Orden fijo de cada pantalla: **eyebrow → H1 → subtítulo → contenido**. La acción principal de la pantalla va a la derecha, alineada con el título.
- Margen horizontal de página: 24–32px. Separación vertical entre bloques: 16–24px.
- Padding interno de paneles: 16–24px.
- Las tablas ocupan todo el ancho del panel. Los importes se alinean a la derecha.
- Los filtros se organizan en una grilla de columnas iguales que se reacomoda en pantallas angostas.

---

## 7. Componentes

### 7.1 Header (barra superior)
- Fondo petróleo oscuro, con degradado sutil de `--mec-primary-700` a `--mec-primary-900`.
- Izquierda: isotipo (cuadrado dorado redondeado con "M" serif) + wordmark `MEC` + subtítulo.
- Centro: bloque "EMPRESA ACTIVA" con etiqueta pequeña en mayúsculas y el nombre de la empresa en blanco y bold. Al lado, la cuenta y moneda en tamaño menor.
- Derecha: indicador "Sistema operativo" (punto verde + texto), bloque "BASE ACTIVA", y avatar circular dorado con iniciales junto al nombre de usuario.
- Un separador vertical tenue divide los bloques.

### 7.2 Navegación por pestañas
- Barra blanca con `--mec-shadow-nav`. Cada pestaña lleva un ícono pequeño + etiqueta en peso 600.
- Pestaña activa: fondo `--mec-primary-50` y subrayado de 3px en `--mec-accent-500`.
- Hover: fondo `--mec-primary-50` más tenue. Foco de teclado visible (ver sección 10).
- A la derecha de la barra, el breadcrumb `MEC / CUENTA H` en mayúsculas, color muted.

### 7.3 Encabezado de página
Eyebrow dorado oscuro, H1 petróleo, subtítulo gris. El botón principal queda a la derecha.

### 7.4 Botones
| Tipo | Estilo |
|---|---|
| Primario | Fondo `--mec-primary-700`, texto blanco, peso 700, radio 4px. Hover: `--mec-primary-600`. Puede llevar flecha `→`. |
| Secundario | Fondo blanco, borde `--mec-border`, texto `--mec-text`. Hover: fondo `--mec-surface-alt`. |
| Enlace de acción | Texto petróleo en bold dentro de tablas ("Conciliar", "Ver todas →"), sin fondo. Subrayado en hover. |
| Deshabilitado | Texto `--mec-text-muted`, borde tenue, sin hover, cursor `not-allowed`. |

Mantené siempre el mismo orden de botones: secundario a la izquierda, primario a la derecha.

### 7.5 Tarjetas KPI
- Panel blanco con borde, radio 6px, padding 16–20px.
- A la izquierda, un recuadro de ícono de 48px con radio 8px:
  - Azul suave (`--mec-info-bg`) para **Partidas pendientes**.
  - Verde suave (`--mec-success-bg`) para **Conciliaciones**.
- Etiqueta en gris, cifra grande en serif petróleo, ayuda corta en muted debajo.

### 7.6 Tablas
- Panel blanco con borde. Encabezado del panel: título en bold + descripción pequeña en muted.
- Fila de encabezado de columnas: fondo `--mec-surface-alt`, texto pequeño en mayúsculas.
- Filas: separador `--mec-border-soft`, altura cómoda (40–44px). Hover con fondo `--mec-surface-alt`.
- Filas de total o saldo (por ejemplo "Saldo banco", "Saldo libros"): fondo `--mec-surface-alt`, texto bold.
- Importes alineados a la derecha. Los negativos se muestran en `--mec-danger` y bold.
- Los conceptos con signo contable muestran `(+)` o `(–)` por delante, en bold.

### 7.7 Formulario de filtros
- Panel blanco. Cada campo lleva una etiqueta pequeña en mayúsculas encima.
- Inputs y selects: fondo blanco, borde `--mec-border`, radio 4px, altura ~34–36px. El placeholder va en muted.
- Foco: borde petróleo y anillo suave (ver sección 10).
- Radios y casillas con color de acento petróleo.
- Acciones del formulario a la derecha: "Limpiar" (secundario) y "Buscar partidas" (primario).

### 7.8 Pills y badges
| Elemento | Estilo |
|---|---|
| `PENDIENTE` | Pill redondeada, fondo `--mec-warning-bg`, texto `--mec-warning-text`, mayúsculas, bold |
| `CONCILIADO` | Pill con fondo `--mec-success-bg`, texto verde oscuro |
| `ELIMINADO` | Pill gris suave, texto `--mec-text-soft` |
| `BANCO` / `CONTABILIDAD` | Badge pequeño, fondo `--mec-primary-100`, texto petróleo, radio 4px |

### 7.9 Selector de responsable dentro de la tabla
Select compacto con borde fino y flecha. El estado "Sin asignar" va en muted para distinguirlo de una asignación real.

---

## 8. Datos financieros

- **Conservá el formato actual `es-AR`:** miles con punto, decimales con coma, símbolo `$` delante. Ejemplo: `$ 275.840.481,92`.
- **No cambies el signo ni la forma en que se muestra un negativo.** Solo se colorea (rojo y bold). Nunca se pasa a paréntesis ni se oculta el signo.
- Las fechas siguen en `dd/mm/aaaa`.
- Cuando se muestran dos saldos, el de banco y el de libros, se mantienen **separados**. El subtítulo ya aclara que "no se suman entre sí". No agregues totales que los combinen.
- Los importes nunca se truncan ni se redondean visualmente. Si no entran en la celda, la columna se ensancha.

---

## 9. Tono de los textos

- Tratamiento formal y cercano, en imperativo de "usted", como ya está en la app: "Combine filtros y abra una línea…". **No uses voseo.**
- Frases cortas, claras y sin jerga técnica innecesaria.
- Explicá qué ocurre y qué sigue ("Requieren revisión", "0 partidas procesadas").
- Los textos de error dicen qué pasó y cómo seguir, sin culpar a quien usa el sistema.
- No cambies textos funcionales (nombres de columnas, etiquetas de filtros, estados) salvo el cambio de marca de la sección 1.

---

## 10. Accesibilidad

- Contraste de texto mínimo AA (4.5:1) sobre su fondo. Verificá en particular el texto muted sobre blanco y el eyebrow dorado.
- Los estados nunca dependen solo del color: las pills llevan texto, y los negativos llevan signo.
- Foco de teclado siempre visible: `outline: 2px solid var(--mec-primary-700); outline-offset: 2px;`.
- Áreas clicables de al menos 32px de alto.
- Conservá todos los atributos `aria-*`, `label`/`for` y roles existentes.
- Respetá `prefers-reduced-motion`: transiciones de 120–180ms como máximo, sin animaciones llamativas.

---

## 11. Qué NO hacer

- No agregar sombras pesadas, degradados fuertes ni efectos de vidrio.
- No usar más de un color de acento (el dorado) además del petróleo.
- No mezclar radios: 4px para controles, 6px para paneles, pill para estados.
- No introducir una nueva fuente sin consultar.
- No colorear importes positivos de verde. Solo los negativos llevan color.
- No usar mayúsculas en textos largos. Solo en etiquetas, eyebrows, encabezados de tabla y pills.
- No cambiar el diseño de una pantalla que no se haya pedido explícitamente.

---

## 12. Plan de aplicación sugerido

1. Declarar los tokens de la sección 3 (o mapearlos a los existentes).
2. Aplicar la tipografía (sección 5).
3. Header y navegación, incluido el cambio de marca SYC → MEC.
4. Encabezado de página, botones y tarjetas KPI.
5. Tablas, pills y badges.
6. Formulario de filtros.
7. Revisión de accesibilidad y contraste.

### Checklist de verificación antes de cerrar cada capa
- [ ] La app compila y arranca sin errores nuevos en consola.
- [ ] Los tests existentes pasan.
- [ ] Filtros, búsqueda, selección, conciliar, eliminar, restaurar y doble clic funcionan igual que antes.
- [ ] Importes, signos y fechas se ven con el mismo formato que antes.
- [ ] No se renombró ningún `id`, `name`, `data-*`, ruta, archivo ni variable.
- [ ] "SYC" solo se reemplazó en textos visibles y no en identificadores internos.
- [ ] El diff contiene únicamente cambios de estilo y de textos de marca.
