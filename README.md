# Sello

Agrega tu nombre y la fecha y hora en que se tomó cada foto como marca de agua. La fecha se lee de los metadatos EXIF de la imagen. Todo se procesa en el navegador; las fotos nunca se suben a ningún servidor.

Hecho con Vue 3 + Vite, [exifr](https://github.com/MikeKovarik/exifr) para leer metadatos y JSZip para descargas múltiples.

## Desarrollo

```bash
npm install
npm run dev      # abre la URL de red en tu teléfono (mismo WiFi)
npm run build    # genera dist/
```

## Publicación

Cada push a `main` se publica automáticamente en GitHub Pages mediante `.github/workflows/deploy.yml`.
