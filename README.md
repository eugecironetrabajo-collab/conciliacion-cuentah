# Conciliación Cuenta H

Aplicación web para conciliar movimientos bancarios de Cuenta H contra el mayor contable. La importación y la conciliación son operaciones deliberadamente separadas: cargar un archivo nunca cambia el estado de una partida.

Las pantallas disponibles son **Resumen**, **Movimientos**, **Conciliar**, **Importar**, **Reportes** y **Auditoría**.

## Resumen

El panel general muestra contadores de partidas pendientes y conciliaciones realizadas.

La tabla **Saldos de la cuenta** presenta banco y libros por separado; no se suman entre sí. Solo incluye partidas pendientes (excluye conciliadas y eliminadas). Use el selector **Terminal** para ver saldos filtrados por código de dealer (por ejemplo `1337` o `3550`); sin filtro se muestra el saldo general de todas las terminales.

La sección de actividad reciente lista las últimas partidas incorporadas, con acceso rápido a **Movimientos**.

## Conciliar

1. Importe el listado bancario y el mayor contable desde **Importar**.
2. Abra **Conciliar** cuando quiera trabajar con las partidas pendientes.
3. Haga doble clic sobre cada fila que quiera trasladar al cuadrante inferior, o ejecute **Búsqueda automática**.
4. Prepare grupos 1:1, 1:N o N:1 y devuelva líneas individualmente si necesita corregir la selección.
5. Use **Confirmar conciliación** para registrar todo el cuadrante inferior como un único grupo numerado.
6. Si los débitos y créditos no compensan, explique la diferencia. El sistema creará el débito o crédito contable necesario y lo incorporará al grupo.

### Filtros y selección

Antes de trabajar con los cuadrantes puede filtrar por banco/terminal, sector, rango de fechas y concepto en observaciones. Use **Buscar partidas** para aplicar los filtros.

Para mover varias líneas a la vez, selecciónelas con clic y presione Enter o use los botones **Bajar selección** / **Subir selección**. El separador entre cuadrantes se puede arrastrar para ajustar la altura de cada zona.

### Orden y columnas

En las grillas de Conciliar puede ordenar cualquier columna con doble clic en el encabezado (la primera vez ordena descendente en importes y ascendente en fechas y texto). Arrastre el borde de un encabezado para cambiar el ancho de la columna; doble clic en el borde ajusta el ancho al contenido. Los anchos se guardan en el navegador.

## Movimientos

Permite combinar banco/terminal, sector, orden, comprobante, Ref. 1, Ref. 2, rangos de fecha de movimiento y de proceso, importe desde/hasta, origen, signo y estado.

La columna **Terminal** muestra el código de dealer asociado a cada partida. En partidas pendientes puede asignar un **Responsable** desde el desplegable (opciones predefinidas u "Otro…"); en conciliadas y eliminadas el responsable es solo lectura.

Puede ordenar cualquier columna con doble clic en el encabezado. Las acciones masivas permiten eliminar lógicamente partidas pendientes (indicando un motivo), restaurarlas o borrarlas definitivamente según las restricciones de cada estado.

Al hacer doble clic sobre una partida conciliada se abre el grupo completo con su número, totales y línea de ajuste. Desde el detalle se puede preparar una reversión. La conciliación es indivisible: todas las partidas originales vuelven a pendientes, la línea de ajuste se anula y el grupo permanece en el historial con el motivo de la reversión.

## Importar

Las partidas importadas quedan pendientes. La conciliación nunca se ejecuta automáticamente.

### Movimientos bancarios

Se aceptan archivos TXT, CSV, XLS y XLSX. Los TXT de Cuenta H son de ancho fijo en Windows-1252. Se leen únicamente las líneas de la cuenta `41110100`, con fecha `F.Valor` (`AAMMDD`), documento, tipo, detalle e importes. Puede seleccionar varios archivos juntos: un movimiento repetido entre archivos se guarda una sola vez.

También se puede importar el **resumen terminal** en XLS o XLSX. Ese formato solo agrega partidas que aún no existen en el sistema. Si el mismo movimiento ya fue cargado por TXT (o viceversa), el sistema conserva una sola copia pendiente.

### Mayor contable

El mayor contable es la exportación de Quiter en XLS, XLSX, TXT o CSV (hoja `Informe` en Excel). Se importan las filas de movimientos y se omiten saldos, títulos y separadores. Las columnas usadas son `Fecha`, `Referencia`, `Concepto del apunte`, `Nro.docum`, `Debe`, `Haber` y `Cta.pers.`.

Volver a importar un archivo no duplica movimientos ni ejecuta la conciliación.

## Reportes

Desde **Reportes** puede descargar un CSV de movimientos filtrados por estado, origen y rango de fechas. El archivo es compatible con Excel e incluye importes, referencias y el responsable asignado.

## Auditoría

**Auditoría** muestra el historial de las últimas acciones registradas: conciliaciones, reversiones, asignaciones de responsable y otras operaciones relevantes.

## Convenciones de interfaz

| Acción | Dónde |
|---|---|
| Doble clic en fila | Conciliar: mover entre cuadrantes; Movimientos: abrir conciliación |
| Doble clic en encabezado | Ordenar columna |
| Arrastrar borde de columna | Cambiar ancho (Conciliar) |
| Doble clic en borde de columna | Autofit al contenido (Conciliar) |

## Desarrollo

Requiere Node.js 22 o posterior.

```bash
npm install
npm run dev
```

- Web: `http://127.0.0.1:43127`
- API: `http://127.0.0.1:43128`
- Base local: `data/conciliacion.db`

La primera ejecución carga un juego de demostración. Para usar otra base:

```bash
DB_PATH=/ruta/cuenta-h.db npm run dev
```

## Comandos

```bash
npm run check      # tipos
npm test           # pruebas unitarias
npm run build      # build de producción
npm run test:e2e   # Playwright
```

En producción, después de `npm run build`, ejecute `npm start`.
