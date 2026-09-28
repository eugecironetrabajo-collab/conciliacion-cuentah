# Conciliación Cuenta H

Aplicación web para conciliar movimientos bancarios de Cuenta H contra el mayor contable. La importación y la conciliación son operaciones deliberadamente separadas: cargar un archivo nunca cambia el estado de una partida.

## Flujo principal

1. Importe el listado bancario y el mayor contable desde **Importar**.
2. Abra **Conciliar** cuando quiera trabajar con las partidas pendientes.
3. Haga doble clic sobre cada fila que quiera trasladar al cuadrante inferior, o ejecute **Búsqueda automática**.
4. Prepare grupos 1:1, 1:N o N:1 y devuelva líneas individualmente si necesita corregir la selección.
5. Use **Confirmar conciliación** para registrar todo el cuadrante inferior como un único grupo numerado.
6. Si los débitos y créditos no compensan, explique la diferencia. El sistema creará el débito o crédito contable necesario y lo incorporará al grupo.

## Consulta y reversión

**Movimientos** permite combinar banco, sector, orden, comprobante, referencias, rangos de fecha e importe, origen, signo y estado. Al hacer doble clic sobre una partida conciliada se abre el grupo completo con su número, totales y línea de ajuste.

Desde el detalle se puede preparar una reversión. La conciliación es indivisible: todas las partidas originales vuelven a pendientes, la línea de ajuste se anula y el grupo permanece en el historial con el motivo de la reversión.

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

## Formatos de importación

Los TXT bancarios de Cuenta H son archivos de ancho fijo en Windows-1252. Se leen únicamente las líneas de la cuenta `41110100`, con fecha `F.Valor` (`AAMMDD`), documento, tipo, detalle e importes. Puede seleccionar varios TXT juntos: un movimiento repetido entre archivos se guarda una sola vez.

El mayor contable es el Excel de Quiter (hoja `Informe`). Se importan las filas de movimientos y se omiten saldos, títulos y separadores. Las columnas usadas son `Fecha`, `Referencia`, `Concepto del apunte`, `Nro.docum`, `Debe`, `Haber` y `Cta.pers.`.

También se aceptan CSV delimitados para cargas auxiliares. Volver a importar un archivo no duplica movimientos ni ejecuta la conciliación. Desde **Movimientos** se pueden eliminar lógicamente partidas pendientes, indicando un motivo, y restaurarlas después.

## Comandos

```bash
npm run check      # tipos
npm test           # pruebas unitarias
npm run build      # build de producción
npm run test:e2e   # Playwright
```

En producción, después de `npm run build`, ejecute `npm start`.
