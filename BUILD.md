# Desarrollo y build

El juego se sirve como HTML estático (`index.html`), pero todo el código de
`js/` está escrito como módulos ES separados (`js/main.js`, `js/modes/*.js`,
etc.) que se compilan en un único fichero `js/bundle.js` con **esbuild**.
`index.html` solo carga `js/bundle.js`, así que cualquier cambio en los
módulos fuente no se verá reflejado en el juego hasta que se regenere ese
bundle.

## Primer uso

Necesitas Node.js instalado. Luego, en la carpeta del proyecto:

```bash
npm install
```

## Compilar una vez

```bash
npm run build
```

Regenera `js/bundle.js` a partir de `js/main.js` y todo lo que importa.

## Regenerar automáticamente al guardar (modo watch)

```bash
npm run watch
```

Deja este comando corriendo en una terminal mientras editas: esbuild vigila
todos los ficheros de `js/` y reescribe `js/bundle.js` cada vez que guardas
un cambio. Solo tienes que refrescar el navegador (o usar la extensión
"Live Server" de tu editor / cualquier servidor estático con auto-reload)
para ver el resultado.

No hace falta un servidor especial para jugar: basta con abrir
`index.html` en el navegador (o servir la carpeta con cualquier servidor
estático) una vez `js/bundle.js` esté generado.
