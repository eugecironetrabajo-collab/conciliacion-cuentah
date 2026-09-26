# Conciliación Cuenta H

Aplicación web para conciliar movimientos bancarios de Cuenta H contra el mayor contable. La importación y la conciliación son operaciones deliberadamente separadas: cargar un archivo nunca cambia el estado de una partida.

## Flujo principal

1. Importe el listado bancario y el mayor contable desde **Importar**.
2. Abra **Conciliar** cuando quiera trabajar con las partidas pendientes.
3. Seleccione una fila bancaria y una contable, o ejecute **Búsqueda automática**.
4. Revise las parejas trasladadas al cuadrante inferior. Puede devolver cualquier pareja arriba.
5. Use **Confirmar conciliación** para registrar el lote definitivamente.

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

Se aceptan `.txt`, `.csv`, `.xls` y `.xlsx`. Los encabezados se reconocen mediante alias, entre ellos:

- `Fecha`, `Fecha proc.`, `Comprobante`, `Sector`, `Orden`
- `Ref. 1`, `Ref. 2`
- `Débitos Libros`, `Créditos Bancos`, `Débitos Bancos`, `Créditos Libros`
- `Observaciones`, `Banco` o `Dealer`

TXT y CSV pueden estar separados por punto y coma, tabulación o coma. Fechas admitidas: `DD/MM/AAAA` o `AAAA-MM-DD`. Los duplicados se omiten.

## Comandos

```bash
npm run check      # tipos
npm test           # pruebas unitarias
npm run build      # build de producción
npm run test:e2e   # Playwright
```

En producción, después de `npm run build`, ejecute `npm start`.
